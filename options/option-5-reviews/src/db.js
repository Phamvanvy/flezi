'use strict';
const { DatabaseSync } = require('node:sqlite');

function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS items (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id         TEXT PRIMARY KEY,
      item_id    TEXT NOT NULL REFERENCES items(id),
      user_id    TEXT NOT NULL,
      rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment    TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (item_id, user_id)               -- one review per user per item
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_item_created ON reviews (item_id, created_at DESC);
  `);
  return db;
}

const SAMPLE_ITEMS = [
  { id: 'aurora-headphones', name: 'Aurora Headphones', description: 'Over-ear wireless headphones with 40h battery.' },
  { id: 'trail-backpack', name: 'Trail Backpack 28L', description: 'Lightweight hiking backpack with rain cover.' },
  { id: 'brew-kettle', name: 'Pour-over Kettle', description: 'Gooseneck kettle with temperature display.' },
];

// Made-up sample reviews (public demo data only).
const SAMPLE_REVIEWS = [
  { item: 'aurora-headphones', user: 'maria', rating: 5, comment: 'Great sound and the battery really lasts.', daysAgo: 6 },
  { item: 'aurora-headphones', user: 'tuan', rating: 4, comment: 'Comfortable for long calls. Case is a bit bulky.', daysAgo: 3 },
  { item: 'aurora-headphones', user: 'lee', rating: 3, comment: 'Good, but noise cancelling is only average.', daysAgo: 1 },
  { item: 'trail-backpack', user: 'maria', rating: 4, comment: 'Fits a day of gear easily.', daysAgo: 9 },
];

function seed(db, { items = SAMPLE_ITEMS, reviews = SAMPLE_REVIEWS, now = Date.now() } = {}) {
  const insertItem = db.prepare(`
    INSERT INTO items (id, name, description) VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description`);
  const insertReview = db.prepare(`
    INSERT INTO reviews (id, item_id, user_id, rating, comment, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(item_id, user_id) DO NOTHING`);
  for (const i of items) insertItem.run(i.id, i.name, i.description);
  for (const r of reviews) {
    const ts = new Date(now - r.daysAgo * 86_400_000).toISOString();
    insertReview.run(`seed-${r.item}-${r.user}`, r.item, r.user, r.rating, r.comment, ts, ts);
  }
}

module.exports = { openDb, seed, SAMPLE_ITEMS };
