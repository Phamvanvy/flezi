'use strict';
// Lightweight sign-in for Options 2/4/5: the user picks a username and receives the same
// signed HS256 token + HttpOnly cookie used in Option 1. Full password auth is Option 1's
// scope; here the point is a trustworthy *identity* for ownership checks.
const { badRequest, unauthorized } = require('./http');
const { readToken, sessionCookie, clearCookie } = require('./token');

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

function mountDemoAuth(router, tokens) {
  router.post('/session', async (ctx) => {
    const body = await ctx.body();
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    if (!USERNAME_RE.test(username)) {
      throw badRequest('Invalid input', { username: 'Use 3-20 letters, numbers or underscores' });
    }
    const { token, expiresIn } = tokens.issue({ sub: username, name: username });
    return {
      status: 200,
      body: { token, expiresIn, user: { id: username, name: username } },
      headers: { 'Set-Cookie': sessionCookie(token, expiresIn) },
    };
  });

  router.get('/session', async (ctx) => {
    const user = requireUser(ctx, tokens);
    return { status: 200, body: { user } };
  });

  router.delete('/session', async () => ({ status: 204, headers: { 'Set-Cookie': clearCookie() } }));
}

/** Resolves the caller from the bearer token / cookie or throws 401. */
function requireUser(ctx, tokens) {
  const claims = tokens.verify(readToken(ctx));
  if (!claims) throw unauthorized();
  return { id: claims.sub, name: claims.name };
}

module.exports = { mountDemoAuth, requireUser };
