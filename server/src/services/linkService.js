import { config } from '../config.js';
import { query } from '../db.js';
import { keys, redis } from '../redis.js';
import { conflict, notFound } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { generateCode, isValidCode } from '../utils/shortcode.js';
import {
  normalizeTargetUrl, parseExpiresAt, parseTitle, validateAlias,
} from '../utils/validation.js';

const NEGATIVE_CACHE_TTL = 30;
const UNIQUE_VIOLATION = '23505';

export function linkStatus(row) {
  if (!row.is_active) return 'disabled';
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return 'expired';
  return 'active';
}

export function toLinkDto(row) {
  return {
    id: row.id,
    code: row.code,
    shortUrl: `${config.baseUrl}/${row.code}`,
    targetUrl: row.target_url,
    title: row.title,
    isActive: row.is_active,
    status: linkStatus(row),
    expiresAt: row.expires_at,
    clickCount: row.click_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function invalidateLinkCache(code) {
  try {
    await redis.unlink(keys.link(code.toLowerCase()));
  } catch (err) {
    logger.warn(`no se pudo invalidar la caché de ${code}: ${err.message}`);
  }
}

/** Las claves de estadísticas llevan un número de versión: subirlo invalida la caché al instante. */
export async function bumpStatsVersion(...scopes) {
  if (scopes.length === 0) return;
  try {
    const pipeline = redis.pipeline();
    for (const scope of scopes) pipeline.incr(keys.statsVersion(scope));
    await pipeline.exec();
  } catch (err) {
    logger.warn(`no se pudo invalidar la caché de estadísticas: ${err.message}`);
  }
}

export async function createLink(input) {
  const targetUrl = normalizeTargetUrl(input.url);
  const alias = validateAlias(input.alias);
  const title = parseTitle(input.title) ?? null;
  const expiresAt = parseExpiresAt(input.expiresAt) ?? null;

  const insert = (code) => query(
    `INSERT INTO links (code, target_url, title, expires_at)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [code, targetUrl, title, expiresAt],
  );

  let row;
  if (alias) {
    try {
      ({ rows: [row] } = await insert(alias));
    } catch (err) {
      if (err.code === UNIQUE_VIOLATION) throw conflict(`El alias "${alias}" ya está en uso`);
      throw err;
    }
  } else {
    // Colisión muy improbable; reintentamos con otro código aleatorio.
    for (let attempt = 0; attempt < 5 && !row; attempt += 1) {
      try {
        ({ rows: [row] } = await insert(generateCode(config.codeLength)));
      } catch (err) {
        if (err.code !== UNIQUE_VIOLATION) throw err;
      }
    }
    if (!row) throw new Error('No se pudo generar un código único');
  }

  // Quita una posible entrada de caché negativa ("no existe") de ese código.
  await invalidateLinkCache(row.code);
  await bumpStatsVersion('all');
  return toLinkDto(row);
}

const SEARCH_WHERE = `$1 = '' OR code ILIKE $2 OR target_url ILIKE $2 OR title ILIKE $2`;

export async function listLinks({ q = '', page = 1, pageSize = 20 } = {}) {
  const limit = Math.min(Math.max(Number.parseInt(pageSize, 10) || 20, 1), 100);
  const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const search = String(q).trim().slice(0, 200);
  const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  const [{ rows }, { rows: [{ count: total }] }] = await Promise.all([
    query(
      `SELECT * FROM links WHERE ${SEARCH_WHERE}
        ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
      [search, pattern, limit, (currentPage - 1) * limit],
    ),
    query(`SELECT count(*) FROM links WHERE ${SEARCH_WHERE}`, [search, pattern]),
  ]);
  return { items: rows.map(toLinkDto), total, page: currentPage, pageSize: limit };
}

export async function findLinkRow(code) {
  if (!isValidCode(code)) return null;
  const { rows } = await query('SELECT * FROM links WHERE lower(code) = lower($1)', [code]);
  return rows[0] ?? null;
}

export async function getLink(code) {
  const row = await findLinkRow(code);
  if (!row) throw notFound('El enlace no existe');
  return row;
}

/**
 * Resolución para redirecciones: Redis primero, Postgres como respaldo.
 * Si Redis no responde, se degrada a Postgres sin romper la redirección.
 */
export async function resolveLink(code) {
  const key = keys.link(code.toLowerCase());
  try {
    const cached = await redis.get(key);
    if (cached !== null) return cached === 'null' ? null : JSON.parse(cached);
  } catch (err) {
    logger.warn(`caché no disponible para ${code}: ${err.message}`);
  }

  const row = await findLinkRow(code);
  const link = row && {
    id: row.id,
    code: row.code,
    targetUrl: row.target_url,
    isActive: row.is_active,
    expiresAt: row.expires_at?.toISOString() ?? null,
  };

  try {
    await redis.set(key, JSON.stringify(link), 'EX', link ? config.linkCacheTtl : NEGATIVE_CACHE_TTL);
  } catch {
    /* Redis caído: no pasa nada, la próxima vez se vuelve a consultar Postgres */
  }
  return link;
}

export async function updateLink(code, input) {
  const current = await getLink(code);
  const fields = {};
  if (input.url !== undefined) fields.target_url = normalizeTargetUrl(input.url);
  if (input.title !== undefined) fields.title = parseTitle(input.title);
  if (input.expiresAt !== undefined) fields.expires_at = parseExpiresAt(input.expiresAt);
  if (input.isActive !== undefined) fields.is_active = Boolean(input.isActive);
  if (Object.keys(fields).length === 0) return toLinkDto(current);

  // Los nombres de columna provienen de la lista fija de arriba, nunca del cliente.
  const columns = Object.keys(fields);
  const sets = columns.map((col, i) => `${col} = $${i + 2}`).join(', ');
  const { rows: [row] } = await query(
    `UPDATE links SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`,
    [current.id, ...columns.map((c) => fields[c])],
  );
  await invalidateLinkCache(row.code);
  await bumpStatsVersion('all');
  return toLinkDto(row);
}

export async function removeLink(code) {
  const current = await getLink(code);
  await query('DELETE FROM links WHERE id = $1', [current.id]);
  await invalidateLinkCache(current.code);
  await bumpStatsVersion('all', current.id);
}
