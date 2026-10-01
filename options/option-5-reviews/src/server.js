'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { listen } = require('./lib/http');
const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3005;
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const { handler } = createApp({ dbFile: process.env.DB_FILE || path.join(dataDir, 'reviews.db') });
listen(handler, port).then(() => console.log(`Reviews app running at http://localhost:${port}`));
