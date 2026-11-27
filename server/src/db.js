import pg from 'pg';
import { config } from './config.js';
import { logger } from './utils/logger.js';

// COUNT(*) y BIGSERIAL llegan como string; los convertimos a número (caben de sobra en un double).
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number.parseInt(v, 10));

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Neon añade channel_binding=require: pg no lo lee de la URL, se activa aquí (SCRAM-SHA-256-PLUS sobre TLS).
  enableChannelBinding: /[?&]channel_binding=require\b/.test(config.databaseUrl),
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => logger.error('postgres: error en cliente inactivo', err));

export const query = (text, params) => pool.query(text, params);

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
