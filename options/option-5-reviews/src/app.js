'use strict';
const path = require('node:path');
const { createRouter, createHandler } = require('./lib/http');
const { createTokenService, readToken } = require('./lib/token');
const { mountDemoAuth, requireUser } = require('./lib/demoAuth');
const { openDb, seed } = require('./db');
const { createReviewService } = require('./reviewService');

function createApp({ dbFile = ':memory:', quiet = false, seedData = true, now } = {}) {
  const db = openDb(dbFile);
  if (seedData) seed(db);
  else seed(db, { reviews: [] });
  const tokens = createTokenService();
  const reviews = createReviewService({ db, now });
  const router = createRouter();
  mountDemoAuth(router, tokens);

  router.get('/items', async () => ({ status: 200, body: reviews.items() }));

  // Public read; if the caller is signed in we also return their own review for pre-filling.
  router.get('/items/:id/reviews', async (ctx) => {
    const claims = tokens.verify(readToken(ctx));
    return { status: 200, body: reviews.list(ctx.params.id, claims ? claims.sub : null) };
  });

  router.post('/items/:id/reviews', async (ctx) => {
    const user = requireUser(ctx, tokens);
    const { created, ...body } = reviews.submit(user.id, ctx.params.id, await ctx.body());
    return { status: created ? 201 : 200, body };
  });

  router.put('/reviews/:id', async (ctx) => {
    const user = requireUser(ctx, tokens);
    return { status: 200, body: reviews.edit(user.id, ctx.params.id, await ctx.body()) };
  });

  const handler = createHandler(router, { publicDir: path.join(__dirname, '..', 'public'), quiet });
  return { handler, db, tokens, reviews };
}

module.exports = { createApp };
