'use strict';
const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { roundAverage } = require('../src/reviewService');
const { startServer } = require('./helpers');

const ITEM = 'aurora-headphones';

describe('Option 5 - Comment & Rating System', () => {
  let api;
  let tick;
  const tokens = {};

  beforeEach(async () => {
    if (api) await api.close();
    tick = 0;
    // Deterministic clock: every write is one minute later than the previous one.
    const now = () => new Date(Date.UTC(2026, 8, 1, 12, tick++)).toISOString();
    api = await startServer(createApp({ quiet: true, seedData: false, now }).handler);
    for (const u of ['alice', 'bob', 'carol']) {
      tokens[u] = (await api.request('POST', '/session', { body: { username: u } })).body.token;
    }
  });
  after(async () => api && api.close());

  const submit = (user, body, item = ITEM) => api.request('POST', `/items/${item}/reviews`, { token: tokens[user], body });
  const list = (item = ITEM, user) => api.request('GET', `/items/${item}/reviews`, { token: user && tokens[user] });

  describe('Unit test scenarios (spec table)', () => {
    it('#1 rating of 0 or 6 -> create rejected with 400', async () => {
      for (const rating of [0, 6]) {
        const res = await submit('alice', { rating });
        assert.equal(res.status, 400, `rating=${rating}`);
        assert.ok(res.body.error.fields.rating);
      }
      assert.equal((await list()).body.reviewCount, 0);
    });

    it('#2 user with an existing review submits again -> updated, not duplicated', async () => {
      const first = await submit('alice', { rating: 2, comment: 'Meh' });
      const second = await submit('alice', { rating: 5, comment: 'Changed my mind' });
      assert.equal(first.status, 201);
      assert.equal(second.status, 200);
      assert.equal(second.body.review.id, first.body.review.id);
      const res = await list();
      assert.equal(res.body.reviewCount, 1);
      assert.equal(res.body.reviews[0].rating, 5);
      assert.equal(res.body.reviews[0].comment, 'Changed my mind');
      assert.equal(res.body.reviews[0].edited, true);
    });

    it('#3 ratings [5, 3, 4] -> average 4.0, count 3', async () => {
      await submit('alice', { rating: 5 });
      await submit('bob', { rating: 3 });
      const last = await submit('carol', { rating: 4 });
      assert.equal(last.body.averageRating, 4);
      assert.equal(last.body.reviewCount, 3);
      const res = await list();
      assert.equal(res.body.averageRating, 4.0);
      assert.equal(res.body.reviewCount, 3);
    });

    it('#4 item with no reviews -> average 0, count 0', async () => {
      const res = await list('brew-kettle');
      assert.equal(res.status, 200);
      assert.equal(res.body.averageRating, 0);
      assert.equal(res.body.reviewCount, 0);
      assert.deepEqual(res.body.reviews, []);
    });

    it('#5 user B edits user A\'s review -> 403', async () => {
      const { body } = await submit('alice', { rating: 4, comment: 'Mine' });
      const res = await api.request('PUT', `/reviews/${body.review.id}`, { token: tokens.bob, body: { rating: 1 } });
      assert.equal(res.status, 403);
      assert.equal((await list()).body.reviews[0].rating, 4); // unchanged
    });

    it('#6 several reviews over time -> listed newest-first', async () => {
      await submit('alice', { rating: 5, comment: 'first' });
      await submit('bob', { rating: 4, comment: 'second' });
      await submit('carol', { rating: 3, comment: 'third' });
      const res = await list();
      assert.deepEqual(res.body.reviews.map((r) => r.comment), ['third', 'second', 'first']);
      const times = res.body.reviews.map((r) => r.createdAt);
      assert.deepEqual(times, [...times].sort().reverse());
    });
  });

  describe('Acceptance criteria & edge cases', () => {
    it('rejects non-integer, string and missing ratings', async () => {
      for (const rating of [4.5, '5', null, undefined, -1]) {
        const res = await submit('alice', { rating });
        assert.equal(res.status, 400, `rating=${JSON.stringify(rating)}`);
      }
    });

    it('comment is optional, trimmed and length-limited', async () => {
      const noComment = await submit('alice', { rating: 4 });
      assert.equal(noComment.status, 201);
      assert.equal(noComment.body.review.comment, '');
      const trimmed = await submit('bob', { rating: 4, comment: '   nice   ' });
      assert.equal(trimmed.body.review.comment, 'nice');
      const tooLong = await submit('carol', { rating: 4, comment: 'x'.repeat(1001) });
      assert.equal(tooLong.status, 400);
    });

    it('author can edit via PUT /reviews/:id and the average is recomputed', async () => {
      const a = await submit('alice', { rating: 5 });
      await submit('bob', { rating: 3 });
      const edited = await api.request('PUT', `/reviews/${a.body.review.id}`, { token: tokens.alice, body: { rating: 1 } });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.review.rating, 1);
      assert.equal(edited.body.averageRating, 2);
      assert.equal(edited.body.reviewCount, 2);
    });

    it('PUT validates input and returns 404 for unknown review', async () => {
      const a = await submit('alice', { rating: 5 });
      const bad = await api.request('PUT', `/reviews/${a.body.review.id}`, { token: tokens.alice, body: { rating: 6 } });
      assert.equal(bad.status, 400);
      const missing = await api.request('PUT', '/reviews/nope', { token: tokens.alice, body: { rating: 3 } });
      assert.equal(missing.status, 404);
    });

    it('requires authentication to write, but reading is public', async () => {
      assert.equal((await api.request('POST', `/items/${ITEM}/reviews`, { body: { rating: 5 } })).status, 401);
      assert.equal((await api.request('PUT', '/reviews/x', { body: { rating: 5 } })).status, 401);
      assert.equal((await api.request('GET', `/items/${ITEM}/reviews`)).status, 200);
    });

    it('returns the signed-in user\'s own review for pre-filling the form', async () => {
      await submit('alice', { rating: 3, comment: 'ok' });
      const asAlice = await list(ITEM, 'alice');
      const asBob = await list(ITEM, 'bob');
      assert.equal(asAlice.body.myReview.comment, 'ok');
      assert.equal(asBob.body.myReview, null);
    });

    it('averages round to 1 decimal and never divide by zero', async () => {
      assert.equal(roundAverage(null), 0);
      assert.equal(roundAverage(13 / 3), 4.3);
      assert.equal(roundAverage(3.25), 3.3);
      await submit('alice', { rating: 5 });
      await submit('bob', { rating: 4 });
      await submit('carol', { rating: 4 });
      assert.equal((await list()).body.averageRating, 4.3);
    });

    it('returns 404 for an unknown item', async () => {
      assert.equal((await list('no-such-item')).status, 404);
      assert.equal((await submit('alice', { rating: 5 }, 'no-such-item')).status, 404);
    });

    it('concurrent double submission still yields exactly one review', async () => {
      await Promise.all([submit('alice', { rating: 5 }), submit('alice', { rating: 5 })]);
      assert.equal((await list()).body.reviewCount, 1);
    });
  });
});
