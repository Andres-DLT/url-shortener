import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { pool } from './db.js';
import { errorHandler } from './middleware/errorHandler.js';
import { redis } from './redis.js';
import { apiRouter } from './routes/api.js';
import { redirectRouter } from './routes/redirect.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        'img-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
      },
    },
  }));

  app.get('/health', async (req, res) => {
    const check = async (fn) => {
      try {
        await fn();
        return 'ok';
      } catch (err) {
        return `error: ${err.message}`;
      }
    };
    const [postgres, redisStatus] = await Promise.all([
      check(() => pool.query('SELECT 1')),
      check(() => redis.ping()),
    ]);
    const healthy = postgres === 'ok' && redisStatus === 'ok';
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', postgres, redis: redisStatus });
  });

  app.use('/api', apiRouter);

  // Frontend (React) compilado. En desarrollo se usa el servidor de Vite.
  const indexFile = path.join(config.clientDist, 'index.html');
  app.use(express.static(config.clientDist, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.includes(`${path.sep}assets${path.sep}`)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));
  const sendApp = (req, res) => {
    if (fs.existsSync(indexFile)) return res.sendFile(indexFile);
    return res
      .status(503)
      .type('text')
      .send('Frontend no compilado. Ejecuta "npm run build" en client/ o usa "npm run dev" (Vite) en desarrollo.');
  };
  app.get('/', sendApp);
  app.get('/links/:code', sendApp);

  // Redirecciones de los enlaces cortos: /:code
  app.use(redirectRouter);

  app.use((req, res) => res.status(404).json({ error: { code: 'not_found', message: 'No encontrado' } }));
  app.use(errorHandler);
  return app;
}
