// Proceso independiente para el worker de clics (escala por separado de la API).
// Uso: RUN_WORKER_INLINE=false en la API y `npm run worker` en uno o varios procesos.
import { pool } from './db.js';
import { migrate } from './db/migrate.js';
import { redis } from './redis.js';
import { ClickWorker } from './services/clickWorker.js';
import { logger } from './utils/logger.js';

await migrate();
const worker = new ClickWorker();
await worker.start();

async function shutdown(signal) {
  logger.info(`${signal} recibido, deteniendo el worker…`);
  await worker.stop();
  await Promise.allSettled([pool.end(), redis.quit()]);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
