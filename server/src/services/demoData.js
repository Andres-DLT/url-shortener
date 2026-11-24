// Enlaces de demostración con ~90 días de clics sintéticos, para ver el panel con datos.
// Se usa desde `npm run seed` y, con SEED_DEMO_ON_EMPTY=true, al arrancar con la BD vacía.
import { createHash } from 'node:crypto';
import { query } from '../db.js';
import { keys, redis } from '../redis.js';
import { logger } from '../utils/logger.js';
import { persistClicks } from './clickService.js';

const DAY = 86_400_000;

// PRNG con semilla: los datos de demo son reproducibles.
let seed = 20261122;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
}
function weighted(entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = random() * total;
  for (const [value, w] of entries) {
    r -= w;
    if (r <= 0) return value;
  }
  return entries.at(-1)[0];
}

const GEO = [
  ['ES', 30, [['Madrid', 40], ['Barcelona', 30], ['Valencia', 12], ['Sevilla', 10], ['Bilbao', 8]]],
  ['MX', 18, [['Mexico City', 50], ['Guadalajara', 25], ['Monterrey', 25]]],
  ['AR', 10, [['Buenos Aires', 70], ['Córdoba', 18], ['Rosario', 12]]],
  ['CO', 9, [['Bogotá', 60], ['Medellín', 30], ['Cali', 10]]],
  ['US', 12, [['New York', 30], ['San Francisco', 25], ['Miami', 30], ['Austin', 15]]],
  ['CL', 5, [['Santiago', 100]]],
  ['PE', 4, [['Lima', 100]]],
  ['DE', 3, [['Berlin', 60], ['Munich', 40]]],
  ['GB', 3, [['London', 100]]],
  ['FR', 2, [['Paris', 100]]],
  ['BR', 2, [['São Paulo', 100]]],
  [null, 2, [[null, 100]]],
];
const REFERRERS = [
  ['google.com', 30], [null, 22], ['t.co', 11], ['linkedin.com', 10], ['facebook.com', 7],
  ['instagram.com', 6], ['news.ycombinator.com', 4], ['reddit.com', 4], ['youtube.com', 3], ['github.com', 3],
];
const DEVICES = [['Escritorio', 52], ['Móvil', 42], ['Tablet', 6]];
const OS_BY_DEVICE = {
  Escritorio: [['Windows', 55], ['Mac OS', 35], ['Linux', 10]],
  Móvil: [['Android', 60], ['iOS', 40]],
  Tablet: [['iOS', 70], ['Android', 30]],
};
const BROWSER_BY_OS = {
  Windows: [['Chrome', 65], ['Edge', 25], ['Firefox', 10]],
  'Mac OS': [['Chrome', 55], ['Safari', 35], ['Firefox', 10]],
  Linux: [['Chrome', 50], ['Firefox', 50]],
  Android: [['Chrome', 80], ['Samsung Browser', 15], ['Firefox', 5]],
  iOS: [['Mobile Safari', 80], ['Chrome', 20]],
};
// Curva diaria (hora UTC): picos a media mañana y por la noche en Europa/América.
const HOUR_WEIGHTS = [3, 2, 2, 1, 1, 1, 2, 4, 7, 10, 12, 12, 11, 12, 13, 14, 14, 13, 13, 14, 15, 13, 9, 5];
const WEEKDAY_FACTOR = [0.7, 1.05, 1.15, 1.15, 1.1, 1.0, 0.75]; // domingo..sábado

const DEMO_LINKS = [
  { code: 'lanzamiento', url: 'https://example.com/lanzamiento-producto', title: 'Lanzamiento del producto', share: 0.3, ageDays: 88, trend: 1.2, spikeDay: 60 },
  { code: 'blog-redis', url: 'https://redis.io/docs/latest/develop/data-types/streams/', title: 'Guía de Redis Streams', share: 0.22, ageDays: 75, trend: 1.6, spikeDay: 70 },
  { code: 'webinar', url: 'https://example.com/webinar-postgresql', title: 'Webinar de PostgreSQL', share: 0.16, ageDays: 45, trend: 0.6, spikeDay: 30 },
  { code: 'curriculum', url: 'https://github.com/', title: 'Mi perfil de GitHub', share: 0.12, ageDays: 90, trend: 1.0, spikeDay: null },
  { code: 'oferta-bf', url: 'https://example.com/black-friday', title: 'Oferta Black Friday', share: 0.14, ageDays: 12, trend: 3, spikeDay: 9 },
  { code: 'docs-node', url: 'https://nodejs.org/docs/latest/api/', title: 'Documentación de Node.js', share: 0.06, ageDays: 60, trend: 0.8, spikeDay: null, disabled: true },
];

