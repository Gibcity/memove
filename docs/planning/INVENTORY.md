# INVENTORY.md — memove tech surface (for the relocation add-on)

**Generated:** 2026-06-25 (Phase 1 of the memove → Relocation Discovery orchestrator)
**Source of truth (regenerate on demand):**

```bash
codegraph status /home/mongo/projects/us-relocation-2026             # this repo's files (anchor docs + ETL + audit notes)
codegraph status /home/mongo/projects/us-relocation-2026/memove        # memove (separate nested git repo)
codegraph query /home/mongo/projects/us-relocation-2026/memove <sym>   # symbol search
codegraph files /home/mongo/projects/us-relocation-2026/memove         # full file tree
```

**Scope rule:** tech only. Prose AI-slop docs (`docs/`, `final-report-v*.md`, `kepler-feasibility.md`, etc.) are deliberately ignored. They still exist on disk; this file is for engineers and subagents who need to know what code exists, where, and what it does.

**Why two codegraphs:** memove is a self-contained git repo nested at `/memove/` with its own `.git/`. The parent repo's `git ls-files` does not see into it; codegraph uses `git ls-files` for the file list. Each codegraph DB is a real artifact — `memove/.codegraph/codegraph.db` indexes 1,914 source files / 15,428 nodes / 33,527 edges in 10.2s. See Appendix B for the bug shape.

---

## §0 — Workspace map

| Path | Role | Notes |
|---|---|---|
| `memove/` | Build target — self-hosted travel planner being repurposed | Owns its own git repo + `.codegraph/` |
| ~~`dashboard/` (RETIRED 2026-06-26)~~ | ~~Phase 0 Next.js 15 prototype, 59 metros, Memphis-vs-Denver verdict~~ | ~~Prototype, not a build target. The relocation add-on ships into memove's client instead. See `docs/dashboard-retired-20260626.md`.~~ |
| `memove/MCP.md` (47KB) | Spec for memove's built-in MCP server | The seam we'll extend |
| `memove/server/src/mcp/` | memove's MCP server implementation (Express + `@modelcontextprotocol/sdk`) | Tools + resources + OAuth + scopes |
| `memove/shared/src/types/relocation.ts` (NEW 2026-06-26, T1.1 DONE) | Relocation domain schemas: `Location`, `CostSummary`, `ClimateData`, `CrimeData`, `HealthcareData`, `BroadbandData`, `FiscalProfile`, `BlendedScore`, `UserProfile`, `HardFilter`, `ImplicitSignal`, etc. (zod-schema-first per existing `@memove/shared` pattern; 234 lines; Zod 4 verified). | Engine consumes + computes `blended`; Frontend consumes. Single source of truth — the one file both subagents import from. |
| `memove/client/src/components/MapboxGl` + `MapboxGl` map (already wired) | memove's map component (replacement for the retired `dashboard/src/components/USMap.tsx`) | Frontend uses memove's component, not the retired prototype's |
| `sources/scripts/*.py` | Python ETL for the metros dataset | Data subagent may extend or bypass |
| `kepler-reference/` (unvendored commit `14be656`) | Earlier reference material, on disk only | Not authoritative |

---

## §10 — Verification deltas (genuinely new info from Phase 1)

The prompt's "Known base" section made several claims. Here's what Phase 1 confirmed and corrected:

| Prompt claim | Verified | Note |
|---|---|---|
| Node.js 22 + Express + SQLite (`better-sqlite3`) backend | ⚠️ | Server is **Express + NestJS modular monolith**, not bare Express. `AppModule` wires ~30 feature modules via NestJS DI; Express is the thin top-level routes + MCP endpoint. Phase 4 adds a new NestJS module, not Express routes. |
| React 19.2 + Vite + Tailwind frontend | ✅ | Client lives at `memove/client/`. Verified: 19 page components, full auth + OIDC + Mapbox + Leaflet. Strict page+hook+model pattern documented at `memove/client/src/pages/PATTERN.md`. |
| PWA via Workbox service worker | ⚠️ | Claimed but not file-verified. UNVERIFIED. |
| WebSocket real-time sync | ✅ | `server/src/websocket.ts` exports `setupWebSocket`, `broadcast`, `broadcastToUser`, `getOnlineUserIds`. |
| OIDC SSO | ✅ | `oidc/` module, `/.well-known/openid-configuration`. |
| Docker single container, port 3000 | ⚠️ | `Dockerfile` exists; port mapping not opened in this pass. |
| **MCP server** — OAuth 2.1, 150+ tools, 30 read-only `memove://` resources, 27 scopes | ✅ | **165 tools** (across 17 files in `server/src/mcp/tools/`), **30 `memove://` resources** (in `server/src/mcp/resources.ts`), scope pattern (read/write per group + addon gating) confirmed; exact 27-count not re-verified. |
| Pre-built prompts | ✅ | `server/src/mcp/tools/prompts.ts` (and `server/src/mcp/tools/_shared.ts`). |
| **Domain model: trips → days → places; reservations, budget, packing, journeys, documents, categories** | ✅ | Confirmed against `server/src/types.ts` interfaces. |
| Place search via Google Places or OpenStreetMap; weather via Open-Meteo | ⚠️ | `mapsService` and `weatherService` confirmed exist; specific provider usage not opened. |

