# Option 2 — Task / To-Do CRUD Management

Flow-2 hands-on · Program **Flezi-E1-Dev** · Account **vypv**

A per-user to-do manager with full CRUD and strict ownership enforcement.
Zero npm dependencies — Node.js built-ins only.

## How to run

Requires **Node.js ≥ 22.5**. No `npm install` needed.

```bash
npm start        # http://localhost:3002 — sign in with any username (e.g. alice), open a 2nd browser as bob
npm test         # 13 tests: 5 spec scenarios + 8 acceptance/edge-case tests
```

Sign-in issues the same signed HS256 token + HttpOnly cookie as Option 1; full password auth is Option 1's scope.

## API

| Method | Path | Success | Errors |
|---|---|---|---|
| POST | `/tasks` `{ title, description? }` | `201` task | `400`, `401` |
| GET | `/tasks?status=open\|done` | `200` own tasks, newest first | `400` bad status, `401` |
| PUT | `/tasks/:id` `{ title?, description?, status? }` | `200` task | `400`, `401`, `404` |
| DELETE | `/tasks/:id` | `204` | `401`, `404` |

## Design decisions

- **Ownership in the query:** every read/write is `WHERE id = ? AND owner_id = ?`, so another user's task is indistinguishable from a missing one → **404** (chosen over 403 so IDs can't be probed for existence).
- **Validation:** title required, trimmed, non-empty, ≤ 200 chars; also enforced by a DB `CHECK`. Status limited to `open|done` by `CHECK`.
- **Idempotent toggle:** the client sends the *target* status (`{status:'done'}`), not "flip", so a retried or duplicated request can't flip it back.
- **UI:** optimistic updates with rollback on error; per-task in-flight guard ignores rapid double clicks; a `404` on update/delete (deleted in another tab) removes the row and informs the user; toasts for every write; filter tabs call `?status=`.

## Spec test scenarios → tests (`test/tasks.test.js`)

| # | Given / When / Then | Test |
|---|---|---|
| 1 | Empty/whitespace title → 400 | `#1 empty / whitespace title` |
| 2 | Task of A, B updates/deletes → denied | `#2 task owned by A, user B updates/deletes it` |
| 3 | Open task, toggle → done (and back) | `#3 open task, toggle` |
| 4 | Non-existent id, delete → 404 | `#4 non-existent task id` |
| 5 | Mixed statuses, `?status=open` → only open | `#5 mixed statuses` |

Edge cases covered: auth on every endpoint, whitespace title on update, bad status filter, concurrent identical toggles, already-deleted task, 60-task list performance.

## Story point estimation

| Factor | Assessment |
|---|---|
| Complexity | Medium: ownership checks and optimistic UI with rollback. |
| Effort | Medium: 4 endpoints, list UI with inline edit, filters, 13 tests. |
| Uncertainty / Risk | Low: well-understood CRUD pattern. |
| **Estimate** | **5 points** |
| Rationale | Back end alone is a 3, but optimistic UI + rollback + double-click/other-tab edge cases add real front-end work. |
