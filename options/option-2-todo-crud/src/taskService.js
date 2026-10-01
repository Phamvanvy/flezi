'use strict';
const crypto = require('node:crypto');
const { badRequest, notFound } = require('./lib/http');

const STATUSES = ['open', 'done'];
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;

const toTask = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

function titleError(title) {
  if (title === undefined || title === null) return 'Title is required';
  if (typeof title !== 'string') return 'Title must be a string';
  if (!title.trim()) return 'Title must not be empty';
  if (title.trim().length > TITLE_MAX) return `Title must be at most ${TITLE_MAX} characters`;
  return null;
}

function descriptionError(description) {
  if (description === undefined || description === null) return null;
  if (typeof description !== 'string') return 'Description must be a string';
  if (description.length > DESCRIPTION_MAX) return `Description must be at most ${DESCRIPTION_MAX} characters`;
  return null;
}

function statusError(status) {
  return STATUSES.includes(status) ? null : `Status must be one of: ${STATUSES.join(', ')}`;
}

function throwIfAny(errors) {
  const fields = Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
  if (Object.keys(fields).length) throw badRequest('Invalid input', fields);
}

function createTaskService({ db, now = () => new Date().toISOString() }) {
  const insert = db.prepare(
    'INSERT INTO tasks (id, owner_id, title, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const listAll = db.prepare('SELECT * FROM tasks WHERE owner_id = ? ORDER BY created_at DESC, rowid DESC');
  const listByStatus = db.prepare('SELECT * FROM tasks WHERE owner_id = ? AND status = ? ORDER BY created_at DESC, rowid DESC');
  // Every lookup is scoped by owner: another user's task is indistinguishable from a missing one.
  const findOwned = db.prepare('SELECT * FROM tasks WHERE id = ? AND owner_id = ?');
  const update = db.prepare('UPDATE tasks SET title = ?, description = ?, status = ?, updated_at = ? WHERE id = ? AND owner_id = ?');
  const remove = db.prepare('DELETE FROM tasks WHERE id = ? AND owner_id = ?');

  function create(ownerId, body) {
    throwIfAny({ title: titleError(body.title), description: descriptionError(body.description) });
    const ts = now();
    const row = {
      id: crypto.randomUUID(),
      owner_id: ownerId,
      title: body.title.trim(),
      description: (body.description || '').trim(),
      status: 'open',
      created_at: ts,
      updated_at: ts,
    };
    insert.run(row.id, row.owner_id, row.title, row.description, row.status, row.created_at, row.updated_at);
    return toTask(row);
  }

  function list(ownerId, status) {
    if (status === undefined || status === null || status === '' || status === 'all') {
      return listAll.all(ownerId).map(toTask);
    }
    throwIfAny({ status: statusError(status) });
    return listByStatus.all(ownerId, status).map(toTask);
  }

  function getOwned(ownerId, id) {
    const row = findOwned.get(id, ownerId);
    if (!row) throw notFound('Task not found');
    return row;
  }

  /** Partial update: any of title / description / status. Status is set explicitly (idempotent). */
  function updateTask(ownerId, id, body) {
    const row = getOwned(ownerId, id);
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
    if (!has('title') && !has('description') && !has('status')) {
      throw badRequest('Provide at least one of: title, description, status');
    }
    throwIfAny({
      title: has('title') ? titleError(body.title) : null,
      description: has('description') ? descriptionError(body.description) : null,
      status: has('status') ? statusError(body.status) : null,
    });
    const next = {
      title: has('title') ? body.title.trim() : row.title,
      description: has('description') ? (body.description || '').trim() : row.description,
      status: has('status') ? body.status : row.status,
      updated_at: now(),
    };
    update.run(next.title, next.description, next.status, next.updated_at, id, ownerId);
    return toTask({ ...row, ...next });
  }

  function deleteTask(ownerId, id) {
    const { changes } = remove.run(id, ownerId);
    if (changes === 0) throw notFound('Task not found');
  }

  return { create, list, update: updateTask, delete: deleteTask };
}

module.exports = { createTaskService };
