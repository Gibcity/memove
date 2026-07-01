# memove Roadmap Analysis — Structured Report

**Scope:** memove's relocation add-on roadmap (PLAN.md + CONTRACT.md + RESEARCH.md + INVENTORY.md + feature-map.md + briefs + source code as built 2026-07-01).
**Frameworks applied:** Product strategy (RICE / WSJF / Kano / JTBD) · Decision science (MCDA, sensitivity/dominance) · GIScience (spatial pipeline maturity) · Agentic AI (tool-use, agent UX patterns) · Urban-economics data coverage.
**Read alongside:** `PLAN.md`, `CONTRACT.md §0`, `CURRENT-WORK.md`, `apps/api/src/nest/relocation/relocation.service.ts`, `apps/api/src/mcp/tool-registry.ts`, `apps/api/src/services/llm/client.ts`, `scripts/eval/fixtures/ranking-cases.json`, `reports/geo-platforms-survey-2026.md`.

---

## §0 — Where the roadmap actually stands (vs the document)

PLAN.md is a stale-but-accurate skeleton. Read against CURRENT-WORK.md and the working tree:

| Phase | PLAN.md says | Reality 2026-07-01 | Confidence |
|---|---|---|---|
| 0 | Done | Done. Confirmed. | High |
| 1 MapLibre migration | Pending | Done (`5c364cd4`, −2081 net lines, 2756 tests pass) | High |
| 2 Repo consolidation | Pending | Done (`f7b3d73a` + `31802f64`) | High |
| 3 Workspace restructure | Pending | Done (`542d6a14` + `d882142b`) | High |
| 4 Quality debt | Items P0–P3 listed | **0/13 items completed.** `DayPlanSidebar.tsx` still 2290 lines. `strictNullChecks` still off. Scoring engine still has 4 tests (`tests/unit/nest/relocation.service.test.ts`) for a 1481-LOC service. 6/48 controllers still have `ZodValidationPipe`. | High |
| 5 Geo build-out | "when product needs it" | Postponed per CONTRACT.md. Scoring engine already ships choropleth (`RelocationMapPanel.tsx`, 596L), so a deck.gl overlay isn't strictly needed to ship. | Medium |

**Net:** PLAN.md is now a doc-of-record, not a working back-log. The real backlog is **(a)** the open quality-debt items in Phase 4 and **(b)** the Phase 5 expansion targets listed in `feature-map.md §Data sources` ("Phase 5 expansion targets: BLS OEUM, ZHVI replacement audit, land prices, childcare cost, air quality, healthcare quality (CMS CAHPS)").

This analysis is therefore aimed at the **remaining work**, not the done work.

---

## §1 — Roadmap methodology audit

### 1a. What methodology PLAN.md uses implicitly

Reading the doc cold: the methodology is **risk-and-dependency-driven engineering sequencing**, not product prioritization. Three tells:

1. **Phase 0 = hygiene** (rename, purge, audit) — internal-code-quality items, zero user value.
2. **Phases 1–3 = build-system cleanup** — MapLibre migration, repo consolidation, workspace restructure. All "make future work cheaper" items. No user-visible outcome.
3. **Phase 4 = ad-hoc quality-debt list** with P0–P3 labels (priority by ease/risk, not by user value).
4. **Phase 5 = "when product needs it"** — explicit deferral trigger, no trigger condition defined.

There is **no RICE, no WSJF, no Kano, no JTBD.** No user-research validation step. No competitive analysis. No success metrics per phase. The "scoring engine" is well-defined (multi-criteria decision analysis), but the *roadmap* itself uses engineering intuition.

### 1b. What's missing (concrete gaps, not generic advice)

