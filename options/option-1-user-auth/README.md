# Option 1 — User Registration & Login

Flow-2 hands-on · Program **Flezi-E1-Dev** · Account **vypv**

A secure authentication slice: register, log in, and a protected landing page.
Zero npm dependencies — Node.js built-ins only (`node:http`, `node:crypto`, `node:sqlite`, `node:test`).

## How to run

Requires **Node.js ≥ 22.5** (for the built-in `node:sqlite`). No `npm install` needed.

```bash
npm start        # http://localhost:3001  (PORT / DB_FILE / JWT_SECRET env vars optional)
npm test         # 17 tests: 6 spec scenarios + 11 acceptance/edge-case tests
```

## API

| Method | Path | Success | Errors |
|---|---|---|---|
| POST | `/register` `{ email, password }` | `201 { id, email, createdAt }` | `400` per-field errors, `409` email exists |
| POST | `/login` `{ email, password }` | `200 { token, expiresIn, user }` + HttpOnly cookie | `400`, `401` generic, `429` locked out |
| GET | `/me` | `200 { id, email, createdAt }` | `401` |
| POST | `/logout` | `204` (clears cookie) | — |

Error shape everywhere: `{ "error": { "code", "message", "fields?" } }`.

## Design decisions

- **Hashing:** scrypt (memory-hard, adaptive) with a random 16-byte salt per user; stored as `scrypt$N$r$p$salt$hash` so cost can be raised later.
- **Constant time:** hashes compared with `crypto.timingSafeEqual`; unknown emails are verified against a dummy hash so "no such user" and "wrong password" take the same time and return the same `401 Invalid email or password`.
- **Normalisation:** email is trimmed + lowercased before validation and storage; `UNIQUE` index on `email` is the final guard against concurrent duplicate registrations.
- **Token:** HS256 JWT (1h expiry) returned in the body (API contract) **and** set as an `HttpOnly; SameSite=Strict; Secure` cookie. The browser UI relies on the cookie, so the token is never stored in `localStorage` (XSS-safe).
- **Lockout:** 5 failed logins per email+IP within 15 min → `429` with `Retry-After`. In-memory; production would use Redis.
- **Limits:** email ≤ 254 chars, password 8–128 chars (caps scrypt work), body ≤ 16 KB (`413`).
- **Logging:** method, path, status and latency only — never bodies, passwords or tokens (covered by a test).

## Spec test scenarios → tests (`test/auth.test.js`)

| # | Given / When / Then | Test |
|---|---|---|
| 1 | Valid new email + password → user created, hash ≠ plaintext | `#1 valid new email + password` |
| 2 | Already-registered email → 409, no duplicate | `#2 already-registered email` |
| 3 | Invalid email / short password → 400 with field errors | `#3 invalid email or short password` |
| 4 | Registered user + correct password → token with expiry | `#4 registered user + correct password` |
| 5 | Registered user + wrong password → 401 generic | `#5 registered user + wrong password` |
| 6 | Stored hash + correct password → verify true | `#6 stored hash + correct password` |

Edge cases covered: casing/whitespace, empty fields, extremely long input, login before registration, malformed JSON, tampered/expired token, lockout, no secrets in logs.

## Story point estimation

| Factor | Assessment |
|---|---|
| Complexity | Medium-high: hashing, token signing, timing-safe compare and enumeration-safe errors are easy to get subtly wrong. |
| Effort | Medium: 3 endpoints + protected route, 2 views (form + landing), 17 tests. |
| Uncertainty / Risk | Medium: security-sensitive; token storage choice (cookie vs storage) needs a decision. |
| **Estimate** | **5 points** |
| Rationale | Smaller than a full auth system (no reset/verify email), but the security requirements push it above a plain CRUD story (3). |
