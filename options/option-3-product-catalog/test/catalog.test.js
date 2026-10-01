'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { startServer } = require('./helpers');

/** 42 deterministic products: price = index, so price_asc order == index order. */
function fortyTwo() {
  return Array.from({ length: 42 }, (_, i) => ({
    id: `x${String(i + 1).padStart(2, '0')}`,
    name: `Item ${i + 1}`,
    description: 'Generic item',
    category: i % 2 ? 'toys' : 'books',
    price: i + 1,
    createdAt: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
  }));
}

describe('Option 3 - Product Catalog with Search & Filter', () => {
  let api;
  let small;

  before(async () => {
    api = await startServer(createApp({ quiet: true }).handler); // 48 sample products
    small = await startServer(createApp({ quiet: true, products: fortyTwo() }).handler);
  });
  after(async () => {
    await api.close();
    await small.close();
  });

  const get = (srv, qs) => srv.request('GET', `/products${qs}`);

  describe('Unit test scenarios (spec table)', () => {
    it('#1 products across categories, filter by one category -> only that category', async () => {
      const res = await get(api, '?category=books&pageSize=50');
      assert.equal(res.status, 200);
      assert.equal(res.body.totalItems, 8);
      assert.ok(res.body.items.every((p) => p.category === 'books'));
    });

    it('#2 keyword + price range -> correct intersection', async () => {
      // "set" matches Building Blocks Set (34.99), Wooden Train Set (64), Ceramic Mug Set (26),
      // Storage Baskets (29, "Set of three"), Resistance Bands (17.5, "Set of five").
      // Only the last-but-one pair fall inside 20-30.
      const res = await get(api, '?search=set&minPrice=20&maxPrice=30&pageSize=50');
      assert.equal(res.status, 200);
      const names = res.body.items.map((p) => p.name).sort();
      for (const p of res.body.items) {
        assert.ok(p.price >= 20 && p.price <= 30, `${p.name} ${p.price}`);
        assert.ok(/set/i.test(p.name) || /set/i.test(p.description), p.name);
      }
      assert.deepEqual(names, ['Ceramic Mug Set', 'Storage Baskets']);
    });

    it('#3 42 products, pageSize 10, page 2 -> items 11-20 + metadata', async () => {
      const res = await get(small, '?pageSize=10&page=2&sort=price_asc');
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.items.map((p) => p.name),
        Array.from({ length: 10 }, (_, i) => `Item ${i + 11}`),
      );
      assert.equal(res.body.page, 2);
      assert.equal(res.body.pageSize, 10);
      assert.equal(res.body.totalItems, 42);
      assert.equal(res.body.totalPages, 5);
    });

    it('#4 minPrice > maxPrice -> empty set without error', async () => {
      const res = await get(api, '?minPrice=100&maxPrice=10');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.items, []);
      assert.equal(res.body.totalItems, 0);
    });

    it('#5 keyword matching nothing -> empty list + totalItems = 0', async () => {
      const res = await get(api, '?search=zzzz-no-such-product');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.items, []);
      assert.equal(res.body.totalItems, 0);
      assert.equal(res.body.totalPages, 0);
    });
  });

  describe('Acceptance criteria & edge cases', () => {
    it('multi-category via repeated params narrows by union of categories', async () => {
      const res = await get(api, '?category=books&category=toys&pageSize=50');
      assert.equal(res.body.totalItems, 16);
      assert.ok(res.body.items.every((p) => ['books', 'toys'].includes(p.category)));
    });

    it('combines every filter as an intersection', async () => {
      // "kit" is a substring match, so "Kite Rainbow" legitimately matches too.
      const res = await get(api, '?search=kit&category=toys&category=books&maxPrice=40');
      assert.deepEqual(res.body.items.map((p) => p.name).sort(), ['Kite Rainbow', 'Science Kit']);
      const narrower = await get(api, '?search=kit&category=toys&maxPrice=20');
      assert.deepEqual(narrower.body.items.map((p) => p.name), ['Kite Rainbow']);
    });

    it('sorts by price ascending / descending and newest by default', async () => {
      const asc = (await get(api, '?sort=price_asc&pageSize=50')).body.items.map((p) => p.price);
      const desc = (await get(api, '?sort=price_desc&pageSize=50')).body.items.map((p) => p.price);
      assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
      assert.deepEqual(desc, [...desc].sort((a, b) => b - a));
      const def = (await get(api, '?pageSize=50')).body.items.map((p) => p.createdAt);
      assert.deepEqual(def, [...def].sort().reverse());
    });

    it('rejects negative and non-numeric prices and unknown sort with 400', async () => {
      for (const qs of ['?minPrice=-5', '?maxPrice=abc', '?minPrice=1e3', '?sort=random', '?page=two', '?pageSize=1.5']) {
        const res = await get(api, qs);
        assert.equal(res.status, 400, qs);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      }
    });

    it('clamps paging: page < 1 -> 1, pageSize bounded to 50', async () => {
      const res = await get(api, '?page=0&pageSize=500');
      assert.equal(res.status, 200);
      assert.equal(res.body.page, 1);
      assert.equal(res.body.pageSize, 50);
    });

    it('page beyond totalPages -> empty items with correct metadata', async () => {
      const res = await get(small, '?page=9&pageSize=10');
      assert.equal(res.status, 200);
      assert.deepEqual(res.body.items, []);
      assert.equal(res.body.totalItems, 42);
      assert.equal(res.body.totalPages, 5);
      assert.equal(res.body.page, 9);
    });

    it('treats special characters literally (no injection, no wildcard abuse)', async () => {
      for (const kw of ["' OR 1=1 --", '%', '_', '"; DROP TABLE products; --', '\\']) {
        const res = await get(api, `?search=${encodeURIComponent(kw)}`);
        assert.equal(res.status, 200, kw);
        assert.equal(res.body.totalItems, 0, kw);
      }
      // Table still intact after the attempts.
      assert.equal((await get(api, '')).body.totalItems, 48);
    });

    it('keyword search is case-insensitive and matches description', async () => {
      const res = await get(api, '?search=BLUETOOTH');
      assert.deepEqual(res.body.items.map((p) => p.name), ['Wireless Earbuds Pro']);
    });

    it('returns prices as exact 2-decimal numbers', async () => {
      const res = await get(api, '?search=Earbuds');
      assert.equal(res.body.items[0].price, 89.99);
    });

    it('lists categories with counts', async () => {
      const res = await api.request('GET', '/categories');
      assert.equal(res.body.length, 6);
      assert.deepEqual(res.body[0], { name: 'books', count: 8 });
    });
  });
});
