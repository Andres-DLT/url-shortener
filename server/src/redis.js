import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './utils/logger.js';

// Cliente principal: falla rápido para que una caída de Redis no bloquee las redirecciones
// (el código que lo usa degrada a Postgres).
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 1,
  commandTimeout: 1000,
  lazyConnect: false,
});

redis.on('error', (err) => logger.warn(`redis: ${err.message}`));

// Conexión dedicada para comandos bloqueantes (XREADGROUP BLOCK) del worker.
export function createBlockingClient() {
  const client = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  client.on('error', (err) => logger.warn(`redis (worker): ${err.message}`));
  return client;
}

export const keys = {
  link: (code) => `link:${code}`,
  clickStream: 'clicks:stream',
  clickGroup: 'clicks:writers',
  statsVersion: (scope) => `stats:ver:${scope}`,
  stats: (scope, version, range, tz) => `stats:${scope}:v${version}:${range}:${tz}`,
  rateLimit: (bucket, id, window) => `rl:${bucket}:${id}:${window}`,
};
