'use strict';
// scrypt (memory-hard, adaptive) with a random 16-byte salt per user.
// Stored format: scrypt$N$r$p$<salt b64>$<hash b64> so cost can be raised later
// without breaking existing hashes.
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const DEFAULTS = { N: 16384, r: 8, p: 1, keyLen: 64 };

async function hashPassword(password, params = DEFAULTS) {
  const { N, r, p, keyLen } = params;
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, keyLen, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  // Constant-time comparison: no early exit that leaks how many bytes matched.
  return crypto.timingSafeEqual(actual, expected);
}

module.exports = { hashPassword, verifyPassword };
