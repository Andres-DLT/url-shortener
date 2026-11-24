import express from 'express';
import { trackClick } from '../services/clickService.js';
import { resolveLink } from '../services/linkService.js';
import { logger } from '../utils/logger.js';
import { isValidCode, RESERVED_CODES } from '../utils/shortcode.js';

export const redirectRouter = express.Router();

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function messagePage(title, message) {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root{color-scheme:light dark;--bg:#f9f9f7;--fg:#0b0b0b;--muted:#52514e}
  @media (prefers-color-scheme:dark){:root{--bg:#0d0d0d;--fg:#f0efec;--muted:#c3c2b7}}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);
       font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
  main{max-width:28rem;text-align:center} h1{font-size:1.5rem;margin:0 0 .5rem} p{color:var(--muted);margin:0 0 1.5rem}
  a{color:inherit}
</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="/">Crear un enlace corto</a></main></body></html>`;
}

redirectRouter.get('/:code', async (req, res, next) => {
  const { code } = req.params;
  if (!isValidCode(code) || RESERVED_CODES.has(code.toLowerCase())) return next();

  const link = await resolveLink(code);
  if (!link) {
    return res.status(404).type('html').send(messagePage('Enlace no encontrado', 'Este enlace corto no existe o ha sido eliminado.'));
  }
  if (!link.isActive || (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now())) {
    return res.status(410).type('html').send(messagePage('Enlace no disponible', 'Este enlace corto ha caducado o ha sido desactivado.'));
  }

  // 302 y no-store: si el navegador cacheara la redirección (301), dejaríamos de contar clics.
  res.set('Cache-Control', 'private, no-store, max-age=0');
  res.redirect(302, link.targetUrl);

  if (req.method === 'GET') {
    trackClick({
      linkId: link.id,
      ip: req.ip,
      ua: req.get('user-agent'),
      referer: req.get('referer'),
    }).catch((err) => logger.error(`no se pudo registrar el clic en ${code}: ${err.message}`));
  }
  return undefined;
});
