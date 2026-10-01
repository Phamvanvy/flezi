'use strict';
const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');
const { toAmount, lineTotalCents, sumCents } = require('../src/money');
const { startServer } = require('./helpers');

describe('Option 4 - Shopping Cart & Checkout Summary', () => {
  let app;
  let api;
  let token;

  beforeEach(async () => {
    if (api) await api.close();
    app = createApp({ quiet: true });
    api = await startServer(app.handler);
    token = (await api.request('POST', '/session', { body: { username: 'shopper' } })).body.token;
  });
  after(async () => api && api.close());

  const add = (productId, quantity) => api.request('POST', '/cart/items', { token, body: quantity === undefined ? { productId } : { productId, quantity } });
  const put = (productId, quantity) => api.request('PUT', `/cart/items/${productId}`, { token, body: { quantity } });
  const cart = () => api.request('GET', '/cart', { token });

  describe('Unit test scenarios (spec table)', () => {
    it('#1 product already in cart, add same product -> quantity increments, no duplicate line', async () => {
      const first = await add('mug');
      const second = await add('mug', 2);
      assert.equal(first.status, 201);
      assert.equal(second.status, 200);
      assert.equal(second.body.items.length, 1);
      assert.equal(second.body.items[0].quantity, 3);
    });

    it('#2 unit price 9.99 x 3 -> line total 29.97, grand total sums lines', async () => {
      await add('mug', 3); // 9.99
      const res = await add('notebook', 2); // 6.50
      const mug = res.body.items.find((i) => i.productId === 'mug');
      assert.equal(mug.unitPrice, 9.99);
      assert.equal(mug.lineTotal, 29.97);
      assert.equal(res.body.subtotal, 42.97);
      assert.equal(res.body.grandTotal, 42.97);
    });

    it('#3 item in cart, set quantity to 0 -> item removed', async () => {
      await add('mug');
      await add('lamp');
      const res = await put('mug', 0);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.items.map((i) => i.productId), ['lamp']);
    });

    it('#4 empty cart, get cart -> grand total 0 and no items', async () => {
      const res = await cart();
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.items, []);
      assert.equal(res.body.grandTotal, 0);
      assert.equal(res.body.subtotal, 0);
    });

    it('#5 quantity -1 or 1.5 -> update rejected with 400', async () => {
      await add('mug');
      for (const q of [-1, 1.5, '2', null]) {
        const res = await put('mug', q);
        assert.equal(res.status, 400, `quantity=${JSON.stringify(q)}`);
        assert.ok(res.body.error.fields.quantity);
      }
      assert.equal((await cart()).body.items[0].quantity, 1); // unchanged
    });
  });

  describe('Acceptance criteria & edge cases', () => {
    it('avoids floating-point drift (0.10 x 3 = 0.30, not 0.30000000000000004)', async () => {
      const res = await add('cable', 3);
      assert.equal(res.body.items[0].lineTotal, 0.3);
      assert.equal(res.body.grandTotal, 0.3);
      assert.equal(toAmount(sumCents([lineTotalCents(10, 1), lineTotalCents(20, 1)])), 0.3);
    });

    it('rejects invalid quantities and unknown products on add', async () => {
      for (const q of [0, -2, 2.5, 100]) {
        assert.equal((await add('mug', q)).status, 400, `q=${q}`);
      }
      const unknown = await add('does-not-exist');
      assert.equal(unknown.status, 400);
      assert.equal(unknown.body.error.fields.productId, 'Unknown product');
      assert.equal((await api.request('POST', '/cart/items', { token, body: {} })).status, 400);
    });

    it('adding the same product rapidly (concurrently) never duplicates lines', async () => {
      await Promise.all(Array.from({ length: 10 }, () => add('pen-set')));
      const res = await cart();
      assert.equal(res.body.items.length, 1);
      assert.equal(res.body.items[0].quantity, 10);
    });

    it('rapid absolute quantity updates settle on the last value (no drift)', async () => {
      await add('bottle');
      for (const q of [2, 3, 4, 5]) await put('bottle', q);
      const res = await cart();
      assert.equal(res.body.items[0].quantity, 5);
      assert.equal(res.body.grandTotal, 95);
    });

    it('removing the last item empties the cart with total 0', async () => {
      await add('mug');
      const del = await api.request('DELETE', '/cart/items/mug', { token });
      assert.equal(del.status, 204);
      const res = await cart();
      assert.deepEqual(res.body.items, []);
      assert.equal(res.body.grandTotal, 0);
      assert.equal((await api.request('DELETE', '/cart/items/mug', { token })).status, 404);
      assert.equal((await put('mug', 2)).status, 404);
    });

    it('snapshots the unit price at add time (later price changes do not affect the cart)', async () => {
      await add('mug', 1);
      app.db.prepare("UPDATE products SET price_cents = 1299 WHERE id = 'mug'").run();
      const merged = await add('mug', 1);
      assert.equal(merged.body.items[0].unitPrice, 9.99);
      assert.equal(merged.body.items[0].lineTotal, 19.98);
    });

    it('keeps carts separate per user and requires auth', async () => {
      await add('mug');
      const other = (await api.request('POST', '/session', { body: { username: 'someone' } })).body.token;
      const theirs = await api.request('GET', '/cart', { token: other });
      assert.deepEqual(theirs.body.items, []);
      assert.equal((await api.request('GET', '/cart')).status, 401);
      assert.equal((await api.request('POST', '/cart/items', { body: { productId: 'mug' } })).status, 401);
    });

    it('persists the cart across restarts (file-backed DB)', async () => {
      const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cart-')), 'cart.db');
      const first = createApp({ quiet: true, dbFile: file });
      const t = first.tokens.issue({ sub: 'persist', name: 'persist' }).token;
      first.cart.addItem('persist', { productId: 'lamp', quantity: 2 });
      first.db.close();
      const second = createApp({ quiet: true, dbFile: file });
      assert.equal(second.cart.getCart('persist').items[0].quantity, 2);
      second.db.close();
      assert.ok(t);
    });

    it('checkout is rejected for an empty cart and clears the cart on success', async () => {
      assert.equal((await api.request('POST', '/cart/checkout', { token })).status, 400);
      await add('earbuds', 1);
      const order = await api.request('POST', '/cart/checkout', { token });
      assert.equal(order.status, 201);
      assert.equal(order.body.grandTotal, 89.99);
      assert.deepEqual((await cart()).body.items, []);
    });
  });
});
