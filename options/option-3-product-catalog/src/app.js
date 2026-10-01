'use strict';
const path = require('node:path');
const { createRouter, createHandler } = require('./lib/http');
const { openDb, seed } = require('./db');
const { sampleProducts } = require('./seed');
const { createCatalogService, parseQuery } = require('./catalogService');

function createApp({ dbFile = ':memory:', products = sampleProducts(), quiet = false } = {}) {
  const db = openDb(dbFile);
  seed(db, products);
  const catalog = createCatalogService({ db });
  const router = createRouter();

  router.get('/products', async (ctx) => ({ status: 200, body: catalog.search(parseQuery(ctx.query)) }));
  router.get('/categories', async () => ({ status: 200, body: catalog.categories() }));

  const handler = createHandler(router, { publicDir: path.join(__dirname, '..', 'public'), quiet });
  return { handler, db, catalog };
}

module.exports = { createApp };
