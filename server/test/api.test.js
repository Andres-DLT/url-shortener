import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { setupIntegration } from './helpers.js';

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SAFARI_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

let ctx;
before(async () => {
  ctx = await setupIntegration();
});
after(async () => {
  await ctx?.teardown();
});

describe('API de enlaces', () => {
  it('crea un enlace con código aleatorio', async () => {
    const res = await request(ctx.app).post('/api/links').send({ url: 'ejemplo.com/articulo' }).expect(201);
    assert.match(res.body.link.code, /^[0-9a-z]{7}$/);
    assert.equal(res.body.link.targetUrl, 'https://ejemplo.com/articulo');
    assert.equal(res.body.link.shortUrl, `http://sho.rt/${res.body.link.code}`);
    assert.equal(res.body.link.status, 'active');
  });

  it('crea con alias y rechaza duplicados sin distinguir mayúsculas', async () => {
    await request(ctx.app).post('/api/links').send({ url: 'https://ejemplo.com/a', alias: 'Promo', title: 'Promo' }).expect(201);
    const dup = await request(ctx.app).post('/api/links').send({ url: 'https://ejemplo.com/b', alias: 'promo' }).expect(409);
    assert.equal(dup.body.error.code, 'conflict');
  });

  it('valida la entrada', async () => {
    await request(ctx.app).post('/api/links').send({ url: 'javascript:alert(1)' }).expect(400);
    await request(ctx.app).post('/api/links').send({ url: 'http://sho.rt/promo' }).expect(400);
    await request(ctx.app).post('/api/links').send({ url: 'https://ejemplo.com', alias: 'api' }).expect(400);
    await request(ctx.app).post('/api/links').set('content-type', 'application/json').send('{mal json').expect(400);
  });

  it('lista y busca enlaces', async () => {
    const all = await request(ctx.app).get('/api/links').expect(200);
    assert.equal(all.body.total, 2);
    const found = await request(ctx.app).get('/api/links?q=prom').expect(200);
    assert.deepEqual(found.body.items.map((l) => l.code), ['Promo']);
  });

  it('devuelve 404 para un enlace inexistente', async () => {
    await request(ctx.app).get('/api/links/noexiste').expect(404);
  });

  it('genera el QR en SVG', async () => {
    const res = await request(ctx.app).get('/api/links/promo/qr').expect(200);
    assert.match(res.headers['content-type'], /image\/svg\+xml/);
  });
});

describe('redirecciones y analíticas', () => {
  it('redirige con 302 sin distinguir mayúsculas', async () => {
    const res = await request(ctx.app).get('/PROMO').set('User-Agent', CHROME_WIN).expect(302);
    assert.equal(res.headers.location, 'https://ejemplo.com/a');
    assert.match(res.headers['cache-control'], /no-store/);
    await request(ctx.app).get('/no-existe').expect(404);
    await ctx.drainClicks(1);
  });

  it('registra clics enriquecidos a través del stream y separa los bots', async () => {
    await request(ctx.app).post('/api/links').send({ url: 'https://ejemplo.com/stats', alias: 'stats-test' }).expect(201);
    const visits = [
      { ua: SAFARI_IPHONE, ip: '81.33.0.1', ref: 'https://www.google.com/search?q=hola' }, // España
      { ua: SAFARI_IPHONE, ip: '81.33.0.1', ref: 'https://www.google.com/' }, // mismo visitante
      { ua: CHROME_WIN, ip: '8.8.8.8', ref: undefined }, // EE. UU., directo
      { ua: GOOGLEBOT, ip: '66.249.66.1', ref: undefined }, // bot
    ];
    for (const v of visits) {
      const req = request(ctx.app).get('/stats-test').set('User-Agent', v.ua).set('X-Forwarded-For', v.ip);
      if (v.ref) req.set('Referer', v.ref);
      await req.expect(302);
    }
    assert.equal(await ctx.drainClicks(4), 4);

    const res = await request(ctx.app).get('/api/links/stats-test/stats?range=24h&tz=Europe/Madrid').expect(200);
    const s = res.body;
    assert.equal(s.summary.clicks, 3);
    assert.equal(s.summary.visitors, 2);
    assert.equal(s.summary.botClicks, 1);
    assert.equal(s.summary.allTimeClicks, 3);
    assert.equal(s.link.clickCount, 3);
    assert.deepEqual(s.referrers.items, [{ key: 'google.com', clicks: 2 }, { key: '', clicks: 1 }]);
    assert.deepEqual(s.countries.items, [{ key: 'ES', clicks: 2 }, { key: 'US', clicks: 1 }]);
    assert.deepEqual(s.devices.items, [{ key: 'Móvil', clicks: 2 }, { key: 'Escritorio', clicks: 1 }]);
    assert.equal(s.timeseries.points.length, 24);
    assert.equal(s.timeseries.points.reduce((sum, p) => sum + p.clicks, 0), 3);
    assert.equal(s.recentClicks.length, 3);
    assert.equal(s.activity.reduce((sum, a) => sum + a.clicks, 0), 3);
  });

  it('cachea las estadísticas y las invalida al llegar clics nuevos', async () => {
    const url = '/api/links/stats-test/stats?range=7d&tz=UTC';
    assert.equal((await request(ctx.app).get(url)).body.cached, false);
    assert.equal((await request(ctx.app).get(url)).body.cached, true);

    await request(ctx.app).get('/stats-test').set('User-Agent', CHROME_WIN).set('X-Forwarded-For', '1.1.1.1').expect(302);
    await ctx.drainClicks(1);
    const fresh = (await request(ctx.app).get(url)).body;
    assert.equal(fresh.cached, false);
    assert.equal(fresh.summary.clicks, 4);
  });

  it('devuelve el resumen global', async () => {
    const res = await request(ctx.app).get('/api/overview?range=30d&tz=America/Mexico_City').expect(200);
    assert.equal(res.body.summary.totalLinks, 3);
    assert.equal(res.body.summary.clicks, 5);
    assert.equal(res.body.topLinks[0].code, 'stats-test');
    assert.equal(res.body.timeseries.points.length, 30);
  });

  it('desactivar un enlace invalida la caché y responde 410', async () => {
    await request(ctx.app).get('/stats-test').set('User-Agent', CHROME_WIN).expect(302); // queda en caché
    await ctx.drainClicks(1);
    const res = await request(ctx.app).patch('/api/links/stats-test').send({ isActive: false }).expect(200);
    assert.equal(res.body.link.status, 'disabled');
    await request(ctx.app).get('/stats-test').expect(410);
    await request(ctx.app).patch('/api/links/stats-test').send({ isActive: true }).expect(200);
    await request(ctx.app).get('/stats-test').set('User-Agent', CHROME_WIN).expect(302);
    await ctx.drainClicks(1);
  });

  it('borrar un enlace elimina sus clics y la redirección', async () => {
    await request(ctx.app).delete('/api/links/stats-test').expect(204);
    await request(ctx.app).get('/stats-test').expect(404);
    const { rows: [{ count }] } = await ctx.pool.query('SELECT count(*) FROM clicks c JOIN links l ON l.id = c.link_id WHERE l.code = $1', ['stats-test']);
    assert.equal(count, 0);
  });

  it('informa del estado de Postgres y Redis', async () => {
    const res = await request(ctx.app).get('/health').expect(200);
    assert.deepEqual(res.body, { status: 'ok', postgres: 'ok', redis: 'ok' });
  });
});
