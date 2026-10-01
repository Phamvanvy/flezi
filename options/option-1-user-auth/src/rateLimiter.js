'use strict';
// In-memory failed-login limiter keyed by email+IP. Design note: in a multi-instance
// deployment this state would move to Redis (INCR + EXPIRE) so all nodes share it.
const { HttpError } = require('./lib/http');

function createLoginLimiter({ maxFailures = 5, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
  const failures = new Map(); // key -> { count, first }

  function entry(key) {
    const e = failures.get(key);
    if (e && now() - e.first > windowMs) {
      failures.delete(key);
      return null;
    }
    return e;
  }

  return {
    assertAllowed(key) {
      const e = entry(key);
      if (e && e.count >= maxFailures) {
        const retryAfter = Math.ceil((e.first + windowMs - now()) / 1000);
        const err = new HttpError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed attempts. Try again later.');
        err.retryAfter = retryAfter;
        throw err;
      }
    },
    recordFailure(key) {
      const e = entry(key);
      if (e) e.count += 1;
      else failures.set(key, { count: 1, first: now() });
    },
    reset(key) {
      failures.delete(key);
    },
  };
}

module.exports = { createLoginLimiter };
