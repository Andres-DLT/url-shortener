// Configura un entorno aislado (BD shortener_test y Redis db 15) antes de importar la app.
import { setTimeout as sleep } from 'node:timers/promises';

export async function setupIntegration(env = {}) {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    BASE_URL: 'http://sho.rt',
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://shortener:shortener@localhost:5432/shortener_test',
    REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15',
    TRUST_PROXY: '1',
    RUN_WORKER_INLINE: 'false',
    ...env,
  });

  const { createApp } = await import('../src/app.js');
  const { pool } = await import('../src/db.js');
  const { migrate } = await import('../src/db/migrate.js');
  const { redis } = await import('../src/redis.js');
  const { ClickWorker } = await import('../src/services/clickWorker.js');

  await migrate();
  await pool.query('TRUNCATE links, clicks RESTART IDENTITY CASCADE');
  await redis.flushdb();

  const worker = new ClickWorker({ consumer: 'test' });

  /** Procesa el stream hasta haber volcado `expected` clics (el XADD es asíncrono). */
  async function drainClicks(expected) {
    let total = 0;
    const deadline = Date.now() + 3000;
    while (total < expected && Date.now() < deadline) {
      total += await worker.drain();
      if (total < expected) await sleep(20);
    }
    return total;
  }

  async function teardown() {
    await worker.stop();
    await pool.end();
    await redis.quit();
  }

  return { app: createApp(), pool, redis, drainClicks, teardown };
}