| Missing | Why it matters here | Evidence |
|---|---|---|
| **User-validation loop** | `RESEARCH.md §1` claims TikTok-style cold-start feed in <5 min, but there is no plan to *measure* that with a user. The cold-start UX (3 questions → embedding → ranked list) is unvalidated. | `RESEARCH.md §1` "Time-to-first-useful-feed <5 minutes" stated as a target, no telemetry plan |
| **Competitive analysis** | memove positions as "relocation intelligence" — but no document names BestPlaces, Niche, AreaVibes, or City-Data. Without knowing what they cover, the 939-CBSA data moat can't be defended. | None of the 6 anchor docs |
| **Success metrics per phase** | Phase 5 ("Geo build-out") has no acceptance criteria. Phase 4 has only "verify command" (build + test + e2e). No quality metric for ranking quality. | `PLAN.md` lines 32, 51, 67; `CONTRACT.md §10` only has integration-test criteria |
| **Weight-validation methodology** | The scoring engine accepts `weights: Record<string, number>` from the client, but no doc defines how weights are *learned* — only that the elicitation collects them via 3 multiple-choice questions. The math between `q1-cost-priority: cost_high` and `{cost: 5, ...}` is implicit. | `relocation.service.ts:474-553` (questions) and `:163-170` (default weights) have no mapping table |
| **Sensitivity analysis on the scoring formula** | The MCDA engine has min-max + z-score normalizers, hard filters, soft weights — but the code has no mechanism for "what if I change the cost weight from 5 to 10, does Memphis fall out of the top 5?" — no dominance check, no what-if endpoint. | `relocation.service.ts`; no `POST /api/relocation/score/sensitivity` endpoint |
| **Cold-start trigger condition** | Phase 5 says "when product needs it." No telemetry, no threshold. | `PLAN.md` line 87 |
| **ZHVI replacement follow-through** | `feature-map.md` §Data sources says "D3 ZHVI replacement audit closed — ACS is live source, ZHVI archived." But Phase 5 expansion still lists "ZHVI replacement audit." Contradiction, or the audit was a no-op? | `feature-map.md:104-106` vs `feature-map.md:125` |

### 1c. Dependency sequencing — correct, with one circular risk

The phase ordering is **structurally correct**: you can't do Phase 4 (workspace `apps/web/apps/api/packages/shared`) before Phase 3, and Phase 1 (MapLibre) before Phase 5 (geo). Good.

**One real circular-dependency risk** that lives in the working code, not the docs:

- `apps/api/src/nest/relocation/relocation.service.ts:3167L` (4 services) — `relocation.service` ↔ `relocation-journey.service` cycle is on the Phase 4 P3 list. CURRENT-WORK.md confirms `wiring.test.ts` required `@Optional()` to break it. The cycle is *currently* deferred via DI, not eliminated.

The relocation add-on's data path is a separate, hidden cycle:

```
relocation.service.scoreLocations → relocationCache (read-through, in-process)
  → locations.loader (one-shot, module-load)
    → data/processed/relocation/locations.json (filesystem, checked in)
```

This is **not a code cycle**, but it *is* a deploy cycle: any change to `locations.json` requires a server restart to pick up. Cache TTL is 5 min (`relocationCache.ts`), so the actual cycle is "edit JSON → wait 5 min OR restart." That should be in the Phase 4 list.

### 1d. Hidden backlog items not in PLAN.md

Cross-referencing CURRENT-WORK.md's "Remaining tasks" against the working tree:

- **T5 stub services** (`colService.ts`, `housingMarketService.ts`, `listingAlertService.ts`) — `startAgentTasks()` cron scheduled, but the require()-lazy-loaded modules will fail at runtime. Not in PLAN.md Phase 4.
- **5-dep budget** (`BRIEF-FRONTEND.md`) — Phase 4 already added `@qdrant/js-client-rest` and other deps; the budget needs re-stating or re-baselining.
- **Operator-key dependency** (`START_HERE.md` "LLM API key string") — Phase 4 e2e gates cannot pass without this. No escalation path in PLAN.md.

---

## §2 — Problem classification (remaining work only)

For each remaining item, classify the formal problem type and rate uncertainty.

