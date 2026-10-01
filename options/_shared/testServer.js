'use strict';
// Starts an app handler on an ephemeral port and returns a tiny JSON client.
const http = require('node:http');

async function startServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(method, path, { body, token, headers = {}, raw } = {}) {
    const h = { ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (token) h.Authorization = `Bearer ${token}`;
    const res = await fetch(base + path, {
      method,
      headers: h,
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, body: json, headers: res.headers };
  }

  return {
    base,
    request,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = { startServer };
