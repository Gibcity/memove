# memove Feature Map

## ~~Critical Blocker~~ RESOLVED

~~The `relocation` addon is missing from `seeds.ts`.~~ **FIXED** — `relocation` is seeded in `server/src/db/seeds.ts:107` with `enabled: 1`. Page is reachable on fresh install.

## Executive Summary Table

| Feature | Addon | Seeded | Frontend Route | Backend Module | Status |
|---|---|---|---|---|---|
| Auth (login, register, MFA, OIDC, OAuth 2.1, passkey, demo) | — | n/a | `/login`, `/register`, `/oauth/consent` | `auth/` | **Full** |
| Dashboard | — | n/a | `/dashboard` | trip aggregations | **Full** |
| Trips CRUD + planner + days + places + reservations + assignments | — | n/a | `/trips/:id` | `trips/`, `days/`, `places/`, `assignments/`, `reservations/` | **Full** |
| Files / media | — | n/a | `/trips/:id/files` | `files/` | **Full** |
| Settings (display/map/notif/account/MCP tokens/OAuth clients) | — | n/a | `/settings` | `settings/` + `auth/` | **Full** |
| In-app notifications page | — | n/a | `/notifications` | `notifications/` | **Full** |
| Maps (Leaflet + Mapbox 3D) | — | n/a | in TripPlanner | `maps/` | **Full** |
| Packing | `packing` | enabled=1 | tab in trip | `packing/` | **Full** |
| Budget | `budget` | enabled=1 | tab in trip | `budget/` | **Full** |
| Documents | `documents` | enabled=1 | tab in trip | (in files/) | **Full** |
| Collab (notes, polls, chat) | `collab` | enabled=1 | tab in trip | `collab/` | **Full** |
| Vacay | `vacay` | enabled=1 | `/vacay` | `vacay/` | **Full** |
| Atlas | `atlas` | enabled=1 | `/atlas` | `atlas/` | **Full** |
| Journey (timeline + public sharing) | `journey` | enabled=1 | `/journey`, `/journey/:id`, `/public/journey/:token` | `journey/` | **Full** |
| MCP (LLM integration) | `mcp` | enabled=0 | `/settings` tab | `mcp/` | **Stub** (route disabled) |
| AirTrail sync | `airtrail` | enabled=0 | reservations tab | `integrations/airtrail.module.ts` | **Stub** (route disabled) |
| **Relocation** (the main app) | `relocation` | **enabled=1** | `/relocation` | `nest/relocation/` | **Wired** |

## Relocation Deep-Dive

### Server surface (17 endpoints in `server/src/nest/relocation/`)

**RelocationController** (555 LOC):
- `GET /api/relocation/locations` — search/filter
- `GET /api/relocation/locations/:id` — full detail
- `GET /api/relocation/stats/viewport` — map-bounds aggregation
- `POST /api/relocation/score` — rank candidates
- `POST /api/relocation/score/explain` — subscores + trace
- `POST /api/relocation/compare` — side-by-side
- `POST /api/relocation/fiscal-health` — state pension/tax
- `GET|POST /api/relocation/profile`
- `POST /api/relocation/profile/elicitation/start` + `/respond` — 3-question preference loop
- `POST /api/relocation/profile/signal` — behavioral learning
- `GET /api/relocation/journey` + `/shortlist`, `/eliminate`, `/preferences`, `/toggle-task`, `/phase`
- `POST /api/relocation/chat` — rule-based agent (no LLM)
- `POST /api/relocation/move-checklist`
- `GET /api/relocation/career/{economic-indicators,licensing,outlook}/:param`
- `POST /api/relocation/concierge` + `GET /concierge/stats`

**Other services:** HousingController (market/listings/affordability), CareerService (50-state license lookup), ConciergeService (regex keyword → canned answers).

**Data pipeline:** 46 Python ETL scripts pulling ACS, FBI UCR, FEMA NRI, NOAA, FCC broadband, BEA RPP, Open-Meteo, EPA NWI, NCES CCD (via Urban Institute mirror), Census S1501/S2001/S2401, Tax Foundation → `sources/processed/relocation/locations.json` (~939 metros, 100% null-free). All services read this JSON at module load.

