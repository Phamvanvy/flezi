'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { listen } = require('./lib/http');
const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3004;
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

// File-backed DB so a user's cart survives page reloads and server restarts.
const { handler } = createApp({ dbFile: process.env.DB_FILE || path.join(dataDir, 'cart.db') });
listen(handler, port).then(() => console.log(`Cart app running at http://localhost:${port}`));
