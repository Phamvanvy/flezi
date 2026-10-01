'use strict';
const crypto = require('node:crypto');
const { conflict, HttpError } = require('./lib/http');
const { hashPassword, verifyPassword } = require('./password');
const { validateRegistration, validateLogin } = require('./validation');

const INVALID_CREDENTIALS = 'Invalid email or password';

const toSafeUser = (row) => ({ id: row.id, email: row.email, createdAt: row.created_at });

function createAuthService({ db, tokens, limiter }) {
  const insertUser = db.prepare('INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)');
  const findByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const findById = db.prepare('SELECT * FROM users WHERE id = ?');

  // Hash compared against when the email is unknown, so "no such user" costs the same
  // scrypt time as "wrong password" (prevents timing-based user enumeration).
  let dummyHash;
  const getDummyHash = async () => (dummyHash ??= await hashPassword('timing-equaliser-0'));

  async function register(body) {
    const { email, password } = validateRegistration(body);
    if (findByEmail.get(email)) throw conflict('Email already in use');
    const passwordHash = await hashPassword(password);
    const row = { id: crypto.randomUUID(), email, password_hash: passwordHash, created_at: new Date().toISOString() };
    try {
      insertUser.run(row.id, row.email, row.password_hash, row.created_at);
    } catch (err) {
      // Two concurrent registrations can both pass the pre-check; the UNIQUE index decides.
      if (/UNIQUE constraint failed/.test(err.message)) throw conflict('Email already in use');
      throw err;
    }
    return toSafeUser(row);
  }

  async function login(body, clientIp = 'unknown') {
    const { email, password } = validateLogin(body);
    const limiterKey = `${email}|${clientIp}`;
    limiter.assertAllowed(limiterKey);

    const row = findByEmail.get(email);
    const ok = await verifyPassword(password, row ? row.password_hash : await getDummyHash());
    if (!row || !ok) {
      limiter.recordFailure(limiterKey);
      throw new HttpError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
    }
    limiter.reset(limiterKey);
    const { token, expiresIn } = tokens.issue({ sub: row.id, email: row.email });
    return { token, expiresIn, user: { id: row.id, email: row.email } };
  }

  function getUser(id) {
    const row = findById.get(id);
    return row ? toSafeUser(row) : null;
  }

  return { register, login, getUser };
}

module.exports = { createAuthService, INVALID_CREDENTIALS };
