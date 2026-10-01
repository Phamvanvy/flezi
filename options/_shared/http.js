'use strict';
// Minimal zero-dependency HTTP toolkit: router, JSON body parsing, static files,
// consistent error shape { error: { code, message, fields? } }.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const MAX_BODY_BYTES = 16 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const badRequest = (message, fields) => new HttpError(400, 'VALIDATION_ERROR', message, fields);
const unauthorized = (message = 'Authentication required') => new HttpError(401, 'UNAUTHORIZED', message);
const forbidden = (message = 'Forbidden') => new HttpError(403, 'FORBIDDEN', message);
const notFound = (message = 'Not found') => new HttpError(404, 'NOT_FOUND', message);
const conflict = (message) => new HttpError(409, 'CONFLICT', message);

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'");
}

function send(res, status, body, headers = {}) {
  securityHeaders(res);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  if (status === 204 || body === undefined) {
    res.writeHead(status);
    return res.end();
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(payload);
}

function sendError(res, err) {
  if (err instanceof HttpError) {
    const error = { code: err.code, message: err.message };
    if (err.fields) error.fields = err.fields;
    const headers = err.retryAfter ? { 'Retry-After': String(err.retryAfter) } : {};
    return send(res, err.status, { error }, headers);
  }
  // Never echo internals (stack, SQL) to the client.
  console.error('[error]', err && err.message);
  return send(res, 500, { error: { code: 'INTERNAL', message: 'Unexpected server error' } });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = req.headers['content-type'] || '';
    const tooLarge = () => new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
    if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
      req.resume(); // drain without buffering so the client still receives the 413
      return reject(tooLarge());
    }
    let size = 0;
    let overflow = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        overflow = true; // stop buffering; keep draining instead of destroying the socket
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (overflow) return reject(tooLarge());
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      if (!type.includes('application/json')) {
        return reject(badRequest('Content-Type must be application/json'));
      }
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(badRequest('Body must be a JSON object'));
        }
        resolve(parsed);
      } catch {
        reject(badRequest('Malformed JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function createRouter() {
  const routes = [];
  const add = (method) => (pattern, handler) => {
    const keys = [];
    const source = pattern.replace(/:(\w+)/g, (_, k) => {
      keys.push(k);
      return '([^/]+)';
    });
    routes.push({ method, re: new RegExp(`^${source}/?$`), keys, handler });
  };
  return {
    get: add('GET'),
    post: add('POST'),
    put: add('PUT'),
    delete: add('DELETE'),
    match(method, pathname) {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method) continue;
        const params = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { handler: r.handler, params };
      }
      return pathMatched ? { methodNotAllowed: true } : null;
    },
  };
}

function serveStatic(publicDir, pathname, res) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(publicDir, rel));
  if (!file.startsWith(path.normalize(publicDir + path.sep))) return false;
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  securityHeaders(res);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
  return true;
}

/**
 * Builds a node:http request handler.
 * Route handlers receive ctx = { req, res, params, query, url, body() } and return
 * { status, body, headers } (or throw HttpError).
 */
function createHandler(router, { publicDir, quiet = false } = {}) {
  return async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, 'http://localhost');
    try {
      const hit = router.match(req.method, url.pathname);
      if (hit && hit.methodNotAllowed) throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
      if (hit) {
        const ctx = {
          req,
          res,
          url,
          params: hit.params,
          query: url.searchParams,
          cookies: parseCookies(req.headers.cookie),
          body: () => readJson(req),
        };
        const out = (await hit.handler(ctx)) || { status: 204 };
        send(res, out.status || 200, out.body, out.headers);
      } else if (req.method === 'GET' && publicDir && serveStatic(publicDir, url.pathname, res)) {
        // static asset served
      } else {
        throw notFound('Route not found');
      }
    } catch (err) {
      sendError(res, err);
    } finally {
      // Log method, path and status only: never bodies, passwords or tokens.
      if (!quiet) console.log(`${req.method} ${url.pathname} -> ${res.statusCode} (${Date.now() - started}ms)`);
    }
  };
}

function listen(handler, port) {
  const server = http.createServer(handler);
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  createRouter,
  createHandler,
  listen,
  parseCookies,
};
