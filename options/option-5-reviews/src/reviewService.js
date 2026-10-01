'use strict';
const crypto = require('node:crypto');
const { badRequest, forbidden, notFound } = require('./lib/http');

const COMMENT_MAX = 1000;

const toReview = (row) => ({
  id: row.id,
  itemId: row.item_id,
  userId: row.user_id,
  author: row.user_id,
  rating: row.rating,
  comment: row.comment,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  edited: row.updated_at !== row.created_at,
});

function ratingError(rating) {
  if (rating === undefined || rating === null) return 'Rating is required';
  if (typeof rating !== 'number' || !Number.isInteger(rating)) return 'Rating must be a whole number from 1 to 5';
  if (rating < 1 || rating > 5) return 'Rating must be between 1 and 5';
  return null;
}

function commentError(comment) {
  if (comment === undefined || comment === null) return null;
  if (typeof comment !== 'string') return 'Comment must be text';
  if (comment.trim().length > COMMENT_MAX) return `Comment must be at most ${COMMENT_MAX} characters`;
  return null;
}

function throwIfAny(errors) {
  const fields = Object.fromEntries(Object.entries(errors).filter(([, v]) => v));
  if (Object.keys(fields).length) throw badRequest('Invalid input', fields);
}

/** Mean rounded to 1 decimal; an empty set is 0 (no divide-by-zero). */
function roundAverage(avg) {
  return avg === null || avg === undefined ? 0 : Math.round(avg * 10) / 10;
}

function createReviewService({ db, now = () => new Date().toISOString() }) {
  const findItem = db.prepare('SELECT * FROM items WHERE id = ?');
  const listItems = db.prepare('SELECT * FROM items ORDER BY name');
  const findReview = db.prepare('SELECT * FROM reviews WHERE id = ?');
  const findByUser = db.prepare('SELECT * FROM reviews WHERE item_id = ? AND user_id = ?');
  // Newest first; id breaks ties so ordering is deterministic.
  const listReviews = db.prepare('SELECT * FROM reviews WHERE item_id = ? ORDER BY created_at DESC, id DESC');
  // Aggregate is recomputed from the rows on every read, so it can never drift from the data.
  const aggregate = db.prepare('SELECT AVG(rating) AS avg, COUNT(*) AS count FROM reviews WHERE item_id = ?');
  const upsert = db.prepare(`
    INSERT INTO reviews (id, item_id, user_id, rating, comment, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id, user_id) DO UPDATE SET
      rating = excluded.rating, comment = excluded.comment, updated_at = excluded.updated_at`);
  const update = db.prepare('UPDATE reviews SET rating = ?, comment = ?, updated_at = ? WHERE id = ?');

  function requireItem(itemId) {
    const item = findItem.get(itemId);
    if (!item) throw notFound('Item not found');
    return item;
  }

  function summary(itemId) {
    const { avg, count } = aggregate.get(itemId);
    return { averageRating: roundAverage(avg), reviewCount: count };
  }

  function list(itemId, viewerId = null) {
    requireItem(itemId);
    const reviews = listReviews.all(itemId).map(toReview);
    const mine = viewerId ? findByUser.get(itemId, viewerId) : null;
    return { ...summary(itemId), reviews, myReview: mine ? toReview(mine) : null };
  }

  /** Create, or replace the caller's existing review (one per user per item). */
  function submit(userId, itemId, body) {
    requireItem(itemId);
    throwIfAny({ rating: ratingError(body.rating), comment: commentError(body.comment) });
    const existing = findByUser.get(itemId, userId);
    const ts = now();
    upsert.run(crypto.randomUUID(), itemId, userId, body.rating, (body.comment || '').trim(), ts, ts);
    const review = toReview(findByUser.get(itemId, userId));
    return { created: !existing, review, ...summary(itemId) };
  }

  /** Edit by review id: only the author may edit (403 otherwise). */
  function edit(userId, reviewId, body) {
    const row = findReview.get(reviewId);
    if (!row) throw notFound('Review not found');
    if (row.user_id !== userId) throw forbidden('You can only edit your own review');
    const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
    if (!has('rating') && !has('comment')) throw badRequest('Provide rating and/or comment');
    throwIfAny({
      rating: has('rating') ? ratingError(body.rating) : null,
      comment: has('comment') ? commentError(body.comment) : null,
    });
    const rating = has('rating') ? body.rating : row.rating;
    const comment = has('comment') ? (body.comment || '').trim() : row.comment;
    update.run(rating, comment, now(), reviewId);
    return { review: toReview(findReview.get(reviewId)), ...summary(row.item_id) };
  }

  function items() {
    return listItems.all().map((i) => ({ id: i.id, name: i.name, description: i.description, ...summary(i.id) }));
  }

  return { list, submit, edit, items };
}

module.exports = { createReviewService, roundAverage };
