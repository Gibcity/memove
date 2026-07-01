# Current Work — Active Task List

**Last updated:** 2026-07-01 (session 2 — Phases 1-4 done, repo consolidated)
**Memove HEAD:** `776789d1` (clean tree)
**Single repo:** All work lives in `memove/`. Parent is a shell with `.git/` history.

## Done (don't redo)

### Session 1
- [x] Architecture pivot: 3-panel shell → AgentSurface + PayloadRenderer + views/ + tool-registry
- [x] Orphan cleanup: 5 dead hooks, charts/, dead deps removed
- [x] F17: Hard-filter promotion UX + scoring fix (9f947bec, 729e09bd)
- [x] F12: Concierge FE panel (6363d078)
- [x] T19: DSR (GDPR/CCPA) endpoints (6363d078)
- [x] T11: Chat classifier — already LLM tool-calling, no regex
- [x] T17: Eval-fixture scale-out — 103 fixtures across 39 profiles (b244aa2e)
- [x] D3: ZHVI provenance audit closed — ACS is live source, ZHVI archived (63d4214)
- [x] T5: startAgentTasks() scheduler wiring (3255d7d4) — stubs still needed
- [x] T6: Relocation offline bundle (196c680c)
- [x] T7: SQLite hot-cache for scoring (ca3d052e)
- [x] All 17/17 wiring gaps closed, dataset 100% null-free
- [x] Folder rename: trek/ → memove/. Package @memove/root.
- [x] Code quality audit: 7/10. Report delivered inline.
- [x] Trek purge: all source/docs references cleaned
- [x] AGENTS.md + CLAUDE.md + drift-check CI
- [x] Wiring fix: `@Optional()` on RelocationJourneyService (c9cb96c9)

### Session 2 — Phase 1: MapLibre Migration (`5c364cd4`)
- [x] mapbox-gl + leaflet → maplibre-gl. 38 files, −2081 net lines.
- [x] Dead leaflet components deleted (MapView, JourneyMap, ReservationOverlay, MapboxPreview)
- [x] Dual-provider toggle eliminated — single GL path
- [x] OSM raster tiles replace mapbox:// protocol
- [x] SharedTripPage + useAtlas (720L) ported to MapLibre imperative API
- [x] Settings types/store/API cleaned of all mapbox keys
- [x] Client tsc clean, 2756 tests pass

### Session 2 — Phase 2: Repo Consolidation (`f7b3d73a` + `31802f64`)
- [x] Planning docs → docs/planning/ (CONTRACT, RESEARCH, INVENTORY, BRIEFs, etc.)
- [x] Research reports → docs/research/ (geo survey, map comparison)
- [x] Data sources → data/ (processed, normalized, raw gitignored)
- [x] ETL scripts → data/scripts/
- [x] Server paths updated (career.service.ts, locations.loader.ts)
- [x] Parent repo cleaned: 615 files removed, only memove/ + .git/ remain

### Session 2 — Phase 3: Workspace Restructure (`542d6a14` + `d882142b`)
- [x] client/ → apps/web/, server/ → apps/api/, shared/ → packages/shared/

### Session 2 — Phase 4: Quality Debt
- [x] React.lazy + Suspense route splitting (`5e954601`)
- [x] DayPlanSidebar decomposed: 2290L → 1403L parent + 6 extracted components (`d021ca01`)
- [x] Scoring tests: 3 → 48 tests for relocation.service.ts (`95e990c9`)
- [x] Ranking eval CI gate: 103 fixtures wired into test workflow (`01db7397`)
- [x] Roadmap analysis: 35KB audit at docs/planning/ROADMAP-ANALYSIS.md (`776789d1`)
- [x] Orchestration skill: delegate-orchestration with self-improving feedback loop

## Remaining tasks (priority order — WSJF-scored per ROADMAP-ANALYSIS.md)

### P0 — High leverage, low effort
1. **Replace 49 console.log** with structured logger (WSJF 4.0, ~1hr)
2. **useShallow** on Zustand multi-value selectors (WSJF 4.0, ~1hr)
3. **ZodValidationPipe** on 5 highest-traffic legacy controllers (WSJF 2.5)
4. **T5 stub services** — col/housing/listing services will fail at runtime without stubs
5. **LLM streaming** — `stream: true` in llm/client.ts + useChatStream() hook (<200 LOC, highest-leverage agentic gap)

### P1 — Medium effort, high value
6. **strictNullChecks** — 482 client + 60 server errors. File-by-file opt-in.
7. **Break relocation.service ↔ relocation-journey.service circular dep** — extract shared type into third service
8. **Sensitivity endpoint** — POST /api/relocation/score/sensitivity (after eval fixtures validate stability)
9. **Move relocationCache.ts + llm/client.ts** into nest/relocation/

### P2 — Data pipeline expansion
10. **EPA AQS** (air quality) — free API, high value
11. **ACS diversity metrics** (B03002/C16001) — standard relocation metric
12. **TIGER/Line county boundaries** — enables choropleth drill-down
13. **BLS OEUM** — deepens career data (ACS substitute is sufficient for v1)

### Deferred (YAGNI per roadmap audit)
- ~~CesiumJS 3D~~ — 2.5MB bundle, no use case
- ~~Land prices~~ — fragmented sources, niche
- ~~CMS CAHPS~~ — wrong granularity for CBSA model
- ~~Phase 5 geo build-out~~ — trigger: map perf complaint, spatial-join ask, or offline-mobile ask
- ~~Conjoint analysis mode (F14)~~
- ~~IAT micro-elicitation (F15)~~
- ~~A/B elicitation harness (T15)~~

### Notes
- `relocation-chat.service.ts` is at `apps/api/src/nest/relocation/`
- CURRENT-WORK.md now lives in memove/ (moved from parent root)
- PLAN.md is stale — Phases 1-4 done. See ROADMAP-ANALYSIS.md for forward-looking priorities.
- Skill `delegate-orchestration` has the self-improving delegation patterns
- Skill `memove-delegate-verify` has the delegation protocol
- Pre-existing server typecheck errors: OAuth controller `Request.user` typing (not our changes)
- Pre-existing test failures: Synology API connection, system notices registry (not our changes)
