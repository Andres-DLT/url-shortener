const LOCALE = 'es-ES';

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0, useGrouping: 'always' });
const compactFmt = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });
const percentFmt = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 });
const percent1Fmt = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 });
const regionNames = new Intl.DisplayNames([LOCALE], { type: 'region' });

export const formatNumber = (n) => integer.format(n ?? 0);
/** 1.284 / 12,9 mil / 4,2 M: número completo hasta 10.000, compacto a partir de ahí. */
export const formatCompact = (n) => (Math.abs(n) < 10_000 ? integer.format(n) : compactFmt.format(n));
export const formatPercent = (ratio) => (ratio > 0 && ratio < 0.01 ? '<1 %' : percentFmt.format(ratio));
export const formatPercentPrecise = (ratio) => percent1Fmt.format(ratio);

export function countryName(code) {
  if (!code) return 'Desconocido';
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Emoji de bandera a partir del código ISO (dos letras regionales). */
export function countryFlag(code) {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

const dayFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const dayLongFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
const hourFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const relFmt = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });

export const parseLocal = (t) => new Date(t); // "YYYY-MM-DDTHH:mm:ss" sin zona = hora local
export const formatBucketShort = (t, unit) => (unit === 'hour' ? hourFmt.format(parseLocal(t)) : dayFmt.format(parseLocal(t)));
export function formatBucketLong(t, unit) {
  const d = parseLocal(t);
  if (unit === 'hour') {
    const end = new Date(d.getTime() + 3_600_000);
    return `${dayFmt.format(d)}, ${hourFmt.format(d)}–${hourFmt.format(end)}`;
  }
  const s = dayLongFmt.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export const formatDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '—');
export const formatDateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '—');

export function formatRelative(iso) {
  const diff = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return 'ahora mismo';
  if (abs < 3600) return relFmt.format(Math.round(diff / 60), 'minute');
  if (abs < 86_400) return relFmt.format(Math.round(diff / 3600), 'hour');
  if (abs < 86_400 * 30) return relFmt.format(Math.round(diff / 86_400), 'day');
  return formatDate(iso);
}

export const RANGE_OPTIONS = [
  { value: '24h', label: '24 horas', previous: 'las 24 h anteriores' },
  { value: '7d', label: '7 días', previous: 'los 7 días anteriores' },
  { value: '30d', label: '30 días', previous: 'los 30 días anteriores' },
  { value: '90d', label: '90 días', previous: 'los 90 días anteriores' },
];

export const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DAY_NAMES_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function shortHost(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}${u.search}`;
  } catch {
    return url;
  }
}
