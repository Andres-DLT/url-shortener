import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.BASE_URL = 'http://sho.rt';

const { generateCode, isValidCode } = await import('../src/utils/shortcode.js');
const {
  normalizeTargetUrl, validateAlias, parseExpiresAt, parseRange, parseTimeZone,
} = await import('../src/utils/validation.js');
const {
  parseReferrer, parseUserAgent, lookupGeo, normalizeIp, visitorHash,
} = await import('../src/utils/enrich.js');

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('códigos cortos', () => {
  it('genera códigos base36 de la longitud pedida', () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateCode(7)));
    assert.equal(codes.size, 2000);
    for (const code of codes) assert.match(code, /^[0-9a-z]{7}$/);
  });

  it('valida el formato', () => {
    assert.ok(isValidCode('abc'));
    assert.ok(isValidCode('Mi_Enlace-2'));
    assert.ok(!isValidCode('ab'));
    assert.ok(!isValidCode('con espacio'));
    assert.ok(!isValidCode('a'.repeat(33)));
  });
});

describe('validación de URLs y parámetros', () => {
  it('normaliza URLs y añade https si falta el protocolo', () => {
    assert.equal(normalizeTargetUrl('ejemplo.com/ruta?a=1'), 'https://ejemplo.com/ruta?a=1');
    assert.equal(normalizeTargetUrl('  http://Ejemplo.com  '), 'http://ejemplo.com/');
  });

  it('rechaza URLs peligrosas o inválidas', () => {
    for (const bad of ['', 'javascript:alert(1)', 'ftp://x.com', 'http://user:pass@x.com', 'https://nodot', 'http://sho.rt/abc']) {
      assert.throws(() => normalizeTargetUrl(bad), { status: 400 }, bad);
    }
  });

  it('valida alias y palabras reservadas', () => {
    assert.equal(validateAlias(''), null);
    assert.equal(validateAlias('promo-2026'), 'promo-2026');
    assert.throws(() => validateAlias('api'), { status: 400 });
    assert.throws(() => validateAlias('no válido'), { status: 400 });
  });

  it('exige fechas de caducidad futuras', () => {
    assert.equal(parseExpiresAt(null), null);
    assert.ok(parseExpiresAt(new Date(Date.now() + 60_000).toISOString()) instanceof Date);
    assert.throws(() => parseExpiresAt('2000-01-01'), { status: 400 });
    assert.throws(() => parseExpiresAt('no es fecha'), { status: 400 });
  });

  it('valida rango y zona horaria', () => {
    assert.equal(parseRange(undefined), '7d');
    assert.throws(() => parseRange('1y'), { status: 400 });
    assert.equal(parseTimeZone('Europe/Madrid'), 'Europe/Madrid');
    assert.throws(() => parseTimeZone('Marte/Base'), { status: 400 });
  });
});

describe('enriquecimiento de clics', () => {
  it('extrae el dominio del referrer', () => {
    assert.deepEqual(parseReferrer('https://www.Google.com/search?q=1'), {
      referrer: 'https://www.google.com/search?q=1',
      referrerDomain: 'google.com',
    });
    assert.deepEqual(parseReferrer(undefined), { referrer: null, referrerDomain: null });
    assert.deepEqual(parseReferrer('no-es-url'), { referrer: null, referrerDomain: null });
  });

  it('detecta navegador, sistema y dispositivo', () => {
    assert.deepEqual(parseUserAgent(CHROME_WIN), { browser: 'Chrome', os: 'Windows', device: 'Escritorio', isBot: false });
    assert.deepEqual(parseUserAgent(SAFARI_IPHONE), { browser: 'Mobile Safari', os: 'iOS', device: 'Móvil', isBot: false });
  });

  it('marca bots y peticiones sin user-agent', () => {
    assert.equal(parseUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)').isBot, true);
    assert.equal(parseUserAgent('curl/8.5.0').isBot, true);
    assert.equal(parseUserAgent('').isBot, true);
  });

  it('geolocaliza IPs y descarta valores que no son IPs', () => {
    assert.equal(normalizeIp('::ffff:8.8.8.8'), '8.8.8.8');
    assert.equal(normalizeIp('x'.repeat(5000)), null);
    assert.equal(lookupGeo('8.8.8.8').country, 'US');
    assert.deepEqual(lookupGeo('127.0.0.1'), { country: null, region: null, city: null });
  });

  it('anonimiza al visitante de forma estable', () => {
    const a = visitorHash('1.2.3.4', CHROME_WIN);
    assert.equal(a, visitorHash('1.2.3.4', CHROME_WIN));
    assert.notEqual(a, visitorHash('1.2.3.5', CHROME_WIN));
    assert.match(a, /^[0-9a-f]{64}$/);
  });
});
