// Registro de clics en dos fases:
//   1. La redirección solo hace un XADD a un Redis Stream (≈0,1 ms) y responde.
//   2. El worker (services/clickWorker.js) lee el stream por lotes, enriquece cada
//      clic (geo, navegador, referrer) y lo inserta en Postgres en bloque.
// Si Redis no está disponible, el clic se escribe directamente en Postgres.
import { withTransaction } from '../db.js';
import { keys, redis } from '../redis.js';
import { enrichClick } from '../utils/enrich.js';
import { logger } from '../utils/logger.js';
import { bumpStatsVersion } from './linkService.js';

const STREAM_MAX_LEN = 1_000_000;

export async function trackClick({ linkId, ip, ua, referer }) {
  const event = { linkId, ts: Date.now(), ip: ip ?? '', ua: (ua ?? '').slice(0, 1024), referer: (referer ?? '').slice(0, 2048) };
  try {
    await redis.xadd(
      keys.clickStream, 'MAXLEN', '~', STREAM_MAX_LEN, '*',
      'linkId', String(event.linkId), 'ts', String(event.ts),
      'ip', event.ip, 'ua', event.ua, 'ref', event.referer,
    );
  } catch (err) {
    logger.warn(`stream no disponible (${err.message}); guardando el clic directamente en Postgres`);
    const linkIds = await persistClicks([enrichClick(event)]);
    await bumpStatsVersion('all', ...linkIds);
  }
}

/**
 * Inserta un lote de clics ya enriquecidos y actualiza el contador de cada enlace
 * en una sola transacción. Ignora clics de enlaces que se hayan borrado entretanto.
 * Devuelve los ids de enlace afectados.
 */
export async function persistClicks(clicks) {
  if (clicks.length === 0) return [];

  const columns = {
    link_id: [], clicked_at: [], visitor_hash: [], referrer: [], referrer_domain: [], country: [],
    region: [], city: [], browser: [], os: [], device: [], is_bot: [],
  };
  for (const c of clicks) {
    columns.link_id.push(c.linkId);
    columns.clicked_at.push(c.clickedAt);
    columns.visitor_hash.push(c.visitorHash);
    columns.referrer.push(c.referrer);
    columns.referrer_domain.push(c.referrerDomain);
    columns.country.push(c.country);
    columns.region.push(c.region);
    columns.city.push(c.city);
    columns.browser.push(c.browser);
    columns.os.push(c.os);
    columns.device.push(c.device);
    columns.is_bot.push(Boolean(c.isBot));
  }

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `WITH input AS (
         SELECT * FROM unnest(
           $1::bigint[], $2::timestamptz[], $3::text[], $4::text[], $5::text[], $6::text[],
           $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::boolean[]
         ) AS t(link_id, clicked_at, visitor_hash, referrer, referrer_domain, country,
                region, city, browser, os, device, is_bot)
       ), inserted AS (
         INSERT INTO clicks (link_id, clicked_at, visitor_hash, referrer, referrer_domain, country,
                             region, city, browser, os, device, is_bot)
         SELECT i.* FROM input i WHERE EXISTS (SELECT 1 FROM links l WHERE l.id = i.link_id)
         RETURNING link_id, is_bot
       )
       SELECT link_id, (count(*) FILTER (WHERE NOT is_bot))::int AS humans
         FROM inserted GROUP BY link_id`,
      Object.values(columns),
    );

    const counted = rows.filter((r) => r.humans > 0);
    if (counted.length > 0) {
      await client.query(
        `UPDATE links l SET click_count = l.click_count + v.n
           FROM unnest($1::bigint[], $2::int[]) AS v(id, n)
          WHERE l.id = v.id`,
        [counted.map((r) => r.link_id), counted.map((r) => r.humans)],
      );
    }
    return rows.map((r) => r.link_id);
  });
}
