'use strict';
const { DatabaseSync } = require('node:sqlite');

function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id          TEXT PRIMARY KEY,
      owner_id    TEXT NOT NULL,
      title       TEXT NOT NULL CHECK (length(trim(title)) > 0),
      description TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_owner_status ON tasks (owner_id, status);
  `);
  return db;
}

module.exports = { openDb };