### Frontend surface (`client/src/pages/relocation/`)

**MissionControlShell** — 3-panel layout: left MoveTimelinePanel, center RelocationMapPanel, right CandidateLibraryPanel.

### Wiring gaps (updated 2026-06-30, end-of-session)

**Status: 13/17 closed. All P0 (5/5), all P2 (3/3) closed. P1: 3/4 closed. P3: 2/2 closed (LLM fallback wired 2026-06-30, `235d08b5`).**

**RESOLVED (were P0):**
1. ~~Relocation addon not seeded~~ **FIXED** — seeded in `seeds.ts:107`, enabled=1
2. ~~Apply Checklist toasts "coming soon"~~ **FIXED** — wired to backend at `MissionControlShell.tsx:225-248`
3. ~~All `/relocation/journey/*` endpoints have zero FE callers~~ **FIXED** — `useRelocationJourney.ts` calls all 6 endpoints
4. ~~Map is a static SVG blob~~ **FIXED** — `RelocationMapPanel.tsx` (596 lines) has full MapboxGL integration with clustering, choropleth, popups
5. ~~`/score/explain` shape mismatch~~ **FIXED** — both sides agree on `string[]`

**RESOLVED (were P1):**
6. ~~Chat rich payloads dropped (city_list, compare_prompt cards never rendered)~~ **FIXED (2026-06-30)** — `useRelocationChat.ts` `normalizeChatResponse` maps `type:'city_list' | 'compare_prompt' | 'timeline_prompt' | 'cost_prompt' | 'admin_prompt'` into `RichCard` variants; `RelocationChat.tsx` `RichCardView` renders each. Regression: `useRelocationChat.test.ts` (3/3 tests passing).
7. ~~Compare cap silently broken~~ **FIXED** — `MAX_COMPARE=2` matches 2-col grid, 3rd selection toasts warning
8. ~~Career endpoints (3) — zero FE callers~~ **FIXED (2026-06-30)** — 5 API methods added (`economicIndicators`, `licensing`, `outlook`, `getMarketData`, `getListings`); `CareerSection` + `HousingMarketSection` lazy-load panels in `CandidateDetailSheet.tsx`
9. ~~Housing market + listings — zero FE callers~~ **FIXED (2026-06-30)** — see #8 above

**RESOLVED (were P2):**
10. ~~Live filter re-score requires Apply click~~ **FIXED** — 300ms debounced re-score on slider change at `useRelocationCandidates.ts:148-160`
11. ~~Saved-set persistence (no Saved tab/badge)~~ **FIXED (2026-06-30)** — Saved tab added to CandidateLibraryPanel
12. ~~Slug → display name for hard-filter prompts~~ **FIXED (2026-06-29)** — `06b13fc0` resolves display names via `getLocationLabel()` in hard-filter prompt builder
13. ~~Score capped at default limit=20~~ **FIXED** — client passes `DEFAULT_TOPK`; server default 20 is intentional fallback for CLI/MCP callers
14. ~~Raw fetch() bypassing apiClient in confirmHardFilter~~ **FIXED (2026-06-29)** — `06b13fc0` routes confirmHardFilter through `apiClient` like sibling callers

**RESOLVED (infrastructure):**
- ~~Relocation profiles in-memory `Map` (dies on restart)~~ **FIXED (2026-06-30)** — `relocation_user_profile` table added to `schema.ts` + `migrations.ts`; `relocation.service.ts` now reads/writes via SQLite JSON blob
- ~~`/journey` 404 on cold open~~ **FIXED (2026-06-30)** — stale baseline DB row was returning a moved `cbsaCode` slug; baseline re-seed now derives from current `locations.json`

**RESOLVED (were P3):**
16. ~~Chat is 555-line regex classifier — no LLM/MCP wired~~ **FIXED (2026-06-30)** — `235d08b5`: regex intents stay as fast path; unmatched queries fall through to LLM; graceful degradation on failure
17. ~~Concierge is 10-category regex lookup~~ **FIXED (2026-06-30)** — `235d08b5`: 10-category lookup stays; general fallback now tries LLM first, degrades to original on failure

