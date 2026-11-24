import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import request from 'supertest';
import { setupIntegration } from './helpers.js';

let ctx;
before(async () => {
  ctx = await setupIntegration({ RATE_LIMIT_MAX_CREATES: '3', RATE_LIMIT_WINDOW: '3600' });
});
after(async () => {
  await ctx?.teardown();
});

it('limita la creación de enlaces por IP', async () => {
  const create = (ip) => request(ctx.app).post('/api/links').set('X-Forwarded-For', ip).send({ url: 'https://ejemplo.com' });

  for (let i = 0; i < 3; i += 1) await create('203.0.113.7').expect(201);
  const limited = await create('203.0.113.7').expect(429);
  assert.equal(limited.body.error.code, 'rate_limited');
  assert.ok(Number(limited.headers['retry-after']) > 0);

  // Otra IP tiene su propio contador.
  await create('203.0.113.8').expect(201);
});
