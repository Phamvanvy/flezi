'use strict';
const path = require('node:path');
const { createRouter, createHandler, unauthorized } = require('./lib/http');
const { createTokenService, readToken, sessionCookie, clearCookie } = require('./lib/token');
const { openDb } = require('./db');
const { createLoginLimiter } = require('./rateLimiter');
const { createAuthService } = require('./authService');

function createApp({ dbFile = ':memory:', tokenTtlSeconds = 3600, quiet = false, limiterOptions } = {}) {
  const db = openDb(dbFile);
  const tokens = createTokenService({ ttlSeconds: tokenTtlSeconds });
  const auth = createAuthService({ db, tokens, limiter: createLoginLimiter(limiterOptions) });
  const router = createRouter();

  router.post('/register', async (ctx) => ({ status: 201, body: await auth.register(await ctx.body()) }));

  router.post('/login', async (ctx) => {
    const result = await auth.login(await ctx.body(), ctx.req.socket.remoteAddress);
    // Token in the body satisfies the API contract; the HttpOnly cookie is what the
    // browser UI relies on, so the token never has to sit in localStorage.
    return { status: 200, body: result, headers: { 'Set-Cookie': sessionCookie(result.token, result.expiresIn) } };
  });

  router.post('/logout', async () => ({ status: 204, headers: { 'Set-Cookie': clearCookie() } }));

  router.get('/me', async (ctx) => {
    const claims = tokens.verify(readToken(ctx));
    const user = claims && auth.getUser(claims.sub);
    if (!user) throw unauthorized();
    return { status: 200, body: user };
  });

  const handler = createHandler(router, { publicDir: path.join(__dirname, '..', 'public'), quiet });
  return { handler, db, tokens, auth };
}

module.exports = { createApp };
