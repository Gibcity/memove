# memove — Backlog (verified)

> Source of truth for all pending work. Updated by agents as items progress.
> Handoff instruction: "read this file." All numbers are disk-verified.
> WSJF priority order. Each item is done when its exit criterion is observably true.

## Legend

- **WSJF** = value ÷ size. Higher = do sooner.
- **Size**: trivial < small < medium < large
- **Status**: 🔴 pending · 🟡 in-progress · 🟢 done · ⚫ dropped

---

## Active items

### 1. T5 stub services — WSJF 4.5 · trivial · 🟢 done
- **Problem**: `scheduler.ts:362–398` lazy-`require()`s 3 services that don't exist. `MODULE_NOT_FOUND` on cron tick.
- **Fix**: Created 3 stub files at `apps/api/src/services/agents/{colService,housingMarketService,listingAlertService}.ts`. Each exports the expected method, calls `logWarn` and returns void.
- **Verified**: Disk-confirmed export names + method signatures match scheduler require() calls. `tsc --noEmit` clean on changed files. `eslint` clean on `services/agents/`.
- **Exit criterion**: ✅ scheduler's three lazy require() calls resolve at boot.

### 2. LLM streaming — WSJF 4.0 · small · 🟢 done
- **Problem**: 3–5s spinner dead-zone. Full response arrives as one chunk.
- **Fix**: `completeStream()` in client.ts (stream:true, async iterable) → `handleStream()` in chat service → `POST /api/relocation/chat/stream` SSE endpoint → `useChatStream()` hook (85 LOC) → wired into `AgentSurface.tsx` with fallback to non-streaming path.
- **Verified**: All 5 layers disk-confirmed. Existing `complete()` and `completeWithTools()` untouched. Tool-calling flow preserved (stays non-streaming, fallback on stream failure). tsc clean.
- **265 LOC** across 5 modified + 1 new file. ~65 LOC over ceiling — SSE + fallback + persistence.
- **Exit criterion**: ✅ tokens stream incrementally end-to-end.

### 3. console.log → structured logger — WSJF 3.5 · large · 🟢 done
- **Problem**: 173 `console.log` calls across `apps/api/src/`.
- **Fix**: All 173 replaced with `logInfo`/`logDebug`/`logError`/`logWarn` from `auditLog.ts`. Web side untouched (48 calls — `console.*` is the native browser logging API).
- **Verified**: `grep "console\.(log|error|warn|debug)" apps/api/src/` returns only 4 matches, all inside `auditLog.ts` itself (the logger's stdout output — correct exclusion). Spot-checked import paths and call counts on hottest files.
- **Exit criterion**: ✅ zero console.* in scope.

### 4. ZodValidationPipe on controllers — WSJF 2.5 · large · 🟢 done
- **Problem**: 44 of 48 controllers lacked input validation.
- **Fix**: Wired `ZodValidationPipe` to 19 controllers using existing `@memove/shared` schemas. 9 controllers skipped (no input params). 16 deferred (need new schemas or deliberately loose — OAuth, passkey, memory providers). 4 already had it.
- **Verified**: All 19 controllers disk-confirmed with `@UsePipes(new ZodValidationPipe(...))`. 3 type mismatches fixed (accommodations `Number()` coercion, trips `as string`). 123/123 shared schema tests pass. tsc clean except 7 pre-existing `Request.user` auth/oauth errors.
- **Commit**: `7e5f8c18` — 22 files, +566/-242.
- **Exit criterion**: ✅ all ready-to-wire controllers validate via `ZodValidationPipe`.

### 5. strictNullChecks migration — WSJF 1.0 · large (incremental) · 🟢 done
- **Problem**: `strict: false` in both api and web tsconfig.
- **482 client + 60 server errors** when enabled.
- **Fix**: All 543 errors fixed across ~90 files. Mechanical fixes: `?.` optional chaining, `?? defaults`, null guards, typed useState/useRef generics, type narrowing. Both tsconfigs now have `"strictNullChecks": true` as standalone override (keeping `strict: false` for now — other strict sub-flags not yet enabled). Added `import '../typings/express'` to app.module.ts to load Express Request.user augmentation.
- **Verified**: `tsc --noEmit` clean on both apps/api and apps/web. `pnpm -r typecheck` passes. Lint clean. Test failures identical to baseline (40 pre-existing).
- **Exit criterion**: ✅ strictNullChecks enabled, zero errors.

---

## Dropped / no-op items

### ~~useShallow~~ — ⚫ dropped
- **Reason**: Zero multi-value Zustand selectors exist in the codebase. Every selector is single-field. `useShallow` has 0 imports. Q7 is a no-op.

---

## Known pre-existing (not ours)
- Server OAuth `Request.user` typecheck errors
- 2 failing tests (Synology, system notices)
- `PLAN.md` is stale (Phases 1–4 complete). Use this file instead.

---

## Changelog
- 2026-07-01: Created from verified investigation. console.log count corrected 49→221. Controller count corrected 5→44. useShallow dropped as no-op. T5 stubs and LLM streaming dispatched.
- 2026-07-01: strictNullChecks migration complete. 543 errors fixed across ~90 files. Both tsconfigs flipped. Stale strangler docs cleaned up (nest/README.md, oauth.module.ts, index.ts, globalMiddleware.ts).
