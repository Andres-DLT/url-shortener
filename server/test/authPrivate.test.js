import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import request from 'supertest';
import { setupIntegration } from './helpers.js';

let ctx;
before(async () => {
  ctx = await setupIntegration({ ADMIN_PASSWORD: 'secreta', PUBLIC_DASHBOARD: 'false' });
});
after(async () => {
  await ctx?.teardown();
});

it('con PUBLIC_DASHBOARD=false hay que iniciar sesión también para ver', async () => {
  const cfg = await request(ctx.app).get('/api/config').expect(200);
  assert.equal(cfg.body.session.canView, false);
  await request(ctx.app).get('/api/links').expect(401);
  await request(ctx.app).get('/api/overview').expect(401);

  const agent = request.agent(ctx.app);
  await agent.post('/api/auth/login').send({ password: 'secreta' }).expect(200);
  await agent.get('/api/links').expect(200);
  await agent.get('/api/overview').expect(200);
});

it('las redirecciones siguen siendo públicas', async () => {
  const agent = request.agent(ctx.app);
  await agent.post('/api/auth/login').send({ password: 'secreta' }).expect(200);
  await agent.post('/api/links').send({ url: 'https://ejemplo.com/publico', alias: 'publico' }).expect(201);
  const res = await request(ctx.app).get('/publico').expect(302);
  assert.equal(res.headers.location, 'https://ejemplo.com/publico');
  await ctx.drainClicks(1);
});
