// Carga .env (si existe) sin dependencias externas y expone la configuración tipada.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const file of [path.join(root, '.env'), path.join(root, '..', '.env')]) {
  try {
    process.loadEnvFile(file);
    break;
  } catch {
    /* el fichero no existe: se usan las variables del entorno */
  }
}

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (value, fallback) =>
  value === undefined || value === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());

/** "true" | "false" | número de saltos | lista de subredes, tal y como lo entiende Express. */
function trustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return 0;
  if (value === 'true') return true;
  const n = Number.parseInt(value, 10);
  return String(n) === value.trim() ? n : value;
}

const port = int(process.env.PORT, 3000);
const env = process.env.NODE_ENV ?? 'development';

export const config = {
  env,
  port,
  // En Render, RENDER_EXTERNAL_URL trae la URL pública del servicio (https://xxx.onrender.com).
  baseUrl: (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://shortener:shortener@localhost:5432/shortener',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  // Proxies de confianza delante de la app (para leer la IP real de X-Forwarded-For).
  trustProxy: trustProxy(process.env.TRUST_PROXY),
  // Sal para anonimizar IPs. Cámbiala en producción.
  ipHashSalt: process.env.IP_HASH_SALT ?? 'cambia-esta-sal-en-produccion',
  auth: {
    // Sin contraseña: en desarrollo todo está abierto; en producción la gestión queda bloqueada.
    adminPassword: process.env.ADMIN_PASSWORD || null,
    // true: cualquiera puede ver el panel (solo lectura). false: también hace falta iniciar sesión para verlo.
    publicDashboard: bool(process.env.PUBLIC_DASHBOARD, true),
    sessionSecret: process.env.SESSION_SECRET || null,
    sessionDays: int(process.env.SESSION_DAYS, 7),
  },
  // Carga los enlaces de demostración al arrancar si la base de datos está vacía.
  seedDemoOnEmpty: bool(process.env.SEED_DEMO_ON_EMPTY, false),
  codeLength: int(process.env.CODE_LENGTH, 7),
  linkCacheTtl: int(process.env.LINK_CACHE_TTL, 3600),
  statsCacheTtl: int(process.env.STATS_CACHE_TTL, 60),
  rateLimit: {
    windowSeconds: int(process.env.RATE_LIMIT_WINDOW, 60),
    maxCreates: int(process.env.RATE_LIMIT_MAX_CREATES, 30),
  },
  // Si es true, el worker que vuelca los clics de Redis a Postgres corre dentro del proceso web.
  runWorkerInline: bool(process.env.RUN_WORKER_INLINE, true),
  worker: {
    batchSize: int(process.env.WORKER_BATCH_SIZE, 500),
    blockMs: int(process.env.WORKER_BLOCK_MS, 2000),
  },
  clientDist: process.env.CLIENT_DIST ?? path.join(root, '..', 'client', 'dist'),
};
