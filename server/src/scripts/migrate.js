import { pool } from '../db.js';
import { migrate } from '../db/migrate.js';
import { logger } from '../utils/logger.js';

try {
  await migrate();
  logger.info('base de datos al día');
} catch (err) {
  logger.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
