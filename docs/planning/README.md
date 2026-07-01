# us-relocation-2026

**Plan-of-record** for the relocation add-on to [memove](https://github.com/gibcity/memove) (a self-hosted travel planner). The relocation vertical is one of memove's add-ons, registered via `ADDON_IDS.RELOCATION` and gated by `isAddonEnabled`. Build target: `memove/client/` (React 19 + Vite) + `memove/server/` (NestJS + MCP) + `memove/shared/` (zod schemas). This repo holds the data pipeline (`sources/`), the plan-of-record docs, and the cross-cutting audit notes.

## Plan-of-record (read in order)

| # | Doc | Why | Time |
|---|-----|-----|------|
| 1 | `INVENTORY.md` | What we have (memove tech surface) | 5 min |
| 2 | `RESEARCH.md` | What we know (implicit signals, revealed vs stated, TikTok/Netflix/YouTube/Spotify evidence) | 15 min |
| 3 | `CONTRACT.md` | The seam — schemas, REST + OpenAPI, MCP tools, ownership matrix, dispatch order | 30 min |
| 4 | `BRIEF-ENGINE.md` | Engine subagent brief | 5 min |
| 5 | `BRIEF-DATA.md` | Data subagent brief | 5 min |
| 6 | `BRIEF-FRONTEND.md` | Frontend subagent brief | 5 min |

## Live surfaces

| Surface | Role | Path |
|---|---|---|
| memove build target | Self-hosted travel planner being extended with a `relocation` add-on | `memove/` (own `.git/`, untracked from this repo) |
| Plan + briefs | Anchor docs | `*.md` at root + `INVENTORY.md`, `RESEARCH.md`, `CONTRACT.md`, `BRIEF-*.md` |
| Data pipeline | Python ETL → `sources/processed/` → 939-metro relocation candidates → `sources/processed/relocation/locations.json` | `sources/` |

## Phase 4 dispatch order (per `CONTRACT.md §7`)

Engine Day 1 publishes `memove/shared/src/types/relocation.ts` + `memove/server/openapi/relocation.yaml` skeletons. **Done 2026-06-26** (commit `3540ef2`, zod-schema-first, 234 lines, Zod 4 verified in commit `14108a9`). Unblocks Data + Frontend subagents. All three Phase 4 subagents run in OpenCode inside the `memove/` worktree.

Per-user memory: **Qdrant** (locked at `CONTRACT.md §0:18`). Per-user isolation: Qdrant collection `relocation-user-${userId}` (locked at spec §6.3). MCP resource namespace: `memove://relocation/...` (locked).

## Constraints (load-bearing)

- **Build target is `memove/client/`** — Next.js 15 static-export prototype that previously lived at `dashboard/` in this repo was purged 2026-06-26 (commit `afddf94`, audit: `docs/dashboard-retired-20260626.md`). The relocation add-on follows memove's `page+hook+model` pattern at `memove/client/src/pages/relocation/`.
- **No cross-package imports** between `memove/client/src/` and `memove/server/src/`. Engine publishes OpenAPI; client auto-generates its TS client (or imports from `@memove/shared` directly).
- **Per-user memory from day 1** — Qdrant, not SQLite/Postgres mainline.
- **memove has a 5-dep budget for `memove/client`** (next, react, react-dom, us-atlas, topojson-client were the prototype's 5; memove's own `memove/client` has its own deps). The relocation add-on adds no new client deps.

## Quality gates

Verify in memove checkout:

```bash
cd memove/client
npm run typecheck       # TypeScript clean
npm run lint:check      # ESLint clean (memove's existing chain)
npm run test            # vitest + RTL suites
npm run build           # Vite build, static bundle for deployment
```

For Engine: `cd memove/server && npm run lint && npm run test && npm run test:e2e && npm run build`.

For Data: re-run the ETL scripts in `sources/scripts/` to refresh `sources/processed/*.json` against current upstream APIs (Census, NOAA, FEMA NRI, OSM, Open-Meteo).

## What this repo is NOT

- Not a Next.js app. The prototype `dashboard/` Next.js app is gone (purged).
- Not the user-facing product. The user-facing product is memove; this repo is the planning + data-pipeline half.
- Not a deployment target. Deployment is via memove's normal channel (Docker Compose per `memove/docker-compose.yml`).
