# Option 3 — Product Catalog with Search & Filter

Flow-2 hands-on · Program **Flezi-E1-Dev** · Account **vypv**

Combinable keyword, category and price filters with sorting and pagination over a 48-product sample catalog (made-up public data).
Zero npm dependencies — Node.js built-ins only.

## How to run

Requires **Node.js ≥ 22.5**. No `npm install` needed.

```bash
npm start        # http://localhost:3003
npm test         # 15 tests: 5 spec scenarios + 10 acceptance/edge-case tests
```

## API

`GET /products?search=&category=&minPrice=&maxPrice=&sort=&page=&pageSize=`

```json
{ "items": [{ "id": "p009", "name": "...", "price": 89.99, "category": "electronics" }],
  "page": 1, "pageSize": 10, "totalItems": 42, "totalPages": 5 }
```

- `category` may repeat (`category=books&category=toys`) or be comma-separated.
- `sort`: `newest` (default) · `price_asc` · `price_desc` · `name_asc`.
- `400` for malformed parameters (non-numeric/negative price, unknown sort, non-integer page).

`GET /categories` → `[{ name, count }]`.

## Design decisions

- **Dynamic but safe SQL:** the `WHERE` clause is assembled only from present filters, always with `?` placeholders. `ORDER BY` comes from a whitelist map, never from user text. `%`, `_` and `\` in keywords are escaped so they match literally.
- **Money:** stored as integer cents; price filters accept up to 2 decimals.
- **Paging:** malformed values → `400`; well-formed but out-of-range values are clamped (`page ≥ 1`, `1 ≤ pageSize ≤ 50`). `id` is the final sort tie-breaker so pages never overlap.
- **`minPrice > maxPrice`:** returns `200` with an empty set (spec allows either); the UI explains why.
- **Indexes** on `category`, `price_cents`, `created_at`; `COUNT(*)` + `LIMIT/OFFSET` for paging.
- **UI:** filter state is mirrored in the URL (reload/share keeps filters, paging keeps filters); 300 ms debounce on typing; `AbortController` cancels stale requests; skeleton loading; removable chips + "Clear all"; empty state.

## Spec test scenarios → tests (`test/catalog.test.js`)

| # | Given / When / Then | Test |
|---|---|---|
| 1 | Filter by one category → only that category | `#1 products across categories` |
| 2 | Keyword + price range → intersection | `#2 keyword + price range` |
| 3 | 42 products, pageSize 10, page 2 → items 11–20 + metadata | `#3 42 products` |
| 4 | minPrice > maxPrice → empty set, no error | `#4 minPrice > maxPrice` |
| 5 | Keyword matching nothing → empty list, totalItems 0 | `#5 keyword matching nothing` |

Edge cases covered: multi-category, all filters combined, every sort, negative/non-numeric/scientific prices, page clamping, page beyond last, SQL-injection and wildcard strings, case-insensitive search.

## Story point estimation

| Factor | Assessment |
|---|---|
| Complexity | Medium: dynamic query composition, safe parameterisation, pagination metadata. |
| Effort | Medium-high: filter UI state (URL sync, chips, debounce, stale-request cancel). |
| Uncertainty / Risk | Low-medium: search semantics (substring vs. word) need agreeing. |
| **Estimate** | **5 points** |
| Rationale | Read-only, no auth, but the stateful filter UI is the bulk of the work. |
