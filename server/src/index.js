import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';
import { migrate } from './db/migrate.js';
import { authMode } from './middleware/auth.js';
import { redis } from './redis.js';
import { ClickWorker } from './services/clickWorker.js';
import { seedDemoIfEmpty } from './services/demoData.js';
import { logger } from './utils/logger.js';

await migrate();
if (config.seedDemoOnEmpty) {
  await seedDemoIfEmpty().catch((err) => logger.error(`no se pudo cargar la demo: ${err.message}`));
}

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info(`servidor escuchando en ${config.baseUrl} (puerto ${config.port})`);
  if (authMode === 'open') logger.warn('ADMIN_PASSWORD no está configurada: cualquiera puede crear y borrar enlaces (solo para desarrollo)');
  if (authMode === 'locked') logger.warn('ADMIN_PASSWORD no está configurada: la gestión de enlaces queda bloqueada');
});

const worker = config.runWorkerInline ? new ClickWorker() : null;
await worker?.start();

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} recibido, cerrando…`);
  server.close();
  await worker?.stop();
  await Promise.allSettled([pool.end(), redis.quit()]);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
