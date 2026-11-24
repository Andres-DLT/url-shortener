import { randomInt } from 'node:crypto';

// Solo minúsculas y dígitos: los códigos se resuelven sin distinguir mayúsculas.
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Código base36 aleatorio criptográficamente seguro (36^7 ≈ 78 000 millones de combinaciones). */
export function generateCode(length = 7) {
  let code = '';
  for (let i = 0; i < length; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export const CODE_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

// Rutas que usa la propia aplicación y no pueden ser alias.
export const RESERVED_CODES = new Set([
  'api', 'app', 'assets', 'admin', 'dashboard', 'health', 'links', 'login', 'logout',
  'static', 'stats', 'index', 'index.html', 'favicon.svg', 'favicon.ico', 'robots.txt',
]);

export const isValidCode = (code) => typeof code === 'string' && CODE_PATTERN.test(code);