| ID | Item | Problem type | Uncertainty | What reduces uncertainty |
|---|---|---|---|---|
| Q1 | `React.lazy` + `manualChunks` in App.tsx | Quality debt (perf) | Low | `pnpm build --analyze` (already wired via `manualChunks` reference) |
| Q2 | Decompose `DayPlanSidebar.tsx` (2290L) | Quality debt (maintainability) | **Med-High** — 2290L is real, no extracted boundaries yet | Extract the lowest-coupling piece first (`NoteRow` — pure read/write) to learn the seams |
| Q3 | Turn on `strictNullChecks` (client + server) | Quality debt (type safety) | **High** — will likely surface hundreds of `null`/`undefined` issues | Grep `as any` and `@ts-ignore` first; file-by-file opt-in per-module |
| Q4 | Tests for `relocation.service.ts` (3 → 20+) | Quality debt (test coverage) | Low | The 103 fixtures in `ranking-cases.json` already cover realistic rank assertions — wire them in as `expect(rank).toMatchFixture(...)` |
| Q5 | Tests for `reservationService`, `passkeyService`, `shareService`, `inAppNotifications` | Quality debt (coverage) | Low | Mirror existing test scaffolds |
| Q6 | Wire `ZodValidationPipe` to 5 legacy controllers | Quality debt (input safety) | Med | Pick the 5 by route frequency, not by file size |
| Q7 | `useShallow` on Zustand selectors | Quality debt (perf) | Low | grep `useStore(` selectors that read >1 slice |
| Q8 | Replace 49 `console.log` with structured logger | Quality debt (observability) | Low | One PR, mechanical |
| Q9 | Add `htmlFor`/`id` to form labels | Quality debt (a11y) | Low | One grep + patch pass |
| Q10 | Break `relocation.service` ↔ `relocation-journey.service` cycle | Architecture debt | **High** — current DI is fragile | First extract the type they share, then break the call direction |
| Q11 | Move `relocationCache.ts` + `llm/client.ts` into `nest/relocation/` | Architecture debt (organization) | Low | Mechanical move |
| C1 | T5 stub services (col/housing/listing) | Code completeness | Low — stub method signatures | Decide the minimum viable signal |
| G1 | Phase 5 geo build-out (deck.gl choropleth, Photon, Valhalla, PostGIS, Martin) | Capability gap | **High** — Cesium is 2.5 MB and overkill; what's the actual ask? | Talk to one user who panned the map; check if the existing MapboxGL choropleth already met the ask |
| D1 | ZHVI replacement audit re-open | Data quality | Low — already closed per feature-map | Confirm operator sees the closure note |
| D2 | BLS OEUM (career data) | Data gap | **Med** — ACS S2001/S2401 is a substitute; OEUM adds metro×occupation granularity | Check if any eval fixture would change with OEUM |
| D3 | Land prices | Data gap | **High** — no clear source | Defer or drop; not in v1 scope |
| D4 | Childcare cost | Data gap | **Med** — `childcare_epi_2024.json` exists, provenance unclear (RESEARCH.md §4) | First verify the file's actual source |
| D5 | Air quality (EPA Air Quality System) | Data gap | Low — EPA AQS has free API | Add to ETL backlog |
| D6 | Healthcare quality (CMS CAHPS) | Data gap | **Med** — CMS CAHPS is state-level, not metro | Likely not feasible at CBSA granularity; substitute county-level |
| L1 | LLM streaming in chat | Agentic UX gap | **Med** — `llm/client.ts` has no `stream: true` path | One env-flag + one fetch-with-stream + one `useChatStream()` hook |
| L2 | Streaming response UI in `AgentSurface.tsx` | Agentic UX gap | Med | Same as L1, frontend-side |
| S1 | Sensitivity / what-if endpoint (`/score/sensitivity`) | MCDA gap | Med | Add after eval-fixture coverage lands |

**High-uncertainty items (Q3, Q10, G1, D3) deserve the next decision-doc — not the next sprint.**

---

## §3 — Domain-specific gaps

### 3a. MCDA / decision science — the scoring engine itself

The engine is multi-criteria decision analysis: 6 subscores (cost / climate / safety / healthcare / jobs / outdoors), each normalized independently (min-max for most, z-score for FEMA NRI), then weighted-summed (`relocation.service.ts:402-409`).

**What is correct:**
- **Normalization choice per field** (z-score for risk, min-max for cost) is principled — it prevents the corpus-min/max from distorting risk scores that already share a 0–100 scale. The `ponytail` comments explain this; keep.
- **Hard filters before scoring** is correct MCDA — exclude-then-rank is faster and avoids misleading "low score" interpretations of excluded items.
- **Trace lines** (`trace.push(\`Cost: ...\`)`) — good, decision science requires explainability.

**What is missing (decision-science best practices):**

