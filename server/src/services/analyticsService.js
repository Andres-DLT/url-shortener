import { config } from '../config.js';
import { query } from '../db.js';
import { keys, redis } from '../redis.js';
import { logger } from '../utils/logger.js';
import { RANGES } from '../utils/validation.js';

const TOP_N = 8;

// Dimensiones permitidas para los desgloses (lista cerrada: se interpolan en SQL).
const DIMENSIONS = {
  referrers: 'referrer_domain',
  countries: 'country',
  browsers: 'browser',
  os: 'os',
  devices: 'device',
};

/** Calcula los límites del periodo actual y del anterior en la zona horaria del usuario. */
async function getBounds(range, tz) {
  const { unit, buckets } = RANGES[range];
  const { rows: [b] } = await query(
    `SELECT to_char(s, 'YYYY-MM-DD HH24:MI:SS')            AS start_local,
            (s AT TIME ZONE $1)                            AS start_at,
            ((s - $3::interval) AT TIME ZONE $1)           AS prev_start_at
       FROM (SELECT date_trunc($2, now() AT TIME ZONE $1) - $4::interval AS s) x`,
    [tz, unit, `${buckets} ${unit}s`, `${buckets - 1} ${unit}s`],
  );
  return { ...b, unit, buckets };
}

function scopeFilter(linkId, paramIndex, column = 'link_id') {
  return linkId == null
    ? { sql: '', params: [] }
    : { sql: `AND ${column} = $${paramIndex}`, params: [linkId] };
}

async function getSummary(linkId, bounds) {
  const scope = scopeFilter(linkId, 3);
  const { rows: [r] } = await query(
    `SELECT
        (count(*) FILTER (WHERE NOT is_bot AND clicked_at >= $1))::int                         AS clicks,
        (count(DISTINCT visitor_hash) FILTER (WHERE NOT is_bot AND clicked_at >= $1))::int    AS visitors,
        (count(*) FILTER (WHERE NOT is_bot AND clicked_at < $1))::int                          AS prev_clicks,
        (count(DISTINCT visitor_hash) FILTER (WHERE NOT is_bot AND clicked_at < $1))::int     AS prev_visitors,
        (count(*) FILTER (WHERE is_bot AND clicked_at >= $1))::int                             AS bots
       FROM clicks
      WHERE clicked_at >= $2 ${scope.sql}`,
    [bounds.start_at, bounds.prev_start_at, ...scope.params],
  );
  return {
    clicks: r.clicks,
    visitors: r.visitors,
    botClicks: r.bots,
    previous: { clicks: r.prev_clicks, visitors: r.prev_visitors },
  };
}

async function getTimeseries(linkId, bounds, tz) {
  const scope = scopeFilter(linkId, 7);
  const { rows } = await query(
    `WITH series AS (
       SELECT generate_series($1::timestamp, $1::timestamp + $2::interval, $3::interval) AS bucket
     ), agg AS (
       SELECT date_trunc($4, clicked_at AT TIME ZONE $5) AS bucket,
              count(*)::int AS clicks,
              count(DISTINCT visitor_hash)::int AS visitors
         FROM clicks
        WHERE NOT is_bot AND clicked_at >= $6 ${scope.sql}
        GROUP BY 1
     )
     SELECT to_char(s.bucket, 'YYYY-MM-DD"T"HH24:MI:SS') AS t,
            COALESCE(a.clicks, 0) AS clicks,
            COALESCE(a.visitors, 0) AS visitors
       FROM series s LEFT JOIN agg a USING (bucket)
      ORDER BY s.bucket`,
    [
      bounds.start_local, `${bounds.buckets - 1} ${bounds.unit}s`, `1 ${bounds.unit}`,
      bounds.unit, tz, bounds.start_at, ...scope.params,
    ],
  );
  return { unit: bounds.unit, points: rows };
}

/** Top N de una dimensión; el resto se agrupa en "other". Clave '' = desconocido/directo. */
async function getBreakdown(linkId, bounds, column, totalClicks) {
  const scope = scopeFilter(linkId, 2);
  const { rows } = await query(
    `SELECT COALESCE(${column}, '') AS key, count(*)::int AS clicks
       FROM clicks
      WHERE NOT is_bot AND clicked_at >= $1 ${scope.sql}
      GROUP BY 1
      ORDER BY 2 DESC, 1
      LIMIT ${TOP_N}`,
    [bounds.start_at, ...scope.params],
  );
  const shown = rows.reduce((sum, r) => sum + r.clicks, 0);
  return { items: rows, other: Math.max(totalClicks - shown, 0) };
}

async function getCities(linkId, bounds, totalClicks) {
  const scope = scopeFilter(linkId, 2);
  const { rows } = await query(
    `SELECT COALESCE(city, '') AS key, COALESCE(country, '') AS country, count(*)::int AS clicks
       FROM clicks
      WHERE NOT is_bot AND clicked_at >= $1 ${scope.sql}
      GROUP BY 1, 2
      ORDER BY 3 DESC, 1
      LIMIT ${TOP_N}`,
    [bounds.start_at, ...scope.params],
  );
  const shown = rows.reduce((sum, r) => sum + r.clicks, 0);
  return { items: rows, other: Math.max(totalClicks - shown, 0) };
}

