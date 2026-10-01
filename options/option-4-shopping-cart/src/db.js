'use strict';
const { DatabaseSync } = require('node:sqlite');

const MAX_QUANTITY = 99;

function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS products (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0)
    );
    CREATE TABLE IF NOT EXISTS carts (
      id         TEXT PRIMARY KEY,
      owner_id   TEXT NOT NULL UNIQUE,          -- one active cart per user
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cart_items (
      cart_id          TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      product_id       TEXT NOT NULL REFERENCES products(id),
      quantity         INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND ${MAX_QUANTITY}),
      unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),  -- snapshot at add time
      added_at         TEXT NOT NULL,
      PRIMARY KEY (cart_id, product_id)          -- merge-on-add is enforced by the schema
    );
  `);
  return db;
}

const SAMPLE_PRODUCTS = [
  { id: 'mug', name: 'Ceramic Mug', price: 9.99 },
  { id: 'notebook', name: 'Dotted Notebook A5', price: 6.5 },
  { id: 'pen-set', name: 'Gel Pen Set (5)', price: 4.25 },
  { id: 'lamp', name: 'Smart Desk Lamp', price: 45.5 },
  { id: 'earbuds', name: 'Wireless Earbuds', price: 89.99 },
  { id: 'bottle', name: 'Insulated Bottle', price: 19.0 },
  { id: 'socks', name: 'Merino Socks (3 pack)', price: 22.0 },
  { id: 'puzzle', name: 'Puzzle 1000 Pieces', price: 18.5 },
  { id: 'plant-pot', name: 'Self-watering Plant Pot', price: 13.25 },
  { id: 'cable', name: 'USB-C Cable 2m', price: 0.1 },
];

function seedProducts(db, products = SAMPLE_PRODUCTS) {
  // Upsert, not INSERT OR REPLACE: REPLACE deletes the row first, which would violate the
  // cart_items foreign key on restart once carts exist.
  const insert = db.prepare(`
    INSERT INTO products (id, name, price_cents) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, price_cents = excluded.price_cents`);
  for (const p of products) insert.run(p.id, p.name, Math.round(p.price * 100));
}

module.exports = { openDb, seedProducts, SAMPLE_PRODUCTS, MAX_QUANTITY };
