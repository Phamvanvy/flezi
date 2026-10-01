'use strict';
const { listen } = require('./lib/http');
const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3003;
// Catalog is read-only sample data, so an in-memory DB re-seeded on start is enough.
const { handler } = createApp();
listen(handler, port).then(() => console.log(`Catalog app running at http://localhost:${port}`));