/** Matriz día de la semana (1 = lunes) × hora local. */
async function getActivity(linkId, bounds, tz) {
  const scope = scopeFilter(linkId, 3);
  const { rows } = await query(
    `SELECT extract(isodow FROM clicked_at AT TIME ZONE $2)::int AS dow,
            extract(hour   FROM clicked_at AT TIME ZONE $2)::int AS hour,
            count(*)::int AS clicks
       FROM clicks
      WHERE NOT is_bot AND clicked_at >= $1 ${scope.sql}
      GROUP BY 1, 2`,
    [bounds.start_at, tz, ...scope.params],
  );
  return rows;
}

async function getRecentClicks(linkId) {
  const scope = scopeFilter(linkId, 1, 'c.link_id');
  const { rows } = await query(
    `SELECT c.clicked_at AS "clickedAt", c.country, c.city, c.referrer_domain AS "referrerDomain",
            c.browser, c.os, c.device, l.code
       FROM clicks c JOIN links l ON l.id = c.link_id
      WHERE NOT c.is_bot ${scope.sql}
      ORDER BY c.clicked_at DESC
      LIMIT 15`,
    scope.params,
  );
  return rows;
}

async function getTopLinks(bounds) {
  const { rows } = await query(
    `SELECT l.code, l.target_url AS "targetUrl", l.title, count(*)::int AS clicks
       FROM clicks c JOIN links l ON l.id = c.link_id
      WHERE NOT c.is_bot AND c.clicked_at >= $1
      GROUP BY l.id
      ORDER BY clicks DESC, l.code
      LIMIT 8`,
    [bounds.start_at],
  );
  return rows;
}

async function computeStats({ linkId, range, tz }) {
  const bounds = await getBounds(range, tz);
  const summary = await getSummary(linkId, bounds);
  const total = summary.clicks;

  const [timeseries, referrers, countries, cities, browsers, oses, devices, activity, recent, extra] = await Promise.all([
    getTimeseries(linkId, bounds, tz),
    getBreakdown(linkId, bounds, DIMENSIONS.referrers, total),
    getBreakdown(linkId, bounds, DIMENSIONS.countries, total),
    getCities(linkId, bounds, total),
    getBreakdown(linkId, bounds, DIMENSIONS.browsers, total),
    getBreakdown(linkId, bounds, DIMENSIONS.os, total),
    getBreakdown(linkId, bounds, DIMENSIONS.devices, total),
    getActivity(linkId, bounds, tz),
    getRecentClicks(linkId),
    linkId == null
      ? Promise.all([
        getTopLinks(bounds),
        query(`SELECT count(*)::int AS links,
                      (count(*) FILTER (WHERE is_active AND (expires_at IS NULL OR expires_at > now())))::int AS active,
                      COALESCE(sum(click_count), 0)::bigint AS all_time
                 FROM links`),
      ])
      : query('SELECT click_count FROM links WHERE id = $1', [linkId]),
  ]);

  const result = {
    range,
    timeZone: tz,
    from: bounds.start_at,
    generatedAt: new Date().toISOString(),
    summary,
    timeseries,
    referrers,
    countries,
    cities,
    browsers,
    os: oses,
    devices,
    activity,
    recentClicks: recent,
  };

  if (linkId == null) {
    const [topLinks, { rows: [totals] }] = extra;
    result.topLinks = topLinks;
    result.summary.totalLinks = totals.links;
    result.summary.activeLinks = totals.active;
    result.summary.allTimeClicks = totals.all_time;
  } else {
    result.summary.allTimeClicks = extra.rows[0]?.click_count ?? 0;
  }
  return result;
}

/**
 * Estadísticas con caché en Redis. La clave incluye un número de versión que el
 * worker incrementa al guardar clics nuevos, así que la caché nunca sirve datos
 * desactualizados más allá de lo que tarda el worker en volcar el lote.
 */
export async function getStats({ linkId = null, range, tz }) {
  const scope = linkId ?? 'all';
  let cacheKey = null;
  try {
    const version = (await redis.get(keys.statsVersion(scope))) ?? '0';
    cacheKey = keys.stats(scope, version, range, tz);
    const cached = await redis.get(cacheKey);
    if (cached) return { ...JSON.parse(cached), cached: true };
  } catch (err) {
    logger.warn(`caché de estadísticas no disponible: ${err.message}`);
  }

  const stats = await computeStats({ linkId, range, tz });
  if (cacheKey) {
    redis.set(cacheKey, JSON.stringify(stats), 'EX', config.statsCacheTtl).catch(() => {});
  }
  return { ...stats, cached: false };
}
