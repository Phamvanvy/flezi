'use strict';
// HS256 JWT built on node:crypto (no dependency). Signature compared in constant time.
const crypto = require('node:crypto');

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function createTokenService({ secret = process.env.JWT_SECRET, ttlSeconds = 3600, now = () => Date.now() } = {}) {
  // Random per-process secret when none configured: tokens simply stop working on restart.
  const key = secret || crypto.randomBytes(32).toString('hex');

  const sign = (data) => crypto.createHmac('sha256', key).update(data).digest();

  function issue(claims) {
    const iat = Math.floor(now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = b64url(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds }));
    const signature = b64url(sign(`${header}.${payload}`));
    return { token: `${header}.${payload}.${signature}`, expiresIn: ttlSeconds };
  }

  /** Returns the claims, or null for any malformed, forged or expired token. */
  function verify(token) {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    const expected = sign(`${header}.${payload}`);
    const given = Buffer.from(signature, 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now()) return null;
      return claims;
    } catch {
      return null;
    }
  }

  return { issue, verify, ttlSeconds };
}

/** Reads a bearer token from the Authorization header, falling back to the HttpOnly cookie. */
function readToken(ctx, cookieName = 'session') {
  const auth = ctx.req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return ctx.cookies[cookieName] || null;
}

function sessionCookie(token, maxAgeSeconds, name = 'session') {
  // HttpOnly: unreadable from JS (XSS can't steal it). SameSite=Strict: no cross-site sends (CSRF).
  return `${name}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}; Secure`;
}

function clearCookie(name = 'session') {
  return `${name}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0; Secure`;
}

module.exports = { createTokenService, readToken, sessionCookie, clearCookie };
