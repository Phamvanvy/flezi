# Flezi-E1 Level 2 — Flow-2 Hands-on Practice (vypv)

All five Flow-2 marketplace options, implemented and evidenced.

| Option | App | Report deck |
|---|---|---|
| 1 — User Registration & Login | [options/option-1-user-auth](options/option-1-user-auth) | [deck](deliverables/Flow2_vypv_Flezi-E1-Dev_Option_1.pptx) |
| 2 — Task/To-Do CRUD | [options/option-2-todo-crud](options/option-2-todo-crud) | [deck](deliverables/Flow2_vypv_Flezi-E1-Dev_Option_2.pptx) |
| 3 — Product Catalog Search & Filter | [options/option-3-product-catalog](options/option-3-product-catalog) | [deck](deliverables/Flow2_vypv_Flezi-E1-Dev_Option_3.pptx) |
| 4 — Shopping Cart & Checkout | [options/option-4-shopping-cart](options/option-4-shopping-cart) | [deck](deliverables/Flow2_vypv_Flezi-E1-Dev_Option_4.pptx) |
| 5 — Comment & Rating System | [options/option-5-reviews](options/option-5-reviews) | [deck](deliverables/Flow2_vypv_Flezi-E1-Dev_Option_5.pptx) |

Each app needs only **Node.js ≥ 22.5** (built-in `node:sqlite`) — no `npm install`:

```bash
cd options/option-1-user-auth
npm start   # open the printed URL
npm test
```

- `options/_shared/` — shared HTTP, token and UI helpers; `node options/_shared/sync.js` copies them into each option.
- `evidence/` — screenshots and captured test output used in the decks.
- `report-tools/` — scripts that capture the evidence and generate the decks (`npm install`, then `npm run evidence`, `npm run decks`).
