import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';
import { logger } from '../utils/logger.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const LOCK_ID = 727_001;

/**
 * Aplica las migraciones pendientes. Cada una va en su propia transacción con un
 * advisory lock *de transacción*, así funciona igual con conexión directa que a
 * través de un pooler en modo transacción (PgBouncer, el pooler de Neon…) y dos
 * instancias que arranquen a la vez no migran dos veces.
 */
export async function migrate() {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await client.query('COMMIT');

    for (const file of files) {
      const sql = await fs.readFile(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
        const { rowCount } = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
        if (rowCount === 0) {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
          logger.info(`migración aplicada: ${file}`);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw new Error(`Falló la migración ${file}: ${err.message}`, { cause: err });
      }
    }
  } finally {
    client.release();
  }
}
