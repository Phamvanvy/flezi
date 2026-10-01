'use strict';
const path = require('node:path');
const { createRouter, createHandler } = require('./lib/http');
const { createTokenService } = require('./lib/token');
const { mountDemoAuth, requireUser } = require('./lib/demoAuth');
const { openDb } = require('./db');
const { createTaskService } = require('./taskService');

function createApp({ dbFile = ':memory:', quiet = false, now } = {}) {
  const db = openDb(dbFile);
  const tokens = createTokenService();
  const tasks = createTaskService({ db, now });
  const router = createRouter();
  mountDemoAuth(router, tokens);

  router.post('/tasks', async (ctx) => {
    const user = requireUser(ctx, tokens);
    return { status: 201, body: tasks.create(user.id, await ctx.body()) };
  });

  router.get('/tasks', async (ctx) => {
    const user = requireUser(ctx, tokens);
    return { status: 200, body: tasks.list(user.id, ctx.query.get('status')) };
  });

  router.put('/tasks/:id', async (ctx) => {
    const user = requireUser(ctx, tokens);
    return { status: 200, body: tasks.update(user.id, ctx.params.id, await ctx.body()) };
  });

  router.delete('/tasks/:id', async (ctx) => {
    const user = requireUser(ctx, tokens);
    tasks.delete(user.id, ctx.params.id);
    return { status: 204 };
  });

  const handler = createHandler(router, { publicDir: path.join(__dirname, '..', 'public'), quiet });
  return { handler, db, tokens, tasks };
}

module.exports = { createApp };