| Missing capability | Why it matters | Evidence in memove |
|---|---|---|
| **Sensitivity analysis** — "how would Dallas's score change if I bump `cost` weight from 5 to 10?" | Default weights (`{cost:5, climate:4, ...}`) are opinionated. Users will want to probe the function. | No `/score/sensitivity` endpoint. No `perturbWeights()` in service. |
| **Dominance checking** — "is X strictly better than Y on all dimensions? Then X dominates Y." | For top-K recommendations, dominated candidates are dead weight. The current code ranks all 939; dominance check would shrink the choice set. | No dominance filter in `scoreLocation()`. |
| **Weight validation** — the elicitation maps 3 multi-choice answers to weights, but the mapping isn't documented and isn't tested. | If `q1=high` → `cost: 10` and `q1=low` → `cost: 0`, that's a 10× swing. The ranking result depends entirely on this lookup. | `ELICITATION_QUESTIONS` array exists; mapping to weights lives somewhere implicit (likely the `recordElicitationResponse` flow). No test fixture exercises it. |
| **Inconsistency detection on stated weights** (Saaty's AHP) | Users rank schools #1 and healthcare #2 but assign schools weight 0.1 and healthcare 0.9. Engine should detect and warn. | None |
| **Weight provenance on the response** | When a user looks at the trace, they should see which weights came from elicitation vs profile vs defaults. | `weightsFromProfile: boolean` exists, but not surfaced in the `ScoreResult` trace |
| **Rank-stability test** | Run the ranker with `weights ± 20%` and report whether the top-5 changes. A robust ranker has stable top-5; a fragile one flips on every perturbation. | Eval fixtures are point-weights only; no perturbation testing |
| **Compensatory vs non-compensatory distinction** | Current engine is fully compensatory — a metro with great cost can "buy" terrible safety. Real relocation has true non-compensatories (school quality for parents is non-negotiable). | Hard filters approximate non-compensatory but the engine doesn't surface them as such |

**Ponytail recommendation:** Add **one** sensitivity endpoint. `POST /api/relocation/score/sensitivity` accepts `{weights, perturbByPct}`. For each top-K candidate, return `{locationId, baseScore, scoresPerturbed, rankDelta}`. Don't build a UI for it yet — wire it into the eval runner so the next fixture run validates stability.

### 3b. GIScience — geo stack sequencing

PLAN.md Phase 5 picks components but doesn't sequence them. The geo-platform survey (`reports/geo-platforms-survey-2026.md`) covers the menu; what's missing is the *order* and *what's already shipped*.

**Already shipped (no work needed):**
- `RelocationMapPanel.tsx` (596L) — MapLibre/MapboxGL with clustering + choropleth + popups (per `feature-map.md:64`)
- `cbsa_gazetteer_coords.json` — metro centroids (per `feature-map.md:48`)
- The 939-CBSA dataset has `lat`/`lng` per location

**Sequencing recommendation (smallest-first):**

1. **PMTiles basemap** (Protomaps) — adds offline capability, ~30 MB. Low risk, ships behind existing Mapbox style. Existing tile-prefetcher (`sync/tilePrefetcher.ts`) already IndexedDB-caches; PMTiles is a swap.
2. **Tippecanoe** (tile pre-bake) — for the choropleth overlays we already render. Replaces the runtime data fetch.
3. **Turf.js** (in-browser spatial math) — pure JS, no infra. Use case: "hospitals within 10 mi of this lat/lng" on the client.
4. **deck.gl** (overlay) — already on the menu. Worth it if `RelocationMapPanel` runs >60 fps with the choropleth; measure before adding.
5. **PostGIS** — only when runtime spatial queries become a real bottleneck. Currently 939 rows in `locations.json`; SQLite + JSON lookup is fine. PostGIS is GPL-2.0 (acceptable per the survey).
6. **Photon** (geocoding) — only when user input needs to be lat/lng. Free-text search currently uses location name (slug match), not geocoding.
7. **Valhalla** (isochrones) — only when "what's within 30-min drive" is a real feature ask. Nothing in the rel spec asks this yet.
8. **OSRM** (routing) — only when scouting-trip planning lands. Trip planner already has it (or similar).
9. **CesiumJS** (3D) — explicit defer. 2.5 MB bundle is too big for a relocation PWA already shipping MapLibre + React 19.

**Spatial-analysis capabilities needed but not planned:**
- **County-level choropleth** (FEMA NRI heatmap by county, not by CBSA) — useful for "show me tornado risk in this region" but adds ~3,200 county polygons. Not in Phase 5 menu.
- **Drive-time isochrones** (Valhalla) — when a user filters to "must be within 1hr of mountains," the answer is a polygon, not a list. Not in Phase 5 menu; only in §"New MCP tools" #3.
- **Spatial join** (PostGIS) — "hospitals + good-schools tracts within 10mi" is `ST_DWithin` × 2. The current data model joins on `cbsaCode`, not on geography. Joining on geography is a model change.

**GIScience verdict:** the geo stack menu in PLAN.md is correct but **over-loaded**. Cesium at 2.5 MB and PostGIS at "add when X" don't belong in v1. The actual v1 work is PMTiles + Tippecanoe + Turf — three small additions to the already-working `RelocationMapPanel`.

### 3c. Agentic AI — tool surface & agent UX patterns

**Tool surface — well-designed:**
- 165 MCP tools already shipped across 17 files
- `relocation.ts` + 5 split files (`relocation_admin`, `_community`, `_cost`, `_journey`, `_logistics`) — the split-by-domain is the right pattern
- `tool-registry.ts` is a single 1570-LOC file that aggregates `coreTools()` returning `relocationTools` — *single source of truth for tool metadata* ✅
- Scope gating (`relocation:read`, `relocation:write`) — correct
- LLM tool-calling wired in `relocation-chat.service.ts` via `completeWithTools()` — works, falls back to regex on failure

**Agentic UX patterns missing:**

| Pattern | Status | Why it matters here |
|---|---|---|
| **Streaming responses** | ❌ Not implemented. `llm/client.ts` is 111 lines, no `stream: true`, no SSE handler. `AgentSurface.tsx` shows typed `RichCard` payloads after the full response lands. | Cold-start <5 min target (RESEARCH.md §1) needs *perceived* latency <2s. Without streaming, the LLM tool-call loop (search_locations → score_locations → explain_score) hits 3-5s of dead air. |
| **Progressive disclosure** | ⚠️ Partial. `PayloadRenderer` does typed rendering, but no skeleton states between tool calls. | A user who panned to Memphis, dismissed Austin, opened Dallas sees... a spinner. Should see the implicit-signal feedback incrementally. |
| **Human-in-the-loop for hard-filter promotion** | ✅ Wired. `HardFilterBannerView.tsx` (98L) + F17 commit (`9f947bec`). | Good. This is the one agentic UX pattern done right. |
| **Tool-attribution in chat** | ✅ Done. `relocation-chat.service.ts` returns `{ text, tool, data }`; the FE shows "used `score_locations`" attribution. | Good. |
| **Cancellation** | ❌ Unknown. No `AbortController` in `completeWithTools()`. | A user who navigates away mid-tool-call still gets the result. Acceptable, but worth noting. |
| **Reasoning trace visibility** | ⚠️ Partial. `trace: string[]` is returned by `scoreLocation`, but the chat doesn't show it inline. User sees "Dallas: 78" — should see "cost 80, climate 75, safety 60 → 78." | The trace is shipped, the chat doesn't surface it. |
| **Multi-modal embedding input** | ❌ Not implemented (RESEARCH.md §1 noted but didn't plan). User's photos of past neighborhoods, Google Maps saves, Spotify playlists — none ingested. | Out of v1 scope per the same source, but no roadmap item defers it explicitly. |
| **Embedding-on-every-interaction (the TikTok pattern)** | ⚠️ Partial. `submit_implicit_signal` endpoint exists; but the prompt-response cycle is not yet "every pan updates embedding." | The signal-collection wiring is there; the embedding-write loop isn't (per CURRENT-WORK.md, Qdrant container runs but embedding-write path isn't confirmed). |

**Ponytail recommendation:** The single highest-leverage agentic gap is **streaming**. The chat is a 3-tool LLM-call chain; without streaming, the user sees a spinner for 3–5 seconds. With streaming, the user sees "thinking… searching locations…" tick by in real-time. Fix: one `stream: true` flag in `llm/client.ts`, one `ReadableStream` parser, one `useChatStream()` hook. Estimated diff: <200 lines, no new deps.

### 3d. Data pipeline — what's missing for comprehensive relocation intelligence

The 939-CBSA / 18,779-cell dataset is 100% null-free (per `feature-map.md:95`). What's *not* in the dataset:

| Missing data | Source candidates | Priority |
|---|---|---|
| **Land prices** (vacant lot $/acre by county) | County tax assessor scrapes (highly fragmented), LandWatch, Land of America paid API | **Low** — sub-feature; niche user need |
| **Childcare cost** | Childcare Aware (state-level, not metro), HUD fair market rent, BLS childcare services PPI | **Med** — file `childcare_epi_2024.json` exists with unclear provenance; verify or drop |
| **Air quality (AQI)** | EPA Air Quality System (free, well-documented, county-level stations) | **High** — well-known free source, no infra cost |
| **Healthcare quality (CMS CAHPS)** | CMS CAHPS patient-experience surveys | **Med-Low** — state-level only, not CBSA |
| **CMS Hospital Compare** (clinical outcomes) | CMS Hospital Compare (free, per-hospital) | **Med** — feeds `healthcareAccessScore` granularity |
| **Property crime detail by category** | FBI UCR has aggregate; NIBRS has detail but partial state coverage | Low — current violent+property is enough for v1 |
| **BLS OEUM** (occupation × wage detail) | BLS OEUM API (free, key required) | **Med** — careers feature ships with ACS now; OEUM would deepen |
| **ZHVI time-series** | Zillow ZHVI research CSV (free, but Zillow stopped public API; CSV downloads still work for past data) | Low — median value via ACS is the current source |
| **County boundaries (for choropleth drill-down)** | US Census TIGER/Line (free, ~20MB) | **High** — once you have choropleth, drill-down to county is the natural next step |
| **Crime by neighborhood (not city aggregate)** | Local open data portals (highly fragmented) | Low — fragmented sources, hard to maintain |
| **Transit ridership** | FTA NTD (free, agency-level) | Low — feature not asked |
| **Diversity metrics** (racial/ethnic composition, language at home) | ACS B03002, C16001 | **Med** — every relocation site has this; memove has none |

**Ponytail recommendation:** Add **EPA AQS + ACS diversity + TIGER/Line** to one batched ETL pull. Three sources, one PR, three high-value additions to the 939-CBSA matrix. Land prices and Childcare defer.

---

## §4 — Sequencing recommendations (WSJF-rescored)

**WSJF = Cost-of-Delay / Job-Duration.** Rough proxy:
- **CoD (1-10):** user value × time-criticality × risk-reduction
- **Job (1-10):** effort estimate

Items sorted by **WSJF score (CoD / Job, higher = do first).**

| Rank | ID | Item | CoD | Job | WSJF | Reasoning |
|---|---|---|---|---|---|---|
| 1 | Q4 | Tests for `relocation.service.ts` (3→20+) | **9** | 2 | **4.5** | The scoring engine is the product. With 103 ranking fixtures ready in `ranking-cases.json` and only 4 tests against 1481 LOC, every commit is gambling. ~2-day job, $50M bug if it breaks. |
| 2 | Q10 | Break `relocation.service` ↔ `relocation-journey.service` cycle | **8** | 3 | **2.7** | Already a known wiring-test failure (`@Optional()` is a band-aid). Multiplies risk across the whole add-on. |
| 3 | Q3 | Turn on `strictNullChecks` (file-by-file) | **7** | 5 | **1.4** | High effort, high payoff, but blocking on first PR — has to land before other refactors. |
| 4 | Q1 | `React.lazy` + `manualChunks` | **6** | 2 | **3.0** | Quick perf win, unblocks any subsequent FE work. |
| 5 | L1 | Streaming responses in `llm/client.ts` | **8** | 4 | **2.0** | The single highest-leverage agentic gap. Cold-start UX depends on it. |
| 6 | Q2 | Decompose `DayPlanSidebar.tsx` (2290L) | **6** | 6 | **1.0** | High effort, medium value. Defer unless a11y is in scope. |
| 7 | S1 | Sensitivity/perturbation endpoint | **6** | 3 | **2.0** | Once Q4 lands, sensitivity tests can be eval-driven. |
| 8 | Q6 | `ZodValidationPipe` on legacy controllers | **5** | 2 | **2.5** | Quick, security-positive. |
| 9 | Q8 | Replace 49 `console.log` with structured logger | **4** | 1 | **4.0** | One PR, mechanical, ops-friendly. Actually WSJF-tops the list by ratio. |
| 10 | Q7 | `useShallow` on Zustand selectors | **4** | 1 | **4.0** | Same. One grep, one patch pass. |
| 11 | Q9 | `htmlFor`/`id` on form labels | **3** | 1 | **3.0** | Trivial a11y. |
| 12 | Q5 | Tests for untested services | **4** | 4 | **1.0** | Coverage floor push. |
| 13 | D5 | EPA AQS ETL (air quality) | **5** | 3 | **1.7** | High-value data gap. |
| 14 | D7 | ACS diversity ETL (B03002/C16001) | **5** | 2 | **2.5** | Standard relocation-site metric; cheap to add. |
| 15 | D8 | TIGER/Line county boundaries | **6** | 4 | **1.5** | Unlocks drill-down to county in choropleth. |
| 16 | Q11 | Move `relocationCache.ts` + `llm/client.ts` into `nest/relocation/` | **3** | 1 | **3.0** | Trivial; do alongside any feature work. |
| 17 | C1 | T5 stub services (col/housing/listing) | **4** | 2 | **2.0** | Will break at runtime otherwise. |
| 18 | D2 | BLS OEUM (career depth) | **4** | 6 | **0.7** | Defer — ACS substitute is sufficient. |
| 19 | D4 | Childcare cost | **3** | 5 | **0.6** | Defer — provenance unclear. |
| 20 | D3 | Land prices | **2** | 8 | **0.25** | Drop — fragmented sources, niche use. |
| 21 | D6 | Healthcare quality (CMS CAHPS) | **3** | 6 | **0.5** | Drop — wrong granularity for v1. |
| 22 | G1 | Phase 5 geo build-out (PMTiles, Tippecanoe, Turf) | **7** | 6 | **1.2** | Medium urgency — needed when existing MapboxGL choropleth hits perf wall, not before. |
| 23 | G2 | CesiumJS 3D | **2** | 9 | **0.2** | Drop from roadmap. 2.5 MB bundle, no in-product ask. |

### 4a. Critical path to "Phase 5 geo build-out"

Phase 5 only matters when **the choropleth on the current map doesn't perform**. That depends on:

1. **Data size** — 939 CBSAs × N choropleth metrics. With current deck.gl-free MapboxGL implementation, fine.
2. **Overlay complexity** — when multiple choropleths overlay (cost + climate + crime), need deck.gl.
3. **Offline support** — when the relocation add-on ships to mobile-first users, PMTiles.

**Nothing in the working product currently needs Phase 5.** The critical path to Phase 5 is therefore "first user complains about map perf" or "first feature ask needs spatial join." Neither is on the near-term horizon.

**Recommendation:** Don't build Phase 5 yet. Mark it "trigger: any of {map perf complaint, spatial-join ask, offline-mobile ask}."

### 4b. What to cut or defer (YAGNI)

- **CesiumJS** — 2.5 MB bundle, no relocation use case that justifies it.
- **Land prices** — fragmented sources, niche user need.
- **CMS CAHPS** — wrong granularity for the CBSA model.
- **Sensitivity analysis endpoint** — useful, but build it *after* Q4 lands and the eval fixtures are wired in. Otherwise it's untestable.
- **Phase 5 post-bake tiles (Martin, Tippecanoe)** — Tippecanoe is fine to add; Martin only when runtime tile rendering becomes an ask. Defer Martin.
- **Multi-modal embedding input (photos, Spotify)** — out of v1 scope; defer to v2.

---

## §5 — Risk assessment

### R1 — Scoring engine correctness is unverified at scale

- **What:** `relocation.service.ts` is 1481 LOC with 4 unit tests. The 103 ranking fixtures in `ranking-cases.json` exist but aren't wired into a regression run.
- **Probability:** **High** — any refactor risks shifting the score formula. Recent cost-weights bug (the `ponytail` comment on line 309-312 — tax-score double-weighting) is the canary.
- **Impact:** **Critical** — the score is the entire product. If the ranking flips for one user, that user picks the wrong city.
- **Mitigation:** Land Q4 first. Wire `ranking-cases.json` into `pnpm test` so every PR re-validates 103 rank orders. Cost: ~2 dev-days.

### R2 — LLM chat UX has a 3–5s spinner dead-zone

- **What:** `completeWithTools()` returns only when the full tool-call chain completes. `AgentSurface.tsx` shows no incremental state.
- **Probability:** **High** — every chat interaction today waits for search → score → explain.
- **Impact:** **High** — the cold-start <5 min target (RESEARCH.md §1) is hurt by perceived latency; first-time users bounce.
- **Mitigation:** Land L1 (streaming). <200 LOC diff; reuses the existing `tool`/`data` shape; AgentSurface just adds an "in-flight tool" pill.

### R3 — Phase 5 is undefined and will be over-built

- **What:** Phase 5 menu in PLAN.md is 8 components (Cesium, PostGIS, Valhalla, OSRM, Martin, Tippecanoe, deck.gl, Photon). No sequencing, no trigger.
- **Probability:** **Med-High** — given the menu is large and the current product works without any of it, the temptation is to start building.
- **Impact:** **Med** — time-sink without user need. ~weeks of work for zero current user value.
- **Mitigation:** Replace Phase 5 menu with a 3-line trigger condition + the 3 components that actually unlock new behavior (PMTiles, Tippecanoe, Turf). Defer the rest.

### R4 — Operator dependency on LLM API key

- **What:** `START_HERE.md` — T2.11 + T2.12 e2e gates cannot pass without the operator-supplied OpenCode Go API key.
- **Probability:** **Med** — single human dependency; not in the engineering team's control.
- **Impact:** **Med** — gates are blocked; chat LLM features un-testable; AgentSurface remains regex-fallback only.
- **Mitigation:** Define the gate's *pass condition* without the LLM (regex fallback is the v1 acceptable degradation). Make the LLM-dependent gates Phase-5-only.

### R5 — `relocation.service` ↔ `relocation-journey.service` circular dep

- **What:** Already a known issue; current fix is `@Optional()` on the journey service. Multiplies risk on every refactor.
- **Probability:** **Med** — the band-aid works, but it's a band-aid.
- **Impact:** **Med-High** — break it during a future refactor and the wiring test catches it, but only after deploy.
- **Mitigation:** Land Q10 (break the cycle). Pattern: extract the shared `UserProfile` operations into a third service that both depend on.

---

## §6 — Ponytail-mode recommendations (smallest process change per biggest gap)

| Biggest gap | Smallest fix |
|---|---|
| Scoring engine correctness unverified | **Wire `scripts/eval/fixtures/ranking-cases.json` into `pnpm test`.** The fixtures already exist (103 profiles, 618 rank assertions). Add one Vitest spec that reads the JSON, runs `scoreLocations` per fixture, asserts the top-5 order. ~80 LOC. Catches the next cost-weight bug at PR time. |
| LLM chat latency | Add `stream: true` to `llm/client.ts`. ~50 LOC server + ~100 LOC hook. Use the existing tool-attribution shape, just emit tokens incrementally. |
| Phase 5 over-build risk | Edit PLAN.md: replace Phase 5's 9-item table with one line — *"Geo stack expands when: (a) map perf complaint filed, (b) spatial-join ask in any contract, (c) offline-mobile ask. Default: defer."* One doc edit, prevents weeks of speculative work. |
| Operator-key blocking | Move the LLM e2e gates from §6 (required) to §10 (Phase 5, optional). Regex fallback is acceptable v1. |
| Relocation scoring tests only 4 | Same as scoring correctness — the fixtures are the tests, they're just not wired in. |

**If only one thing ships:** **R1's mitigation** — wire the 103 ranking fixtures into `pnpm test`. That single PR closes the highest-impact risk, costs <2 days, and the test runner does the rest forever.

---

## §7 — Cross-cuts (the things that don't fit one bucket)

- **The score formula and the Q1 elicitation are not connected by a documented mapping.** `ELICITATION_QUESTIONS` in `relocation.service.ts:474-553` defines 3 questions; the answers map to weights somewhere in `recordElicitationResponse`. Without that mapping documented + tested, the cold-start UX is a black box. Add to Q4 test scope.
- **The 939-CBSA dataset is a 100% null-free artifact frozen at build time.** `locations.loader.ts` loads it once at module-load; any ETL update requires a server restart. This is fine for v1; it's a constraint, not a bug. Document it.
- **CURRENT-WORK.md is the actual live plan; PLAN.md is the historical plan.** Anyone reading PLAN.md today sees a roadmap that is 4 phases behind reality. Either update PLAN.md to reflect "Phases 1–3 DONE, Phase 4 in progress, Phase 5 deferred," or remove it. As of 2026-07-01, the doc is misleading.

---

## Appendix A — Domain-specific reference points

- **MCDA:** Scoring engine implements weighted-sum with min-max/z-score normalization (memove-specific). Missing: sensitivity, dominance, inconsistency detection.
- **GIScience:** Geo stack is over-mapped (9 components); actually needed (v1) is PMTiles + Tippecanoe + Turf. Survey: `reports/geo-platforms-survey-2026.md`.
- **Agentic AI:** Tool surface is well-designed (165 tools, scope-gated, add-on gated). Streaming + cancellation are the gaps. Reference: `research/netflix.com` (UNVERIFIED at URL level per RESEARCH.md §1).
- **Urban economics data:** ACS, FEMA NRI, FCC, OSM, BEA RPP, Open-Meteo all wired. Missing: EPA AQS, ACS diversity, TIGER/Line, BLS OEUM, CMS Hospital Compare (vs CAHPS).
- **Product strategy:** No RICE/WSJF/Kano applied anywhere. The fixture-based eval runner is the closest thing to a Kano/quality gate — promote it.

## Appendix B — Files reviewed

| Doc | Path | LOC |
|---|---|---|
| PLAN.md | memove/PLAN.md | 120 |
| CONTRACT.md | memove/docs/planning/CONTRACT.md | 415 |
| RESEARCH.md | memove/docs/planning/RESEARCH.md | 312 |
| INVENTORY.md | memove/docs/planning/INVENTORY.md | 83 |
| feature-map.md | memove/docs/planning/feature-map.md | 125 |
| START_HERE.md | memove/docs/planning/START_HERE.md | 129 |
| CURRENT-WORK.md | /home/mongo/projects/us-relocation-2026/CURRENT-WORK.md | 76 |
| BRIEF-DATA / -ENGINE / -FRONTEND | memove/docs/planning/ | 18 each |
| AGENTS.md | memove/AGENTS.md | ~300 (truncated) |
| Geo platform survey | reports/geo-platforms-survey-2026.md | 331 |
| relocation.service.ts | memove/apps/api/src/nest/relocation/ | 1481 |
| tool-registry.ts | memove/apps/api/src/mcp/ | 1570 |
| llm/client.ts | memove/apps/api/src/services/llm/ | 111 |
| relocation.ts (MCP) | memove/apps/api/src/mcp/tools/ | 49 |
| ranking-cases.json | memove/scripts/eval/fixtures/ | 618 rank assertions |
| AgentSurface.tsx | memove/apps/web/src/pages/relocation/ | 194 |
| 18 PayloadRenderer views | memove/apps/web/src/pages/relocation/views/ | 1764 total |
| locations.json | memove/data/processed/relocation/ | 969 CBSAs |