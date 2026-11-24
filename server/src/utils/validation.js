import { config } from '../config.js';
import { badRequest } from './errors.js';
import { CODE_PATTERN, RESERVED_CODES } from './shortcode.js';

const MAX_URL_LENGTH = 2048;
const ownHost = new URL(config.baseUrl).host.toLowerCase();

export function normalizeTargetUrl(input) {
  if (typeof input !== 'string' || input.trim() === '') throw badRequest('La URL es obligatoria');
  let raw = input.trim();
  // Permite pegar "ejemplo.com/ruta" sin protocolo.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  if (raw.length > MAX_URL_LENGTH) throw badRequest(`La URL no puede superar ${MAX_URL_LENGTH} caracteres`);

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('La URL no es válida');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw badRequest('Solo se admiten URLs http o https');
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') throw badRequest('El dominio de la URL no es válido');
  if (url.username || url.password) throw badRequest('La URL no puede incluir credenciales');
  if (url.host.toLowerCase() === ownHost) throw badRequest('No se pueden acortar enlaces de este mismo acortador');
  return url.toString();
}

export function validateAlias(alias) {
  if (alias === undefined || alias === null || alias === '') return null;
  if (typeof alias !== 'string' || !CODE_PATTERN.test(alias)) {
    throw badRequest('El alias debe tener entre 3 y 32 caracteres: letras, números, "-" o "_"');
  }
  if (RESERVED_CODES.has(alias.toLowerCase())) throw badRequest(`"${alias}" es una palabra reservada`);
  return alias;
}

export function parseExpiresAt(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest('La fecha de caducidad no es válida');
  if (date.getTime() <= Date.now()) throw badRequest('La fecha de caducidad debe estar en el futuro');
  return date;
}

export function parseTitle(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') throw badRequest('El título debe ser texto');
  const title = value.trim();
  if (title.length > 200) throw badRequest('El título no puede superar 200 caracteres');
  return title || null;
}

export const RANGES = {
  '24h': { interval: '24 hours', unit: 'hour', buckets: 24 },
  '7d': { interval: '7 days', unit: 'day', buckets: 7 },
  '30d': { interval: '30 days', unit: 'day', buckets: 30 },
  '90d': { interval: '90 days', unit: 'day', buckets: 90 },
};

export function parseRange(value) {
  const range = value ?? '7d';
  if (!Object.hasOwn(RANGES, range)) throw badRequest(`Rango no válido. Usa: ${Object.keys(RANGES).join(', ')}`);
  return range;
}

export function parseTimeZone(value) {
  const tz = value || 'UTC';
  if (tz.length > 64) throw badRequest('Zona horaria no válida');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw badRequest('Zona horaria no válida');
  }
  return tz;
}
