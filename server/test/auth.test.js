import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';
import request from 'supertest';
import { setupIntegration } from './helpers.js';

const PASSWORD = 'contraseña-de-prueba';
let ctx;
before(async () => {
  ctx = await setupIntegration({ ADMIN_PASSWORD: PASSWORD, PUBLIC_DASHBOARD: 'true' });
});
after(async () => {
  await ctx?.teardown();
});

it('el panel es público pero de solo lectura sin sesión', async () => {
  const cfg = await request(ctx.app).get('/api/config').expect(200);
  assert.deepEqual(cfg.body.session, { mode: 'password', authenticated: false, canEdit: false, canView: true });

  await request(ctx.app).get('/api/links').expect(200);
  await request(ctx.app).get('/api/overview').expect(200);
  const denied = await request(ctx.app).post('/api/links').send({ url: 'https://ejemplo.com' }).expect(401);
  assert.equal(denied.body.error.code, 'unauthorized');
});

it('rechaza contraseñas incorrectas', async () => {
  await request(ctx.app).post('/api/auth/login').send({ password: 'mala' }).expect(401);
  await request(ctx.app).post('/api/auth/login').send({}).expect(401);
});

it('con sesión se puede crear, editar y borrar', async () => {
  const agent = request.agent(ctx.app);
  const login = await agent.post('/api/auth/login').send({ password: PASSWORD }).expect(200);
  const cookie = login.headers['set-cookie'][0];
  assert.match(cookie, /^sid=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);

  const me = await agent.get('/api/config').expect(200);
  assert.equal(me.body.session.canEdit, true);

  await agent.post('/api/links').send({ url: 'https://ejemplo.com', alias: 'privado' }).expect(201);
  await agent.patch('/api/links/privado').send({ isActive: false }).expect(200);
  await agent.delete('/api/links/privado').expect(204);

  await agent.post('/api/auth/logout').expect(204);
  await agent.post('/api/links').send({ url: 'https://ejemplo.com' }).expect(401);
});

it('ignora cookies manipuladas', async () => {
  const login = await request(ctx.app).post('/api/auth/login').send({ password: PASSWORD }).expect(200);
  const token = login.headers['set-cookie'][0].split(';')[0].slice('sid='.length);
  const [payload, signature] = decodeURIComponent(token).split('.');
  const forged = Buffer.from(JSON.stringify({ role: 'admin', exp: Date.now() + 1e12 })).toString('base64url');

  await request(ctx.app).post('/api/links').set('Cookie', `sid=${forged}.${signature}`).send({ url: 'https://ejemplo.com' }).expect(401);
  await request(ctx.app).post('/api/links').set('Cookie', `sid=${payload}.firma-falsa`).send({ url: 'https://ejemplo.com' }).expect(401);
  await request(ctx.app).post('/api/links').set('Cookie', `sid=${payload}.${signature}`).send({ url: 'https://ejemplo.com' }).expect(201);
});
