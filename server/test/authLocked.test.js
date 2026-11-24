import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import request from 'supertest';
import { setupIntegration } from './helpers.js';

let ctx;
before(async () => {
  // Producción sin ADMIN_PASSWORD: nunca se deja la gestión abierta.
  ctx = await setupIntegration({ NODE_ENV: 'production', ADMIN_PASSWORD: '' });
});
after(async () => {
  await ctx?.teardown();
});

it('en producción sin contraseña la gestión queda bloqueada', async () => {
  const cfg = await request(ctx.app).get('/api/config').expect(200);
  assert.equal(cfg.body.session.mode, 'locked');
  const res = await request(ctx.app).post('/api/links').send({ url: 'https://ejemplo.com' }).expect(403);
  assert.equal(res.body.error.code, 'locked');
  await request(ctx.app).post('/api/auth/login').send({ password: '' }).expect(400);
  await request(ctx.app).get('/api/links').expect(200);
});
