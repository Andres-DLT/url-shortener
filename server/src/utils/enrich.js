// Convierte un evento de clic "en bruto" (IP, user-agent, referer) en datos analíticos anónimos.
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import geoip from 'geoip-lite';
import { isbot } from 'isbot';
import UAParser from 'ua-parser-js';
import { config } from '../config.js';

const clip = (value, max) => (value ? String(value).slice(0, max) : null);

export function normalizeIp(ip) {
  if (typeof ip !== 'string') return null;
  let value = ip.trim();
  if (value.startsWith('::ffff:')) value = value.slice(7); // IPv4 mapeada en IPv6
  return isIP(value) ? value : null;
}

export function lookupGeo(ip) {
  const clean = normalizeIp(ip);
  if (!clean) return { country: null, region: null, city: null };
  const geo = geoip.lookup(clean);
  return {
    country: geo?.country || null,
    region: clip(geo?.region, 64),
    city: clip(geo?.city, 128),
  };
}

export function parseReferrer(referrer) {
  if (!referrer || typeof referrer !== 'string') return { referrer: null, referrerDomain: null };
  try {
    const url = new URL(referrer);
    if (!['http:', 'https:', 'android-app:'].includes(url.protocol)) return { referrer: null, referrerDomain: null };
    const domain = url.hostname.toLowerCase().replace(/^www\./, '');
    return { referrer: url.toString().slice(0, 2048), referrerDomain: domain.slice(0, 255) || null };
  } catch {
    return { referrer: null, referrerDomain: null };
  }
}

const DEVICE_LABELS = { mobile: 'Móvil', tablet: 'Tablet', smarttv: 'Smart TV', console: 'Consola', wearable: 'Wearable', embedded: 'Otro' };

export function parseUserAgent(ua) {
  const source = typeof ua === 'string' ? ua.slice(0, 1024) : '';
  const result = new UAParser(source).getResult();
  return {
    browser: clip(result.browser.name, 64),
    os: clip(result.os.name, 64),
    // ua-parser no informa "desktop": si no detecta tipo de dispositivo y hay UA, es escritorio.
    device: result.device.type ? DEVICE_LABELS[result.device.type] ?? 'Otro' : source ? 'Escritorio' : null,
    isBot: source === '' || isbot(source),
  };
}

/** Hash irreversible de IP + UA para contar visitantes únicos sin guardar la IP. */
export function visitorHash(ip, ua) {
  return createHash('sha256')
    .update(`${config.ipHashSalt}|${normalizeIp(ip) ?? ''}|${ua ?? ''}`)
    .digest('hex');
}

export function enrichClick({ linkId, ts, ip, ua, referer }) {
  return {
    linkId,
    clickedAt: new Date(ts),
    visitorHash: visitorHash(ip, ua),
    ...parseReferrer(referer),
    ...lookupGeo(ip),
    ...parseUserAgent(ua),
  };
}