function dailyWeights(link, now) {
  const weights = [];
  for (let d = link.ageDays - 1; d >= 0; d -= 1) {
    const date = new Date(now - d * DAY);
    const progress = 1 - d / link.ageDays;
    let w = (0.4 + progress * link.trend) * WEEKDAY_FACTOR[date.getUTCDay()] * (0.75 + random() * 0.5);
    if (link.spikeDay !== null) {
      const dist = Math.abs(link.ageDays - 1 - d - link.spikeDay);
      w *= 1 + 4 / (1 + dist * dist); // pico "viral" que decae en pocos días
    }
    weights.push([d, w]);
  }
  return weights;
}

function makeClick(linkId, day, now, visitors) {
  const hour = weighted(HOUR_WEIGHTS.map((w, h) => [h, w]));
  const dayStart = new Date(now - day * DAY);
  dayStart.setUTCHours(hour, Math.floor(random() * 60), Math.floor(random() * 60), 0);
  const clickedAt = dayStart.getTime() > now ? new Date(now - random() * 3_600_000) : dayStart;

  const isBot = random() < 0.04;
  const [country, , cities] = weighted(GEO.map((g) => [g, g[1]]));
  const device = weighted(DEVICES);
  const os = weighted(OS_BY_DEVICE[device]);
  const referrerDomain = weighted(REFERRERS);
  // Visitantes recurrentes: ~35 % de los clics vienen de alguien que ya hizo clic.
  let visitor;
  if (visitors.length > 0 && random() < 0.35) {
    visitor = visitors[Math.floor(random() ** 2 * visitors.length)];
  } else {
    visitor = createHash('sha256').update(`demo-${linkId}-${visitors.length}`).digest('hex');
    visitors.push(visitor);
  }

  return {
    linkId,
    clickedAt,
    visitorHash: visitor,
    referrer: referrerDomain ? `https://${referrerDomain}/` : null,
    referrerDomain,
    country,
    region: null,
    city: weighted(cities),
    browser: isBot ? null : weighted(BROWSER_BY_OS[os]),
    os: isBot ? null : os,
    device: isBot ? null : device,
    isBot,
  };
}

/** Recrea los enlaces de demo (borra solo esos códigos) con `targetClicks` clics en total. */
export async function seedDemo({ targetClicks = 25_000 } = {}) {
  const now = Date.now();
  const codes = DEMO_LINKS.map((l) => l.code);
  await query('DELETE FROM links WHERE lower(code) = ANY($1)', [codes]);

  let total = 0;
  const ids = [];
  for (const link of DEMO_LINKS) {
    const createdAt = new Date(now - link.ageDays * DAY - 3_600_000);
    const { rows: [row] } = await query(
      `INSERT INTO links (code, target_url, title, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
      [link.code, link.url, link.title, !link.disabled, createdAt],
    );
    ids.push(row.id);

    const count = Math.round(targetClicks * link.share);
    const days = dailyWeights(link, now);
    const visitors = [];
    let batch = [];
    for (let i = 0; i < count; i += 1) {
      batch.push(makeClick(row.id, weighted(days), now, visitors));
      if (batch.length === 2000) {
        await persistClicks(batch);
        batch = [];
      }
    }
    await persistClicks(batch);
    total += count;
    logger.info(`  /${link.code}: ${count} clics`);
  }

  // Invalida cachés de enlaces y estadísticas.
  try {
    const pipeline = redis.pipeline();
    for (const code of codes) pipeline.unlink(keys.link(code));
    for (const scope of ['all', ...ids]) pipeline.incr(keys.statsVersion(scope));
    await pipeline.exec();
  } catch (err) {
    logger.warn(`no se pudo invalidar la caché tras cargar la demo: ${err.message}`);
  }

  logger.info(`datos de demo creados: ${DEMO_LINKS.length} enlaces, ${total} clics`);
  return { links: DEMO_LINKS.length, clicks: total };
}

/** Carga la demo solo si todavía no hay ningún enlace. */
export async function seedDemoIfEmpty() {
  const { rows: [{ count }] } = await query('SELECT count(*) FROM links');
  if (count > 0) return null;
  logger.info('base de datos vacía: cargando enlaces de demostración…');
  return seedDemo();
}
