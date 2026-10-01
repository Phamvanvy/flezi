'use strict';
const { DatabaseSync } = require('node:sqlite');

function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,  -- UNIQUE also creates the lookup index
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );
  `);
  return db;
}

module.exports = { openDb };
