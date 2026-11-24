// Autenticación mínima de administrador: una contraseña (ADMIN_PASSWORD) y una
// cookie de sesión firmada con HMAC (sin estado en servidor).
//
//   modo "open"     → sin ADMIN_PASSWORD fuera de producción: todo permitido (desarrollo).
//   modo "password" → con ADMIN_PASSWORD: crear/editar/borrar exige iniciar sesión.
//   modo "locked"   → producción sin ADMIN_PASSWORD: nadie puede modificar nada.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../utils/errors.js';

const COOKIE = 'sid';
const { adminPassword, publicDashboard, sessionDays } = config.auth;

export const authMode = adminPassword ? 'password' : config.env === 'production' ? 'locked' : 'open';

// Derivado de la contraseña si no se da SESSION_SECRET: cambiar la contraseña invalida las sesiones.
const secret = config.auth.sessionSecret
  ?? createHash('sha256').update(`session|${adminPassword ?? ''}|${config.ipHashSalt}`).digest();

const sign = (payload) => createHmac('sha256', secret).update(payload).digest('base64url');
const sha256 = (value) => createHash('sha256').update(value).digest();
const secureCookie = config.baseUrl.startsWith('https://');

export function createSessionToken(now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ role: 'admin', exp: now + sessionDays * 86_400_000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.role === 'admin' && Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > -1 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return null;
}

export function isAdmin(req) {
  if (authMode === 'open') return true;
  if (authMode === 'locked') return false;
  return verifySessionToken(readCookie(req, COOKIE));
}

export function checkPassword(candidate) {
  if (!adminPassword || typeof candidate !== 'string') return false;
  return timingSafeEqual(sha256(candidate), sha256(adminPassword));
}

export function setSessionCookie(res) {
  res.cookie(COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie,
    maxAge: sessionDays * 86_400_000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: secureCookie, path: '/' });
}

export function sessionInfo(req) {
  const admin = isAdmin(req);
  return {
    mode: authMode,
    authenticated: authMode === 'password' && admin,
    canEdit: admin,
    canView: publicDashboard || admin,
  };
}

/** Para crear, editar y borrar enlaces. */
export function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  if (authMode === 'locked') {
    return next(new HttpError(403, 'locked', 'La gestión está desactivada: configura ADMIN_PASSWORD en el servidor'));
  }
  return next(new HttpError(401, 'unauthorized', 'Inicia sesión para hacer cambios'));
}

/** Para ver enlaces y estadísticas (público salvo que PUBLIC_DASHBOARD=false). */
export function requireViewer(req, res, next) {
  if (publicDashboard || isAdmin(req)) return next();
  return next(new HttpError(401, 'unauthorized', 'Inicia sesión para ver el panel'));
}
