import os from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from '../config.js';
import { createBlockingClient, keys } from '../redis.js';
import { enrichClick } from '../utils/enrich.js';
import { logger } from '../utils/logger.js';
import { persistClicks } from './clickService.js';
import { bumpStatsVersion } from './linkService.js';

const STREAM = keys.clickStream;
const GROUP = keys.clickGroup;
const CLAIM_IDLE_MS = 60_000; // mensajes de un consumidor caído que se reasignan

function fieldsToObject(fields) {
  const obj = {};
  for (let i = 0; i < fields.length; i += 2) obj[fields[i]] = fields[i + 1];
  return obj;
}

/**
 * Consumidor del Redis Stream de clics (consumer group: varias instancias pueden
 * repartirse el trabajo). Garantiza entrega "al menos una vez": solo confirma
 * (XACK) los mensajes después de guardarlos en Postgres.
 */
export class ClickWorker {
  constructor({
    batchSize = config.worker.batchSize,
    blockMs = config.worker.blockMs,
    consumer = `${os.hostname()}-${process.pid}`,
  } = {}) {
    this.batchSize = batchSize;
    this.blockMs = blockMs;
    this.consumer = consumer;
    this.running = false;
    this.client = null;
  }

  async init() {
    if (this.client) return;
    this.client = createBlockingClient();
    await this.ensureGroup();
  }

  async ensureGroup() {
    try {
      await this.client.xgroup('CREATE', STREAM, GROUP, '0', 'MKSTREAM');
    } catch (err) {
      if (!String(err.message).includes('BUSYGROUP')) throw err;
    }
  }

  async start() {
    await this.init();
    this.running = true;
    this.loopPromise = this.loop();
    logger.info(`worker de clics iniciado (consumidor ${this.consumer})`);
  }

  async stop() {
    this.running = false;
    this.client?.disconnect(); // corta el XREADGROUP bloqueante
    await this.loopPromise?.catch(() => {});
    this.client = null;
  }

  async loop() {
    let cursor = '0'; // primero lo pendiente de este consumidor (p. ej. tras un reinicio)
    let lastClaim = 0;
    let failures = 0;

    while (this.running) {
      try {
        if (Date.now() - lastClaim > CLAIM_IDLE_MS / 2) {
          lastClaim = Date.now();
          if (await this.claimStale()) cursor = '0';
        }
        const processed = await this.readAndProcess(cursor, cursor === '>' ? this.blockMs : null);
        if (cursor === '0' && processed === 0) cursor = '>';
        failures = 0;
      } catch (err) {
        if (!this.running) break;
        failures += 1;
        cursor = '0'; // reintentar lo que quedó sin confirmar
        logger.error(`worker: ${err.message}`);
        // Un Redis sin persistencia (p. ej. el Key Value gratuito de Render) pierde el
        // stream y el grupo al reiniciarse: se vuelven a crear.
        if (String(err.message).includes('NOGROUP')) await this.ensureGroup().catch(() => {});
        await sleep(Math.min(30_000, 500 * 2 ** failures));
      }
    }
  }

  /** Reasigna a este consumidor los mensajes que otro dejó a medias. */
  async claimStale() {
    const [, entries] = await this.client.xautoclaim(
      STREAM, GROUP, this.consumer, CLAIM_IDLE_MS, '0-0', 'COUNT', this.batchSize, 'JUSTID',
    );
    if (entries.length > 0) logger.info(`worker: ${entries.length} clics reasignados de otro consumidor`);
    return entries.length > 0;
  }

  async readAndProcess(cursor, blockMs) {
    const args = ['GROUP', GROUP, this.consumer, 'COUNT', this.batchSize];
    if (blockMs) args.push('BLOCK', blockMs);
    const result = await this.client.xreadgroup(...args, 'STREAMS', STREAM, cursor);
    const entries = result?.[0]?.[1] ?? [];
    if (entries.length === 0) return 0;

    const ids = [];
    const clicks = [];
    for (const [id, fields] of entries) {
      ids.push(id);
      if (!fields) continue; // entrada ya eliminada del stream
      const raw = fieldsToObject(fields);
      const linkId = Number.parseInt(raw.linkId, 10);
      if (!Number.isSafeInteger(linkId)) continue;
      try {
        clicks.push(enrichClick({
          linkId,
          ts: Number(raw.ts) || Date.now(),
          ip: raw.ip,
          ua: raw.ua,
          referer: raw.ref,
        }));
      } catch (err) {
        logger.warn(`worker: clic ${id} descartado (${err.message})`);
      }
    }

    const linkIds = await persistClicks(clicks);
    // Confirmar y borrar: el stream no conserva IPs más tiempo del necesario.
    await this.client.multi().xack(STREAM, GROUP, ...ids).xdel(STREAM, ...ids).exec();
    await bumpStatsVersion('all', ...linkIds);
    return entries.length;
  }

  /** Procesa todo lo que haya en el stream sin bloquear (útil en tests y scripts). */
  async drain() {
    await this.init();
    let total = 0;
    for (const cursor of ['0', '>']) {
      let n;
      do {
        n = await this.readAndProcess(cursor, null);
        total += n;
      } while (n > 0);
    }
    return total;
  }
}