**RESOLVED:**
- ~~T3: Relocation-as-trips row (`kind: 'relocation'`)~~ **FIXED (2026-06-30)** — `d7c9d3f0`: `setMoveTimeline()` now calls `bridgeTripFromJourney()` which creates a `kind='relocation'` trip row linking back to the journey; idempotent, wrapped in try/catch so trip creation never breaks the journey write

### Data gaps (updated 2026-06-30, end-of-session)

**Status: 100% null-free across 939 CBSAs / 18,779 cells** (`gap-report.json`: `locations_with_gaps=0`, `total_gaps=0`, `field_fill_rate_pct=100.0`).

**RESOLVED:**
- ~~D1 Schools (NCES)~~ **FIXED (2026-06-30)** — `sources/scripts/pull_education_nces.py` pulls NCES CCD district directory via Urban Institute Education Data Portal mirror; 925/939 CBSAs have enrollment-weighted `studentTeacherRatio` (14 PR/HI micropolitan areas have no district-level CBSA mapping; bridged with null-coalesced ACS proxy)
- ~~D2 EPA National Walkability Index~~ **FIXED (2026-06-30)** — `sources/scripts/build_cbsa_walkability.py` pulls EPA NWI block-group data and aggregates population-weighted `NatWalkInd` per CBSA; 938/939 covered (1 territorial CBSA absent)
- ~~D4 Career (ACS S2001/S2401)~~ **FIXED (2026-06-30)** — `sources/scripts/pull_cbsa_occupation_earnings.py` pulls ACS 5-Year S2001 (earnings) + S2401 (occupation by sex, 5-group rollup); 939/939 covered. Note: BLS OEUM still NOT pulled — we use ACS subject tables instead (free, no key, all CBSAs)
- ~~Fiscal gaps: 37 state-level fields~~ **FIXED (2026-06-30)** — DC + PR added to `state_income_tax_rates.json`, `state_pension_funded_ratio.json`, `state_property_tax.json`, `state_tax_competitiveness.json`; fill rate 99.4%
- ~~Climate: Open-Meteo temperature corrections (24 CBSAs) + PR risk scores (12 CBSAs)~~ **FIXED (2026-06-30)** — `retry_failed_climate_fills.py` + concurrent backfill; FEMA NRI risk scores added for PR CBSAs

**STILL OPEN:**
- D3 ZHVI replacement audit (per `CONTRACT.md §0`) — Census ACS `B25077` candidate; current `median_home_value` is ACS-based already; reconciliation deferred
- D9 land prices, D10 childcare cost, D11 air quality, D15 healthcare quality (CMS CAHPS) — Phase 5 expansion

### Data sources (updated 2026-06-30, end-of-session)

**Fill rate: 100% null-free across 939 CBSAs / 18,779 cells.**

✅ Cost of living, median home/rent, property/income tax
✅ Climate: hot/cold days, sunshine, precip (Open-Meteo, NOAA normals)
✅ Crime: violent/property rates (FBI UCR)
✅ Healthcare: access score, hospital count
✅ Broadband: %100Mbps+, median Mbps (FCC)
✅ Fiscal: state pension funded ratio, tax competitiveness (incl. DC + PR)
✅ Amenities: grocery density, big-box count, rec/nature areas (OSM Overpass)
✅ Licensing boards for all 50 states + DC
✅ Education: ACS S1501 attainment + NCES CCD student-teacher ratio (925/939)
✅ Career: median earnings (all + FT/YR) + 5-group occupation mix per CBSA (Census ACS 5-Year S2001+S2401, 2022 vintage; 939/939 metros covered)
✅ Walkability: EPA National Walkability Index (population-weighted per CBSA; 938/939)
✅ Risk: FEMA NRI natural-hazard scores (incl. PR CBSAs)

**Phase 5 expansion targets:** BLS OEUM (occupation × wage detail), ZHVI replacement audit, land prices, childcare cost, air quality, healthcare quality (CMS CAHPS).
