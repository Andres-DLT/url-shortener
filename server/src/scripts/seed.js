// Recrea los enlaces de demostración (no toca los demás).
// Uso: npm run seed
//      npm run seed -- --clicks 40000
import { pool } from '../db.js';
import { migrate } from '../db/migrate.js';
import { redis } from '../redis.js';
import { seedDemo } from '../services/demoData.js';
import { logger } from '../utils/logger.js';

const argIndex = process.argv.indexOf('--clicks');
const targetClicks = argIndex > -1 ? Number.parseInt(process.argv[argIndex + 1], 10) || 25_000 : 25_000;

try {
  await migrate();
  await seedDemo({ targetClicks });
} catch (err) {
  logger.error(err);
  process.exitCode = 1;
} finally {
  await Promise.allSettled([pool.end(), redis.quit()]);
}
