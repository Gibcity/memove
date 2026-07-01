# Current Work — Active Task List

**Last updated:** 2026-07-01 (session 2 — Phase 1 + 2 DONE)
**Memove HEAD:** `31802f64` (clean tree — data + docs consolidated)

## Done (don't redo)
- [x] Architecture pivot: 3-panel shell → AgentSurface + PayloadRenderer + views/ + tool-registry
- [x] Orphan cleanup: 5 dead hooks, charts/, dead deps removed
- [x] F17: Hard-filter promotion UX + scoring fix (9f947bec, 729e09bd)
- [x] F12: Concierge FE panel (6363d078)
- [x] T19: DSR (GDPR/CCPA) endpoints (6363d078)
- [x] T11: Chat classifier — already LLM tool-calling, no regex
- [x] T17: Eval-fixture scale-out — 103 fixtures across 39 profiles (b244aa2e)
- [x] D3: ZHVI provenance audit closed — ACS is live source, ZHVI archived (63d4214)
- [x] T5: startAgentTasks() scheduler wiring — 3 cron tasks, stub services via require() (3255d7d4)
  - NOTE: `server/src/services/agents/` dir NOT created — scheduler uses lazy require() that will fail at runtime. Stubs needed when business logic lands.
- [x] T6: Relocation offline bundle — bundle() on RelocationService + GET /api/relocation/bundle (196c680c)
- [x] T7: SQLite hot-cache for scoring — relocationCache.ts, read-through in scoreLocations, TTL 5min (ca3d052e)
- [x] All 17/17 wiring gaps closed, dataset 100% null-free
- [x] Folder rename: trek/ → memove/ (2026-07-01). Git remote already memove.git. Package already @memove/root.
- [x] Code quality audit: 4-agent fan-out (backend timed out, FE/arch/tests completed). Report delivered inline. Overall: 7/10.
- [x] Trek purge: all source/docs references cleaned (migration string literals in offlineDb.ts + demo-seed.ts intentionally kept — they're lookup keys)
- [x] AGENTS.md + CLAUDE.md + drift-check script created at memove/ root. CI enforcement added to test.yml.

## Test fix
- `tests/unit/nest/wiring.test.ts` — FIXED (c9cb96c9). Added `@Optional()` on RelocationJourneyService second param. 2799/2799 pass.

## Uncommitted (next commit)
**Trek purge + context infrastructure** — 16 files changed:
- `AGENTS.md` (new) — AI session bootstrap, 223 lines, CI-enforced drift check
- `CLAUDE.md` (new) — Claude Code session protocol, 158 lines
- `scripts/check-agents-md.mjs` (new) — path verification + size budget
- `.github/workflows/test.yml` — added AGENTS.md drift-check CI job
- `package.json` — added `lint:docs` script
- `scripts/run-phase5-integration.sh` — $TREK→$MEMOVE variable rename + stray ¶ fix
- `scripts/eval.mjs` — trekRoot→memoveRoot variable rename
- `scripts/eval/generate-fixtures.mjs` — trekRoot→memoveRoot variable rename
- `scripts/eval/README.md` — trek/→memove/ path refs
- `REPORT.md` — trek/→memove/ path refs throughout
- `client/src/db/offlineDb.ts` — rebrand comment (string literal 'trek-offline' kept as lookup key)
- `server/src/demo/demo-seed.ts` — rebrand comment (migration lookup keys kept)
- `server/src/nest/relocation/relocation.service.ts` — cache key refactor + comment cleanup
- `server/src/services/relocationCache.ts` — serialization guard + comment cleanup
- `server/tests/unit/services/passwordPolicy.test.ts` — Trek→Memove in test passwords
- `MONOREPO-STRUCTURE-RECOMMENDATION.md` (new) — 391-line research deliverable

## Remaining tasks (priority order)

### P0 — Next to execute
1. **MapLibre GL migration** — ✅ DONE (commit `5c364cd4`). mapbox-gl + leaflet → maplibre-gl. 38 files, −2081 net lines. Client tsc clean, 2756 tests pass.
2. **Repo consolidation** — ✅ DONE (commits `f7b3d73a` + `31802f64`). Planning docs → docs/planning/, research → docs/research/, data → data/, ETL scripts → data/scripts/. Server paths updated.
3. ~~Workspace restructure~~ ✅ DONE — client/→apps/web/, server/→apps/api/, shared/→packages/shared/ (commit `542d6a14` + `d882142b`)

### P1 — Code health
4. **§6 #7: BLS OEUM** — Career uses ACS S2001/S2401; BLS OEUM deferred. Low priority — ACS data is sufficient for v1.
5. **T5 stub services** — Create `server/src/services/agents/colService.ts`, `housingMarketService.ts`, `listingAlertService.ts` with stub methods when business logic is ready.

### P2 — Designed, deferred to Phase 5/6
6. **T15: A/B elicitation harness** — designed, not built
7. **F14: Conjoint-analysis mode** — designed, deferred
8. **F15: IAT micro-elicitation** — designed, deferred

### Quality debt (from audit — priority order)
9. **DayPlanSidebar.tsx** — 2290 lines, decompose into 6-8 files (P0 for accessibility)
10. **strictNullChecks** — turn on for client + server tsconfig
11. **Relocation scoring tests** — 3 tests for 1481 LOC, needs 20+
12. **ZodValidationPipe** — wire to legacy controllers (6 of 48 use it)
13. **React.lazy** — route-level code splitting in App.tsx
14. **Zustand shallow comparison** — useShallow on multi-value selectors

### Notes
- `relocation-chat.service.ts` is at `server/src/nest/relocation/`
- Codegraph MCP available for investigation (`mcp_codegraph_codegraph_explore`)
- Skill `memove-delegate-verify` has the full delegation protocol
- No trek/trek-related Docker containers running
- Geo platform research subagent still running (MapLibre agentic-native question, Cesium, open-source geo survey)
