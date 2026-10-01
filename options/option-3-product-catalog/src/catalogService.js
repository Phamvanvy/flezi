'use strict';
const { badRequest } = require('./lib/http');

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const SEARCH_MAX = 100;

// Whitelisted ORDER BY clauses: user input never reaches SQL text, only selects a key.
// "id" is the final tie-breaker so pagination is stable across pages.
const SORTS = {
  newest: 'created_at DESC, id ASC',
  price_asc: 'price_cents ASC, id ASC',
  price_desc: 'price_cents DESC, id ASC',
  name_asc: 'name COLLATE NOCASE ASC, id ASC',
};
const DEFAULT_SORT = 'newest';

const toProduct = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  category: row.category,
  price: row.price_cents / 100,
  createdAt: row.created_at,
});

/** Escapes LIKE wildcards so "%" or "_" in a keyword match literally. */
const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function parsePrice(raw, field, fields) {
  if (raw === null || raw === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw.trim())) {
    fields[field] = /^-/.test(raw.trim()) ? `${field} must not be negative` : `${field} must be a number with up to 2 decimals`;
    return null;
  }
  return Math.round(Number(raw) * 100);
}

function parseIntParam(raw, field, fields) {
  if (raw === null || raw === '') return null;
  if (!/^-?\d+$/.test(raw.trim())) {
    fields[field] = `${field} must be an integer`;
    return null;
  }
  return Number(raw);
}

/** Turns URLSearchParams into a validated query object (throws 400 on malformed input). */
function parseQuery(params) {
  const fields = {};
  const search = (params.get('search') || '').trim();
  if (search.length > SEARCH_MAX) fields.search = `search must be at most ${SEARCH_MAX} characters`;

  const categories = [
    ...new Set(
      params
        .getAll('category')
        .flatMap((c) => c.split(','))
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (categories.length > 20) fields.category = 'At most 20 categories';

  const minPrice = parsePrice(params.get('minPrice'), 'minPrice', fields);
  const maxPrice = parsePrice(params.get('maxPrice'), 'maxPrice', fields);

  const sort = params.get('sort') || DEFAULT_SORT;
  if (!SORTS[sort]) fields.sort = `sort must be one of: ${Object.keys(SORTS).join(', ')}`;

  let page = parseIntParam(params.get('page'), 'page', fields);
  let pageSize = parseIntParam(params.get('pageSize'), 'pageSize', fields);

  if (Object.keys(fields).length) throw badRequest('Invalid query parameters', fields);

  // Well-formed but out-of-range paging is clamped rather than rejected.
  page = Math.max(1, page ?? 1);
  pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? DEFAULT_PAGE_SIZE));
  return { search, categories, minPrice, maxPrice, sort, page, pageSize };
}

function createCatalogService({ db }) {
  function search(query) {
    const { search: keyword, categories, minPrice, maxPrice, sort, page, pageSize } = query;
    const meta = (totalItems) => ({ page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) });

    // Contradictory range: answer with an empty page instead of an error (spec-allowed).
    if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
      return { items: [], ...meta(0) };
    }

    const where = [];
    const args = [];
    if (keyword) {
      where.push("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')");
      const pattern = `%${escapeLike(keyword)}%`;
      args.push(pattern, pattern);
    }
    if (categories.length) {
      where.push(`category IN (${categories.map(() => '?').join(', ')})`);
      args.push(...categories);
    }
    if (minPrice !== null) {
      where.push('price_cents >= ?');
      args.push(minPrice);
    }
    if (maxPrice !== null) {
      where.push('price_cents <= ?');
      args.push(maxPrice);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { total } = db.prepare(`SELECT COUNT(*) AS total FROM products ${whereSql}`).get(...args);
    const rows = db
      .prepare(`SELECT * FROM products ${whereSql} ORDER BY ${SORTS[sort]} LIMIT ? OFFSET ?`)
      .all(...args, pageSize, (page - 1) * pageSize);

    return { items: rows.map(toProduct), ...meta(total) };
  }

  function categories() {
    return db
      .prepare('SELECT category AS name, COUNT(*) AS count FROM products GROUP BY category ORDER BY category')
      .all()
      .map((r) => ({ name: r.name, count: r.count }));
  }

  return { search, categories };
}

module.exports = { createCatalogService, parseQuery, SORTS, MAX_PAGE_SIZE };
