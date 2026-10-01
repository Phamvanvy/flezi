# Option 4 — Shopping Cart & Checkout Summary

Flow-2 hands-on · Program **Flezi-E1-Dev** · Account **vypv**

A per-user cart that merges duplicate lines, computes totals server-side in exact money arithmetic, and persists across reloads.
Zero npm dependencies — Node.js built-ins only.

## How to run

Requires **Node.js ≥ 22.5**. No `npm install` needed.

```bash
npm start        # http://localhost:3004 — sign in with any username
npm test         # 14 tests: 5 spec scenarios + 9 acceptance/edge-case tests
```

## API

| Method | Path | Success | Errors |
|---|---|---|---|
| GET | `/cart` | `200` cart with totals | `401` |
| POST | `/cart/items` `{ productId, quantity? = 1 }` | `201` new line / `200` merged | `400`, `401` |
| PUT | `/cart/items/:productId` `{ quantity }` (0 = remove) | `200` cart | `400`, `401`, `404` |
| DELETE | `/cart/items/:productId` | `204` | `401`, `404` |
| POST | `/cart/checkout` | `201` order summary, cart cleared | `400` empty cart |

```json
{ "items": [{ "productId": "mug", "name": "Ceramic Mug", "unitPrice": 9.99, "quantity": 3, "lineTotal": 29.97 }],
  "itemCount": 3, "subtotal": 29.97, "grandTotal": 29.97, "currency": "USD" }
```

## Design decisions

- **Money in integer cents** end to end; converted to a 2-decimal number only in the response (`0.10 × 3 = 0.30`, never `0.30000000000000004`).
- **Merge enforced by the schema:** `PRIMARY KEY (cart_id, product_id)` + `INSERT … ON CONFLICT DO UPDATE SET quantity = quantity + excluded.quantity`, so rapid duplicate adds can never create two lines.
- **Quantity rules:** integers 1–99; `PUT` with `0` removes the line; negatives, fractions and strings → `400`. `PUT` sets an *absolute* quantity, so retries are idempotent.
- **Price snapshot:** `unitPrice` is captured when a product is first added and kept on merge; later catalog price changes don't silently change an open cart.
- **Persistence:** file-backed SQLite (`data/cart.db`), one cart per user (`UNIQUE owner_id`).
- **UI:** stepper shows totals instantly (client preview in cents), then the server response replaces it (source of truth). Per-line request coalescing sends only the latest quantity after the in-flight request, so rapid clicks can't race. Empty state with "Browse products" CTA; checkout disabled when empty.

## Spec test scenarios → tests (`test/cart.test.js`)

| # | Given / When / Then | Test |
|---|---|---|
| 1 | Product in cart, add again → quantity increments, no duplicate | `#1 product already in cart` |
| 2 | 9.99 × 3 → line 29.97, grand total sums lines | `#2 unit price 9.99 x 3` |
| 3 | Set quantity 0 → item removed | `#3 item in cart, set quantity to 0` |
| 4 | Empty cart → total 0, no items | `#4 empty cart` |
| 5 | Quantity -1 / 1.5 → 400 | `#5 quantity -1 or 1.5` |

Edge cases covered: float drift, invalid add quantities/unknown product, 10 concurrent adds, rapid updates, removing last item, price change after add, per-user isolation + auth, persistence across restart, checkout.

## Story point estimation

| Factor | Assessment |
|---|---|
| Complexity | Medium: money precision, merge semantics, concurrency. |
| Effort | Medium: 5 endpoints, cart + summary UI with steppers, 14 tests. |
| Uncertainty / Risk | Medium: snapshot vs. live pricing had to be decided (chose snapshot). |
| **Estimate** | **5 points** |
| Rationale | Similar size to Option 2, plus correctness risk around money and race conditions. |
