import express from 'express';
import QRCode from 'qrcode';
import { config } from '../config.js';
import {
  checkPassword, clearSessionCookie, requireAdmin, requireViewer, sessionInfo, setSessionCookie,
} from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getStats } from '../services/analyticsService.js';
import {
  createLink, getLink, listLinks, removeLink, toLinkDto, updateLink,
} from '../services/linkService.js';
import { HttpError, notFound } from '../utils/errors.js';
import { parseRange, parseTimeZone } from '../utils/validation.js';

export const apiRouter = express.Router();

apiRouter.use(express.json({ limit: '16kb' }));
apiRouter.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/* ---------- Configuración pública y sesión ---------- */

apiRouter.get('/config', (req, res) => {
  res.json({ baseUrl: config.baseUrl, session: sessionInfo(req) });
});

apiRouter.post(
  '/auth/login',
  rateLimit({ bucket: 'login', max: 10, windowSeconds: 15 * 60 }),
  (req, res) => {
    if (sessionInfo(req).mode !== 'password') {
      throw new HttpError(400, 'auth_disabled', 'El inicio de sesión no está activado en este servidor');
    }
    if (!checkPassword(req.body?.password)) throw new HttpError(401, 'invalid_password', 'Contraseña incorrecta');
    setSessionCookie(res);
    res.json({ session: { ...sessionInfo(req), authenticated: true, canEdit: true, canView: true } });
  },
);

apiRouter.post('/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

/* ---------- Enlaces ---------- */

apiRouter.post(
  '/links',
  requireAdmin,
  rateLimit({ bucket: 'create', max: config.rateLimit.maxCreates, windowSeconds: config.rateLimit.windowSeconds }),
  async (req, res) => {
    const link = await createLink(req.body ?? {});
    res.status(201).location(`/api/links/${link.code}`).json({ link });
  },
);

apiRouter.get('/links', requireViewer, async (req, res) => {
  res.json(await listLinks({ q: req.query.q, page: req.query.page, pageSize: req.query.pageSize }));
});

apiRouter.get('/links/:code', requireViewer, async (req, res) => {
  res.json({ link: toLinkDto(await getLink(req.params.code)) });
});

apiRouter.patch('/links/:code', requireAdmin, async (req, res) => {
  res.json({ link: await updateLink(req.params.code, req.body ?? {}) });
});

apiRouter.delete('/links/:code', requireAdmin, async (req, res) => {
  await removeLink(req.params.code);
  res.status(204).end();
});

/* ---------- Analíticas ---------- */

apiRouter.get('/links/:code/stats', requireViewer, async (req, res) => {
  const range = parseRange(req.query.range);
  const tz = parseTimeZone(req.query.tz);
  const link = await getLink(req.params.code);
  const stats = await getStats({ linkId: link.id, range, tz });
  res.json({ link: toLinkDto(link), ...stats });
});

apiRouter.get('/links/:code/qr', requireViewer, async (req, res) => {
  const link = await getLink(req.params.code);
  const svg = await QRCode.toString(`${config.baseUrl}/${link.code}`, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0b0b0b', light: '#ffffff' },
  });
  res.set('Cache-Control', 'private, max-age=3600');
  res.type('image/svg+xml').send(svg);
});

apiRouter.get('/overview', requireViewer, async (req, res) => {
  const range = parseRange(req.query.range);
  const tz = parseTimeZone(req.query.tz);
  res.json(await getStats({ linkId: null, range, tz }));
});

apiRouter.use((req, res, next) => next(notFound('Ruta de la API no encontrada')));
