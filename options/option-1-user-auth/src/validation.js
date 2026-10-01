'use strict';
const { badRequest } = require('./lib/http');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254; // RFC 5321 path limit
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128; // caps scrypt work per request (DoS guard)

const isBlank = (v) => v === undefined || v === null || v === '';

/** Trim + lowercase so "  A@B.com " and "a@b.com" are the same account. */
function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function emailError(email) {
  if (isBlank(email)) return 'Email is required';
  if (typeof email !== 'string') return 'Email must be a string';
  if (email.length > EMAIL_MAX) return `Email must be at most ${EMAIL_MAX} characters`;
  if (!EMAIL_RE.test(email)) return 'Email format is invalid';
  return null;
}

function passwordStrengthError(password) {
  if (isBlank(password)) return 'Password is required';
  if (typeof password !== 'string') return 'Password must be a string';
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  return null;
}

function collect(errors) {
  const fields = Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
  if (Object.keys(fields).length) throw badRequest('Invalid input', fields);
}

/** Registration enforces the full password policy. Passwords are never trimmed. */
function validateRegistration(body) {
  const email = normalizeEmail(body.email);
  collect({ email: emailError(email), password: passwordStrengthError(body.password) });
  return { email, password: body.password };
}

/**
 * Login only checks shape: applying strength rules here would leak policy details
 * and lock out accounts created under an older policy.
 */
function validateLogin(body) {
  const email = normalizeEmail(body.email);
  let passwordError = null;
  if (isBlank(body.password)) passwordError = 'Password is required';
  else if (typeof body.password !== 'string') passwordError = 'Password must be a string';
  else if (body.password.length > PASSWORD_MAX) passwordError = `Password must be at most ${PASSWORD_MAX} characters`;
  collect({ email: emailError(email), password: passwordError });
  return { email, password: body.password };
}

module.exports = { validateRegistration, validateLogin, normalizeEmail, PASSWORD_MAX };
