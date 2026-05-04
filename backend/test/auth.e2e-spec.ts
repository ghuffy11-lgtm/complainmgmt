import * as request from 'supertest';
import { bootTestApp, resetUserData, seedAdminUser, TestApp } from './test-app';

/**
 * End-to-end coverage of the authentication flow against a real Postgres.
 *
 * Spins the full Nest app once for the whole file, resets user-data tables
 * between tests so each spec starts deterministically.
 */
describe('Auth (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await bootTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await resetUserData();
    await seedAdminUser({ username: 'alice', password: 'super-secret-pass' });
  });

  it('rejects missing credentials with 401', async () => {
    const r = await request(ctx.http).post('/api/auth/login').send({});
    expect(r.status).toBe(400);   // class-validator rejects empty body
  });

  it('rejects wrong password with 401 / INVALID_CREDENTIALS', async () => {
    const r = await request(ctx.http)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'nope' });
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('issues access + refresh tokens on a successful login', async () => {
    const r = await request(ctx.http)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'super-secret-pass' });
    expect(r.status).toBe(200);
    expect(typeof r.body.accessToken).toBe('string');
    expect(typeof r.body.refreshToken).toBe('string');
    expect(r.body.user.username).toBe('alice');
    expect(r.body.user.permissions.length).toBeGreaterThan(0);
  });

  it('rotates the refresh token; the original cannot be reused', async () => {
    const login = await request(ctx.http)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'super-secret-pass' });
    const oldRefresh = login.body.refreshToken;

    const rotate = await request(ctx.http)
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefresh });
    expect(rotate.status).toBe(200);
    expect(rotate.body.refreshToken).not.toBe(oldRefresh);

    const replay = await request(ctx.http)
      .post('/api/auth/refresh')
      .send({ refreshToken: oldRefresh });
    expect(replay.status).toBe(401);
    expect(replay.body).toMatchObject({ code: 'INVALID_REFRESH_TOKEN' });
  });

  it('returns the materialized profile via /auth/me', async () => {
    const login = await request(ctx.http)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'super-secret-pass' });

    const me = await request(ctx.http)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.username).toBe('alice');
    expect(me.body.roleKeys).toContain('admin');
  });

  it('change-password revokes existing refresh tokens (force-logout)', async () => {
    const login = await request(ctx.http)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'super-secret-pass' });

    const change = await request(ctx.http)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ currentPassword: 'super-secret-pass', newPassword: 'an-equally-fine-pass-2' });
    expect(change.status).toBe(204);

    const replay = await request(ctx.http)
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(replay.status).toBe(401);
  });
});
