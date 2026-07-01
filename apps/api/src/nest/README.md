# NestJS module & test guide

NestJS serves the entire API surface; the legacy Express app has been
decommissioned (see the "Brownfield Rewrite" board for the strangler history).
Every route — `/api/*`, the platform/transport routes (`/mcp`, `/.well-known`,
OAuth SDK, SPA catch-all), and `/uploads` — runs through the single NestJS app
wired up in `src/bootstrap.ts`. **Weather (`weather/`) is the reference
implementation** — copy its shape when adding a new domain.

## Module layout (per domain)

```
shared/src/<domain>/<domain>.schema.ts(.spec.ts)   # Zod contract — single source of truth
server/src/nest/<domain>/<domain>.service.ts        # business logic (ported 1:1 from the Express service)
server/src/nest/<domain>/<domain>.controller.ts     # same routes/verbs/params/status codes as Express
server/src/nest/<domain>/<domain>.module.ts         # registered in app.module.ts
```

A route registered on the Nest controller is served by Nest directly — there is no
prefix toggle to flip anymore (the strangler's `NEST_PREFIXES` env override is historical).
Trip-scoped mounts use a pattern prefix with a `:param` segment (e.g.
`/api/trips/:tripId/packing`); sibling trip routes (days, places, …) are all on Nest too.

## Migrated so far

All domains are on Nest. The strangler ran in two phases and is now closed:

- **Phase 1 (leaf):** weather, airports, config (public), system-notices, maps,
  categories, tags, notifications, atlas.
- **Phase 2 (trip sub-domains):** vacay (addon), packing, todo.

## Cross-cutting Foundation pieces

- `common/idempotency.interceptor.ts` — global `APP_INTERCEPTOR` replaying the
  client's `X-Idempotency-Key` on mutations, mirroring the legacy
  `applyIdempotency` middleware so retried writes don't double-apply.

## Parity gotchas worth remembering

- A POST that answers with `res.json` in Express stays **200**; add `@HttpCode(200)`
  (Nest defaults POST to 201). Creates that Express sends as 201 need nothing.
- Static sub-routes that collide with a `:id` param (e.g. `/in-app/all` vs
  `/in-app/:id`, `/reorder` vs `/:id`) must be declared **before** the param route.
- Reproduce bespoke admin/error wording exactly — e.g. notifications' `test-smtp`
  returns `{ error: 'Admin only' }`, not the AdminGuard's `Admin access required`.
- Trip-scoped routes verify trip access (404) and the relevant permission (403)
  per handler and forward `X-Socket-Id` to the WebSocket broadcast.

## Parity is law

A migrated route must be **byte-identical** for the client: same URL, method,
query/body, HTTP status, `Set-Cookie`, and JSON body — including bespoke error
strings. Where the legacy route returns a hand-written error (e.g. weather's
`{ error: 'Latitude and longitude are required' }`), reproduce that exact body in
the controller rather than relying on the generic `ZodValidationPipe` envelope.

## How to write the tests

Every module ships three kinds of tests; the coverage gate (`vitest.config.ts`,
scoped to `src/nest/**`) requires ≥80%.

1. **Service / controller unit spec** — `tests/unit/nest/<domain>.controller.test.ts`.
   Instantiate the controller with a mocked service; assert status codes, the exact
   `{ error }` bodies, and that inputs are forwarded correctly (defaults, coercion).
   See `weather.controller.test.ts`.

2. **Parity test** — `tests/parity/<domain>.parity.test.ts`. Mock the shared service
   identically for both apps, then fire the same request at the legacy Express
   route and the Nest controller with the `expectParity()` harness
   (`tests/parity/parity.ts`) and assert identical status + body. These tests are
   preserved as a regression net for domains already on Nest — Express is gone,
   so they document the byte-identical contract the migration locked in.
   See `weather.parity.test.ts`.

3. **e2e** — `tests/e2e/<domain>.e2e.test.ts`. Boot the Nest module against a temp
   in-memory SQLite db via the shared harness (`tests/e2e/harness.ts`:
   `createTempDb`/`seedUser`/`sessionCookie`), exercising the **real** `JwtAuthGuard`
   end-to-end (401 without cookie, 200 with a signed session). Mock external I/O
   (HTTP/etc.). See `weather.e2e.test.ts`.

## Definition of Done (historical — per module)

This is the workflow the strangler used to migrate each domain, kept for context.
Every item below was satisfied module-by-module before the Express route/service
was retired; nothing here gates new work any more.

Contract in `@memove/shared` → service ported 1:1 → controller with identical routes →
validation/error parity → unit + parity + e2e tests over the gate → prefix toggled to
Nest → parity verified on the demo DB → **then** decommission the old Express
route/service (separate step, after the toggle is confirmed in prod) → frontend points
at the typed contract (Frontend Track).
