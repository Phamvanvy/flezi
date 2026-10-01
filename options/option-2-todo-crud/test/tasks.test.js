'use strict';
const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { startServer } = require('./helpers');

async function signIn(api, username) {
  const res = await api.request('POST', '/session', { body: { username } });
  assert.equal(res.status, 200);
  return res.body.token;
}

describe('Option 2 - Task/To-Do CRUD', () => {
  let api;
  let alice;
  let bob;

  beforeEach(async () => {
    if (api) await api.close();
    api = await startServer(createApp({ quiet: true }).handler);
    alice = await signIn(api, 'alice');
    bob = await signIn(api, 'bob');
  });
  after(async () => api && api.close());

  const create = (token, body) => api.request('POST', '/tasks', { token, body });

  describe('Unit test scenarios (spec table)', () => {
    it('#1 empty / whitespace title -> create fails with 400', async () => {
      for (const title of ['', '   ', '\n\t', undefined]) {
        const res = await create(alice, { title });
        assert.equal(res.status, 400, `title=${JSON.stringify(title)}`);
        assert.ok(res.body.error.fields.title);
      }
      const list = await api.request('GET', '/tasks', { token: alice });
      assert.deepEqual(list.body, []);
    });

    it('#2 task owned by A, user B updates/deletes it -> access denied (404)', async () => {
      const { body: task } = await create(alice, { title: 'Alice only' });
      const put = await api.request('PUT', `/tasks/${task.id}`, { token: bob, body: { title: 'hacked' } });
      const del = await api.request('DELETE', `/tasks/${task.id}`, { token: bob });
      assert.equal(put.status, 404);
      assert.equal(del.status, 404);
      // B cannot see it, and A's task is untouched.
      assert.deepEqual((await api.request('GET', '/tasks', { token: bob })).body, []);
      const mine = await api.request('GET', '/tasks', { token: alice });
      assert.equal(mine.body[0].title, 'Alice only');
    });

    it('#3 open task, toggle -> becomes done (and back)', async () => {
      const { body: task } = await create(alice, { title: 'Toggle me' });
      assert.equal(task.status, 'open');
      const done = await api.request('PUT', `/tasks/${task.id}`, { token: alice, body: { status: 'done' } });
      assert.equal(done.status, 200);
      assert.equal(done.body.status, 'done');
      const reopened = await api.request('PUT', `/tasks/${task.id}`, { token: alice, body: { status: 'open' } });
      assert.equal(reopened.body.status, 'open');
    });

    it('#4 non-existent task id, delete -> 404', async () => {
      const res = await api.request('DELETE', '/tasks/00000000-0000-0000-0000-000000000000', { token: alice });
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it('#5 mixed statuses, list ?status=open -> only open tasks', async () => {
      const a = (await create(alice, { title: 'A' })).body;
      await create(alice, { title: 'B' });
      await create(alice, { title: 'C' });
      await api.request('PUT', `/tasks/${a.id}`, { token: alice, body: { status: 'done' } });
      const open = await api.request('GET', '/tasks?status=open', { token: alice });
      assert.equal(open.status, 200);
      assert.deepEqual(open.body.map((t) => t.title).sort(), ['B', 'C']);
      assert.ok(open.body.every((t) => t.status === 'open'));
      const done = await api.request('GET', '/tasks?status=done', { token: alice });
      assert.deepEqual(done.body.map((t) => t.title), ['A']);
    });
  });

  describe('Acceptance criteria & edge cases', () => {
    it('create returns 201 with the full resource and trimmed title', async () => {
      const res = await create(alice, { title: '  Write report  ', description: 'Q3 numbers' });
      assert.equal(res.status, 201);
      assert.equal(res.body.title, 'Write report');
      assert.equal(res.body.description, 'Q3 numbers');
      assert.equal(res.body.status, 'open');
      assert.ok(res.body.id && res.body.createdAt && res.body.updatedAt);
    });

    it('requires authentication on every endpoint (401)', async () => {
      assert.equal((await api.request('GET', '/tasks')).status, 401);
      assert.equal((await api.request('POST', '/tasks', { body: { title: 'x' } })).status, 401);
      assert.equal((await api.request('PUT', '/tasks/1', { body: { title: 'x' } })).status, 401);
      assert.equal((await api.request('DELETE', '/tasks/1')).status, 401);
      assert.equal((await api.request('GET', '/tasks', { token: 'forged.token.value' })).status, 401);
    });

    it('edits title and description, and bumps updatedAt', async () => {
      let tick = 0;
      const timed = await startServer(createApp({ quiet: true, now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString() }).handler);
      const token = (await timed.request('POST', '/session', { body: { username: 'carol' } })).body.token;
      const { body: task } = await timed.request('POST', '/tasks', { token, body: { title: 'Old' } });
      const res = await timed.request('PUT', `/tasks/${task.id}`, { token, body: { title: 'New', description: 'More detail' } });
      await timed.close();
      assert.equal(res.status, 200);
      assert.equal(res.body.title, 'New');
      assert.equal(res.body.description, 'More detail');
      assert.equal(res.body.createdAt, task.createdAt);
      assert.ok(res.body.updatedAt > task.updatedAt);
    });

    it('rejects a whitespace-only title on update and invalid status', async () => {
      const { body: task } = await create(alice, { title: 'Valid' });
      const blank = await api.request('PUT', `/tasks/${task.id}`, { token: alice, body: { title: '   ' } });
      const badStatus = await api.request('PUT', `/tasks/${task.id}`, { token: alice, body: { status: 'archived' } });
      const empty = await api.request('PUT', `/tasks/${task.id}`, { token: alice, body: {} });
      assert.equal(blank.status, 400);
      assert.equal(badStatus.status, 400);
      assert.equal(empty.status, 400);
    });

    it('rejects an unknown ?status filter with 400', async () => {
      const res = await api.request('GET', '/tasks?status=archived', { token: alice });
      assert.equal(res.status, 400);
    });

    it('toggling twice with the same target status is idempotent (double-click safe)', async () => {
      const { body: task } = await create(alice, { title: 'Double click' });
      const [r1, r2] = await Promise.all([
        api.request('PUT', `/tasks/${task.id}`, { token: alice, body: { status: 'done' } }),
        api.request('PUT', `/tasks/${task.id}`, { token: alice, body: { status: 'done' } }),
      ]);
      assert.equal(r1.body.status, 'done');
      assert.equal(r2.body.status, 'done');
      const list = await api.request('GET', '/tasks', { token: alice });
      assert.equal(list.body.length, 1);
    });

    it('deleting a task already deleted in another tab -> 404, delete is permanent', async () => {
      const { body: task } = await create(alice, { title: 'Delete me' });
      const first = await api.request('DELETE', `/tasks/${task.id}`, { token: alice });
      const second = await api.request('DELETE', `/tasks/${task.id}`, { token: alice });
      assert.equal(first.status, 204);
      assert.equal(second.status, 404);
      const update = await api.request('PUT', `/tasks/${task.id}`, { token: alice, body: { title: 'ghost' } });
      assert.equal(update.status, 404);
    });

    it('lists only the caller\'s tasks, newest first, and stays fast with dozens of tasks', async () => {
      for (let i = 0; i < 60; i++) await create(alice, { title: `Task ${i}` });
      await create(bob, { title: 'Bob task' });
      const started = Date.now();
      const res = await api.request('GET', '/tasks', { token: alice });
      assert.ok(Date.now() - started < 500);
      assert.equal(res.body.length, 60);
      assert.equal(res.body[0].title, 'Task 59');
      assert.ok(res.body.every((t) => !('ownerId' in t) || t.ownerId === 'alice'));
    });
  });
});
