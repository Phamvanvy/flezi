'use strict';
const path = require('node:path');
const { createRouter, createHandler } = require('./lib/http');
const { createTokenService } = require('./lib/token');
const { mountDemoAuth, requireUser } = require('./lib/demoAuth');
const { openDb, seedProducts } = require('./db');
const { createCartService } = require('./cartService');

function createApp({ dbFile = ':memory:', quiet = false, products } = {}) {
  const db = openDb(dbFile);
  seedProducts(db, products);
  const tokens = createTokenService();
  const cart = createCartService({ db });
  const router = createRouter();
  mountDemoAuth(router, tokens);

  router.get('/products', async () => ({ status: 200, body: cart.products() }));

  router.get('/cart', async (ctx) => {
    const user = requireUser(ctx, tokens);
    return { status: 200, body: cart.getCart(user.id) };
  });

  router.post('/cart/items', async (ctx) => {
    const user = requireUser(ctx, tokens);
    const { created, cart: body } = cart.addItem(user.id, await ctx.body());
    return { status: created ? 201 : 200, body };
  });

  // :id is the productId, which is unique per cart (one line per product).
  router.put('/cart/items/:id', async (ctx) => {
    const user = requireUser(ctx, tokens);
    return { status: 200, body: cart.updateQuantity(user.id, ctx.params.id, await ctx.body()) };
  });

  router.delete('/cart/items/:id', async (ctx) => {
    const user = requireUser(ctx, tokens);
    cart.removeItem(user.id, ctx.params.id);
    return { status: 204 };
  });

  router.post('/cart/checkout', async (ctx) => {
    const user = requireUser(ctx, tokens);
    return { status: 201, body: cart.checkout(user.id) };
  });

  const handler = createHandler(router, { publicDir: path.join(__dirname, '..', 'public'), quiet });
  return { handler, db, tokens, cart };
}

module.exports = { createApp };
