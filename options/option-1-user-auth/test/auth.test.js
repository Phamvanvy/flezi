'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { hashPassword, verifyPassword } = require('../src/password');
const { createTokenService } = require('../src/lib/token');
const { startServer } = require('./helpers');

const VALID = { email: 'a@b.com', password: 'Secret123' };

describe('Option 1 - User Registration & Login', () => {
  let app;
  let api;

  beforeEach(async () => {
    if (api) await api.close();
    app = createApp({ quiet: true });
    api = await startServer(app.handler);
  });
  after(async () => api && api.close());

  describe('Unit test scenarios (spec table)', () => {
    it('#1 valid new email + password -> user is created and hash != plaintext', async () => {
      const res = await api.request('POST', '/register', { body: VALID });
      assert.equal(res.status, 201);
      assert.equal(res.body.email, 'a@b.com');
      assert.ok(res.body.id);
      assert.ok(res.body.createdAt);
      const row = app.db.prepare('SELECT password_hash FROM users WHERE email = ?').get('a@b.com');
      assert.notEqual(row.password_hash, VALID.password);
      assert.match(row.password_hash, /^scrypt\$/);
      assert.ok(!row.password_hash.includes(VALID.password));
    });

    it('#2 already-registered email -> 409 and no duplicate created', async () => {
      await api.request('POST', '/register', { body: VALID });
      const res = await api.request('POST', '/register', { body: VALID });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.message, 'Email already in use');
      const { n } = app.db.prepare('SELECT COUNT(*) AS n FROM users').get();
      assert.equal(n, 1);
    });

    it('#3 invalid email or short password -> 400 with per-field errors', async () => {
      const res = await api.request('POST', '/register', { body: { email: 'not-an-email', password: 'short1' } });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(res.body.error.fields.email);
      assert.ok(res.body.error.fields.password);
    });

    it('#4 registered user + correct password -> token with expiry', async () => {
      await api.request('POST', '/register', { body: VALID });
      const res = await api.request('POST', '/login', { body: VALID });
      assert.equal(res.status, 200);
      assert.equal(typeof res.body.token, 'string');
      assert.equal(res.body.expiresIn, 3600);
      assert.equal(res.body.user.email, 'a@b.com');
      const claims = app.tokens.verify(res.body.token);
      assert.ok(claims.exp > claims.iat);
    });

    it('#5 registered user + wrong password -> 401 with generic message', async () => {
      await api.request('POST', '/register', { body: VALID });
      const wrong = await api.request('POST', '/login', { body: { ...VALID, password: 'Wrong1234' } });
      const unknown = await api.request('POST', '/login', { body: { email: 'nobody@b.com', password: 'Secret123' } });
      assert.equal(wrong.status, 401);
      assert.equal(wrong.body.error.message, 'Invalid email or password');
      // Same response for an unknown email: no user enumeration.
      assert.equal(unknown.status, 401);
      assert.deepEqual(unknown.body, wrong.body);
    });

    it('#6 stored hash + correct password -> verify returns true (round-trip)', async () => {
      const hash = await hashPassword('Secret123');
      assert.equal(await verifyPassword('Secret123', hash), true);
      assert.equal(await verifyPassword('Secret124', hash), false);
      // Per-user salt: same password never yields the same hash.
      assert.notEqual(await hashPassword('Secret123'), hash);
    });
  });

  describe('Acceptance criteria & edge cases', () => {
    it('never exposes the password or hash in any response', async () => {
      const reg = await api.request('POST', '/register', { body: VALID });
      const login = await api.request('POST', '/login', { body: VALID });
      const me = await api.request('GET', '/me', { token: login.body.token });
      for (const res of [reg, login, me]) {
        const text = JSON.stringify(res.body);
        assert.ok(!/password|hash|scrypt/i.test(text), `leak in ${text}`);
      }
    });

    it('treats different casing/whitespace as the same account', async () => {
      await api.request('POST', '/register', { body: { email: '  User@Example.COM ', password: 'Secret123' } });
      const dup = await api.request('POST', '/register', { body: { email: 'user@example.com', password: 'Secret123' } });
      assert.equal(dup.status, 409);
      const login = await api.request('POST', '/login', { body: { email: 'USER@example.com', password: 'Secret123' } });
      assert.equal(login.status, 200);
      assert.equal(login.body.user.email, 'user@example.com');
    });

    it('rejects empty or missing fields with 400', async () => {
      const res = await api.request('POST', '/register', { body: {} });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.fields.email, 'Email is required');
      assert.equal(res.body.error.fields.password, 'Password is required');
      const login = await api.request('POST', '/login', { body: { email: '', password: '' } });
      assert.equal(login.status, 400);
    });

    it('requires a letter and a number in the password', async () => {
      const lettersOnly = await api.request('POST', '/register', { body: { email: 'x@y.com', password: 'abcdefgh' } });
      const digitsOnly = await api.request('POST', '/register', { body: { email: 'x@y.com', password: '12345678' } });
      assert.equal(lettersOnly.status, 400);
      assert.equal(digitsOnly.status, 400);
    });

    it('rejects extremely long input values', async () => {
      const longEmail = await api.request('POST', '/register', { body: { email: `${'a'.repeat(300)}@b.com`, password: 'Secret123' } });
      assert.equal(longEmail.status, 400);
      const longPassword = await api.request('POST', '/register', { body: { email: 'x@y.com', password: `A1${'a'.repeat(200)}` } });
      assert.equal(longPassword.status, 400);
      const hugeBody = await api.request('POST', '/register', { raw: JSON.stringify({ email: 'x@y.com', password: 'a'.repeat(20000) }), headers: { 'Content-Type': 'application/json' } });
      assert.equal(hugeBody.status, 413);
    });

    it('login before any registration exists -> 401 generic', async () => {
      const res = await api.request('POST', '/login', { body: VALID });
      assert.equal(res.status, 401);
      assert.equal(res.body.error.message, 'Invalid email or password');
    });

    it('rejects malformed JSON with 400', async () => {
      const res = await api.request('POST', '/register', { raw: '{"email":', headers: { 'Content-Type': 'application/json' } });
      assert.equal(res.status, 400);
    });

    it('sets an HttpOnly, SameSite=Strict session cookie on login', async () => {
      await api.request('POST', '/register', { body: VALID });
      const res = await api.request('POST', '/login', { body: VALID });
      const cookie = res.headers.get('set-cookie');
      assert.match(cookie, /HttpOnly/);
      assert.match(cookie, /SameSite=Strict/);
    });

    it('protects /me: 401 without, with tampered or with expired token', async () => {
      await api.request('POST', '/register', { body: VALID });
      const { body } = await api.request('POST', '/login', { body: VALID });
      assert.equal((await api.request('GET', '/me')).status, 401);
      const tampered = body.token.slice(0, -2) + (body.token.endsWith('AA') ? 'BB' : 'AA');
      assert.equal((await api.request('GET', '/me', { token: tampered })).status, 401);
      const ok = await api.request('GET', '/me', { token: body.token });
      assert.equal(ok.status, 200);

      let clock = Date.now();
      const tokens = createTokenService({ secret: 's', ttlSeconds: 60, now: () => clock });
      const { token } = tokens.issue({ sub: 'u1' });
      assert.ok(tokens.verify(token));
      clock += 61_000;
      assert.equal(tokens.verify(token), null);
    });

    it('locks out repeated failed logins with 429', async () => {
      await api.request('POST', '/register', { body: VALID });
      for (let i = 0; i < 5; i++) {
        const r = await api.request('POST', '/login', { body: { ...VALID, password: 'Wrong1234' } });
        assert.equal(r.status, 401);
      }
      const locked = await api.request('POST', '/login', { body: VALID });
      assert.equal(locked.status, 429);
      assert.ok(Number(locked.headers.get('retry-after')) > 0);
    });

    it('never logs raw passwords or tokens', async () => {
      const lines = [];
      const original = console.log;
      console.log = (...args) => lines.push(args.join(' '));
      try {
        const loud = createApp({ quiet: false });
        const srv = await startServer(loud.handler);
        await srv.request('POST', '/register', { body: VALID });
        const { body } = await srv.request('POST', '/login', { body: VALID });
        await srv.close();
        const log = lines.join('\n');
        assert.ok(log.includes('POST /login'));
        assert.ok(!log.includes(VALID.password));
        assert.ok(!log.includes(body.token));
      } finally {
        console.log = original;
      }
    });
  });
});
