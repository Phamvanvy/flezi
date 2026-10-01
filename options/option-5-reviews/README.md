# Option 5 — Comment & Rating System

Flow-2 hands-on · Program **Flezi-E1-Dev** · Account **vypv**

1–5 star reviews with an optional comment, one editable review per user per item, and a live average.
Zero npm dependencies — Node.js built-ins only. Sample items/reviews are made-up public data.

## How to run

Requires **Node.js ≥ 22.5**. No `npm install` needed.

```bash
npm start        # http://localhost:3005 — sign in with any username
npm test         # 15 tests: 6 spec scenarios + 9 acceptance/edge-case tests
```

## API

| Method | Path | Success | Errors |
|---|---|---|---|
| POST | `/items/:id/reviews` `{ rating, comment? }` | `201` created / `200` replaced own review | `400`, `401`, `404` item |
| GET | `/items/:id/reviews` | `200 { averageRating, reviewCount, reviews, myReview }` | `404` item |
| PUT | `/reviews/:id` `{ rating?, comment? }` | `200` | `400`, `401`, `403` not author, `404` |
| GET | `/items` | `200` items with their averages | — |

## Design decisions

- **One review per user per item** is a `UNIQUE (item_id, user_id)` constraint; re-submission is an `ON CONFLICT DO UPDATE` upsert, so even concurrent double submits produce one row.
- **Rating** must be an integer 1–5 (also a DB `CHECK`); `0`, `6`, `4.5`, `"5"` → `400`. Comment optional, trimmed, ≤ 1000 chars.
- **Average** is recomputed from rows with SQL `AVG` on every read (can't drift), rounded to 1 decimal; empty set → `0` (no divide-by-zero).
- **Authorisation:** only the author may `PUT` (`403` otherwise). Reads are public; if signed in, `myReview` pre-fills the form.
- **Ordering:** newest first by `createdAt` (edits keep their position, marked "edited").
- **UI:** accessible star radio group, character counter, submit disabled while in flight, "Be the first to review" empty state, relative times.

## Spec test scenarios → tests (`test/reviews.test.js`)

| # | Given / When / Then | Test |
|---|---|---|
| 1 | Rating 0 or 6 → 400 | `#1 rating of 0 or 6` |
| 2 | Existing review, submit again → updated not duplicated | `#2 user with an existing review` |
| 3 | Ratings [5,3,4] → average 4.0, count 3 | `#3 ratings [5, 3, 4]` |
| 4 | No reviews → average 0, count 0 | `#4 item with no reviews` |
| 5 | B edits A's review → 403 | `#5 user B edits user A's review` |
| 6 | Reviews over time → newest first | `#6 several reviews over time` |

Edge cases covered: non-integer/string/missing ratings, optional/trimmed/over-long comment, author edit recomputes average, auth for writes, `myReview`, rounding, unknown item, concurrent double submit.

## Story point estimation

| Factor | Assessment |
|---|---|
| Complexity | Low-medium: upsert + aggregate, author check. |
| Effort | Medium: 3 endpoints, rating UI with edit mode, 15 tests. |
| Uncertainty / Risk | Low: rules are explicit in the spec. |
| **Estimate** | **3 points** |
| Rationale | Smallest of the five: one table, clear rules, no money or security-critical crypto. |
