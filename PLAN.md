# memove — Execution Plan

**Created:** 2026-07-01 · **Status:** active
**Principle:** shortest path to done. Each item has a verify command.

---

## Phase 0: DONE ✅

- [x] `trek/` → `memove/` folder rename
- [x] Trek brand purge (commit `bd741beb`) — migration lookup keys intentionally kept
- [x] AGENTS.md + CLAUDE.md + drift-check CI job (`bd741beb`)
- [x] Code quality audit (7/10, report inline in session)
- [x] Geo platform survey (`reports/geo-platforms-survey-2026.md`)
- [x] Map library comparison (`reports/map-library-comparison-2026.md`)
- [x] Monorepo structure research (`memove/MONOREPO-STRUCTURE-RECOMMENDATION.md`)

---

## Phase 1: MapLibre Migration (~1 dev-day)

**Decision:** MapLibre GL JS + `@vis.gl/react-maplibre`. Drop mapbox-gl + leaflet.
**Why:** BSD-3 license, no token, no telemetry, −191KB gzip, API-compatible fork.

- [ ] `pnpm remove mapbox-gl leaflet react-leaflet leaflet.markercluster react-leaflet-cluster`
- [ ] `pnpm add maplibre-gl @vis.gl/react-maplibre`
- [ ] Global rename: `mapboxgl` → `maplibregl`, `.mapboxgl-` → `.maplibregl-`
- [ ] Swap Mapbox-hosted style JSON → Protomaps or MapTiler free style
- [ ] Convert `sync/tilePrefetcher.ts` → MapLibre `addProtocol()` (same IndexedDB pattern)
- [ ] Delete dual-provider toggle in `MapSettingsTab.tsx` + `MapViewAuto.tsx`
- [ ] Review `MapViewGL.tsx` fill-extrusion compatibility
- **Verify:** `pnpm build && pnpm test && pnpm --filter client e2e`

---

## Phase 2: Repo Consolidation (merge parent → memove)

**Decision:** One repo. Parent's useful content moves into memove/, parent gets archived.

- [ ] `cp -r ../sources/ memove/data/` (raw/, normalized/, processed/, scripts/)
- [ ] Update `server/src/nest/relocation/locations.loader.ts` path → `data/processed/relocation/locations.json`
- [ ] Delete symlink `memove/sources`
- [ ] Move planning docs (BRIEF-*.md, CONTRACT.md, INVENTORY.md, RESEARCH.md) → `memove/docs/planning/`
- [ ] Move CURRENT-WORK.md → `memove/CURRENT-WORK.md`
- [ ] Merge `scripts/check-doc-drift.sh` + `scripts/validate_locations.js` → `memove/scripts/`
- [ ] Move `mcp/*.py` → `memove/data/scripts/` (ETL-adjacent Python)
- [ ] Delete: `page samples/`, `dogfood-output/`, `reports/` (fold into docs)
- [ ] Move `reports/*.md` research → `memove/docs/research/`
- [ ] Update AGENTS.md paths
- [ ] Archive parent repo on GitHub
- **Verify:** `node scripts/check-agents-md.mjs && pnpm build`

---

## Phase 3: Workspace Restructure

**Decision:** `client/server/shared` → `apps/web, apps/api, packages/shared`.
**Why:** Scales to N apps/libs. Matches Turborepo convention. Don't adopt Turborepo yet.

- [ ] `mkdir apps packages`
- [ ] `git mv client apps/web && git mv server apps/api && git mv shared packages/shared`
- [ ] Update `pnpm-workspace.yaml`: `packages: apps/*, packages/*`
- [ ] Update root `package.json` `--workspace=` refs
- [ ] Rename `server/src/systemNotices/` → `server/src/nest/system-notices/`
- [ ] Update AGENTS.md + CLAUDE.md paths
- [ ] Move agent scratchpads (REPORT.md, MCP.md, MONOREPO-STRUCTURE-RECOMMENDATION.md) → `docs/internal/`
- **Verify:** `pnpm install && pnpm build && pnpm test && node scripts/check-agents-md.mjs`

---

## Phase 4: Quality Debt (from audit, priority order)

- [ ] **P0:** `React.lazy` + `Suspense` on App.tsx routes + Vite `manualChunks` for maplibre/deck.gl/markdown
- [ ] **P0:** Decompose `DayPlanSidebar.tsx` (2290L) → DayHeader, PlaceRow, TransportRow, NoteRow, useDayDragAndDrop, useRouteLegs
- [ ] **P1:** Turn on `strictNullChecks` in client + server tsconfig (first step toward `strict: true`)
- [ ] **P1:** Tests for `relocation.service.ts` scoring engine (3 → 20+)
- [ ] **P1:** Tests for untested services: reservationService, passkeyService, shareService, inAppNotifications
- [ ] **P2:** Wire `ZodValidationPipe` to 5 highest-traffic legacy controllers
- [ ] **P2:** `useShallow` on Zustand multi-value selectors
- [ ] **P2:** Replace 49 `console.log` in server prod with structured logger
- [ ] **P2:** Add `htmlFor`/`id` to form labels
- [ ] **P3:** Break `relocation.service` ↔ `relocation-journey.service` circular dep
- [ ] **P3:** Move `relocationCache.ts` + `llm/client.ts` into `nest/relocation/`

---

## Phase 5: Geo Stack Build-Out (when product needs it)

**Decision:** Open-source only. memove's MCP server is the agentic surface.

| Component | Pick | Add when |
|---|---|---|
| Renderer | MapLibre GL ✅ (Phase 1) | now |
| Basemap | Protomaps PMTiles | Phase 1 (offline) |
| Choropleth overlay | deck.gl | scoring visualization lands |
| Spatial math | Turf.js | client-side buffers needed |
| Spatial DB | PostGIS | "hospitals within 10mi" queries |
| Tile server | Martin | live choropleths needed |
| Tile pre-bake | Tippecanoe | Census tract PMTiles |
| Geocoding | Photon | self-hosted geocode needed |
| Routing | Valhalla (isochrones) + OSRM (trips) | scouting trip planning |
| 3D (later) | CesiumJS + self-hosted terrain | 3D neighborhood context |

**New MCP tools to add (on top of existing 165):**
1. `geo.geocode(query)` → Photon
2. `geo.reverse({lat, lng})` → Photon
3. `geo.isochrone({lat, lng, timeMinutes})` → Valhalla
4. `geo.route({origin, destination, waypoints?})` → OSRM
5. `geo.spatialQuery({layer, center, radiusMeters})` → PostGIS
6. `geo.previewChoropleth({dataset, metric, weights})` → relocation engine

---

## Product Direction

**Flow model:** Guided Journey (lifecycle-based IA)
```
Discover → Explore (trip planner) → Decide → Prepare → Execute (trip planner) → Settle
```
Trip planner = sub-tool within relocation lifecycle, not a sibling product.