**Other Phase 1 findings the prompt did not anticipate:**

- **Add-on gating pattern:** Budget, Packing, Collab, Atlas, Journey, Vacay are conditionally registered via `isAddonEnabled(ADDON_IDS.X)`. The Phase 4 Engine subagent will add a new `relocation` add-on following this pattern — don't reach for a parallel architecture.
- **Base instructions pattern:** `BASE_MCP_INSTRUCTIONS` in `server/src/mcp/index.ts` injects system-level context (data model + workflows + access rules) into every MCP session. The relocation add-on should follow this same pattern to inject relocation-domain context (candidates, scoring criteria) into its sessions.
- **Phase 4 ships into memove, not a new app.** The relocation add-on is a new entry in memove's `ADDON_IDS` + `useAddonStore` pattern. The scoring engine runs server-side in `memove/server/src/services/scoringService.ts`; the elicitation loop in `relocationReasoningService.ts`; the per-user embedding in Qdrant collection `relocation-user-${userId}`. Phase 4 subagents write into memove's nested repo (`memove/`), not this repo's tracked surface. The relocation scoring formula and component shapes have been proven in the Phase 0 prototype (`docs/superpowers/specs/2026-06-26-intel-platform-max-capability-design.md` §1a, §2.1) — extend the proven design into memove's existing infrastructure, don't rebuild.
- **`Place` ≠ `Location`:** `Place` is a travel POI (lat/lng, name, address, source IDs). The relocation domain needs a new entity with relocation metrics (cost, fiscal tier, climate, crime, broadband, healthcare, walkability, schools, taxes, jobs). Phase 3 contract will define `Location`/`Candidate` as a distinct type.
- **OAuth 2.1 already covers relocation:** new scopes (`relocation:read`, `relocation:write`) just need to be added to `scopes.ts`. No new auth flow.

---

## Appendix A — Codegraph reference

```bash
# Parent repo (anchor docs + Python ETL, 76 files)
codegraph status /home/mongo/projects/us-relocation-2026
sqlite3 /home/mongo/projects/us-relocation-2026/.codegraph/codegraph.db "SELECT path, language FROM files;"

# memove (separate nested git repo, 1,914 files / 15,428 nodes / 33,527 edges)
codegraph status /home/mongo/projects/us-relocation-2026/memove
sqlite3 /home/mongo/projects/us-relocation-2026/memove/.codegraph/codegraph.db "SELECT path, language FROM files;"
codegraph query /home/mongo/projects/us-relocation-2026/memove "Place"
codegraph files /home/mongo/projects/us-relocation-2026/memove
```

## Appendix B — Inventory methodology

This inventory was produced by:

1. Confirming `memove/` is cloned as a self-contained git repo (2,166 files tracked).
2. Initializing a **separate codegraph** at `memove/.codegraph/` because the parent codegraph uses `git ls-files` from `index.js:230` (`scanDirectoryAsync → getGitVisibleFiles`), which does not see into nested `.git/` directories. Indexing `memove/` from the parent produces only 1 file (the `index.ts`); a separate `codegraph init` against the nested repo populates the full surface in 10.2s. **The nested-repo workaround is the key Phase 1 finding** — without it, codegraph is useless for any repo whose primary build target lives inside a nested clone.
3. Cross-referencing codegraph counts against `grep` of `server/src/mcp/tools/*.ts` (165 tool registrations across 17 files) and `server/src/mcp/resources.ts` (30 `memove://` resource registrations).
4. Spot-checking the data pipeline outputs (`sources/processed/metros.json` + the 30 other per-metric JSON files) to identify what the relocation schema needs to consume.

**Phase 2 (`RESEARCH.md`) and Phase 3 (`CONTRACT.md` + briefs) should proceed against this inventory.** Per-table specifics (NestJS module list, tool/resource names, interface inventory) regenerate from `codegraph query` and `codegraph files` on demand — don't transcribe them, they go stale on the next commit.