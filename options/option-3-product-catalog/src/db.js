'use strict';
const { DatabaseSync } = require('node:sqlite');

function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category    TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK (price_cents >= 0),  -- integer cents: no float drift
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
    CREATE INDEX IF NOT EXISTS idx_products_price ON products (price_cents);
    CREATE INDEX IF NOT EXISTS idx_products_created ON products (created_at);
  `);
  return db;
}

function seed(db, products) {
  const insert = db.prepare(
    'INSERT OR REPLACE INTO products (id, name, description, category, price_cents, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  db.exec('BEGIN');
  try {
    for (const p of products) {
      insert.run(p.id, p.name, p.description || '', p.category, Math.round(p.price * 100), p.createdAt);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, seed };
