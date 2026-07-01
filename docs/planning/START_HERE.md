# START HERE — us-relocation-2026

**Read this first.** 1-page map. If you have 5 minutes, read §1–§2. If you have 30 minutes, read §1–§4.

---

## 1. What this repo is

**Plan-of-record + data pipeline** for the relocation add-on to memove. The build target is memove's existing client + server + shared packages. This repo is NOT the user-facing product — it carries the cross-cutting plan-of-record docs and the Python ETL that produces the 939-metro relocation dataset (`sources/processed/relocation/locations.json`).

- **`memove/`** — the build target. Self-hosted travel planner (NestJS + React 19 + MCP server + 28 typed shared modules in `@memove/shared`). Phase 4 extends it with a `relocation` add-on following the existing `isAddonEnabled(ADDON_IDS.X)` pattern. Owns its own `.git/`, untracked from this repo's tree.
- **`INVENTORY.md` + `RESEARCH.md` + `CONTRACT.md` + `BRIEF-*.md`** — the anchor docs. Phase 4 subagents build against these.
- **`sources/`** — Python ETL pipeline. Pulls Census ACS, NOAA, FEMA NRI, OSM, Open-Meteo into `sources/processed/*.json`. Phase 4 Data subagent extends this with new ETLs for the missing metrics (broadband, healthcare, crime coverage, ZHVI replacement).
- **`docs/superpowers/`** — gap-analysis spec + implementation plan, written + ponytail-reviewed 2026-06-26.

The user-facing product is **the memove deployment**, with `relocation` registered as an add-on. The relocated-candidate-discovery experience lives at `memove/client/src/pages/relocation/MissionControlShell.tsx` (the 3-panel Mission Control layout), hooked into memove's existing auth + Mapbox + page+hook+model pattern.

---

## 2. The reading order (this sequence)

| # | Doc | Why read it | Time |
|---|-----|-------------|------|
| 1 | `INVENTORY.md` | What we have (memove tech surface) | 5 min |
| 2 | `RESEARCH.md` | What we know (implicit signals, revealed-vs-stated, TikTok/Netflix/YouTube/Spotify evidence) | 15 min |
| 3 | `CONTRACT.md` | The seam — schemas, REST + OpenAPI, MCP tools, ownership matrix, dispatch order | 30 min |
| 4 | `BRIEF-ENGINE.md` | Engine subagent brief | 5 min |
| 5 | `BRIEF-DATA.md` | Data subagent brief | 5 min |
| 6 | `BRIEF-FRONTEND.md` | Frontend subagent brief | 5 min |

That's the ~60-minute tour. The 6 anchor docs are the only things you need before any Phase 4 dispatch decision.

---

## 3. Quality gates (in order, must all be green to push)

**No verification runs from this repo's root.** Run in memove checkout (`cd memove/`) and in `sources/` (Python ETL).

For memove client (UI):

```bash
cd memove/client
npm ci
npm run typecheck       # TypeScript clean
npm run lint:check      # ESLint clean
npm run test            # vitest + RTL suites
npm run build           # Vite build → static bundle
```

For memove server (Engine + MCP):

```bash
cd memove/server
npm run lint            # ESLint clean
npm run test            # vitest unit tests
npm run test:e2e        # Playwright e2e (covers REST endpoints)
npm run build           # TypeScript build
```

For Data pipeline:

```bash
cd sources
python scripts/<script>.py   # each ETL is independently runnable; smoke-test in CI
```

---

## 4. Repo layout cheat-sheet

```
us-relocation-2026/
├── README.md                      ← top-level orientation
├── START_HERE.md                  ← you are here
├── INVENTORY.md                   ← tech surface (memove)
├── RESEARCH.md                    ← implicit-signals research (TikTok + agent loop)
├── CONTRACT.md                    ← the seam (schemas, MCP tools, dispatch order)
├── BRIEF-ENGINE.md                ← Engine subagent brief
├── BRIEF-DATA.md                  ← Data subagent brief
├── BRIEF-FRONTEND.md              ← Frontend subagent brief
├── sources/                       ← Python ETL (data pipeline output)
│   ├── scripts/*.py               ← 14 ETL scripts (Census, NOAA, FEMA, OSM, Open-Meteo, Equable)
│   ├── processed/*.json           ← 31 output JSON files (consumed by memove via sources/processed/relocation/locations.json)
│   └── raw/                       ← raw upstream data (NOAA CSVs, OSM pulls, Equable HTML)
├── docs/                          ← postmortems, audit logs, ops notes
│   ├── dashboard-retired-20260626.md  ← prototype-tree purge record
│   ├── lint-deferred-20260626.md     ← lint script rationale
│   ├── sources-raw-sweep-20260626.md  ← 13-file dead-source sweep
│   └── superpowers/
│       ├── specs/2026-06-26-intel-platform-max-capability-design.md  ← gap analysis
│       └── plans/2026-06-26-intel-platform-max-capability.md          ← implementation plan
└── memove/                          ← Build target (own .git/, untracked)
    ├── server/                    ← NestJS + MCP server
    ├── client/                    ← React 19 + Vite + Mapbox + page+hook+model pattern
    └── shared/                    ← @memove/shared: zod-schema-first single source of truth
                                    (relocation/relocation.schema.ts added 2026-06-26, T1.1)
```

---

## 5. The single most important constraint

**No cross-package imports** between `memove/client/src/` and `memove/server/src/`. Engine publishes OpenAPI; client auto-generates its TS client (or imports from `@memove/shared` directly). The seam is sacred.

If a change requires cross-package coupling, it's wrong for this product. Write it down in `CONTRACT.md §0` with explicit acceptance criteria before building it.

---

## 6. Open decisions (need operator sign-off before Phase 4 ships)

Per `CONTRACT.md §0` and the plan-of-record (`docs/superpowers/plans/...md`):

| Decision | Value | Status |
|---|---|---|
| Embedding model | `EMBEDDING_DIM=1536`; OpenCode Go endpoint model dims (operator-confirm after key drop-in) | Operator-confirm pending |
| Qdrant deployment topology | Single-node Docker `qdrant/qdrant:v1.12.0` on `127.0.0.1:6333` (loopback-only) — running, verified | **DONE 2026-06-27** (`docs/operator-decisions-20260626.md`) |
| Cold-start elicitation | 3 lightweight questions + skip-button → embedding from first 5 interactions | Operator-confirm needed |
| Hard-filter promotion UX | Confirmation prompt "we've noticed you keep skipping X — make X a hard filter?" (threshold: 3+ dismissals sharing metric pattern; eligible signals: `candidate_dismiss`, short-dwell `candidate_view`, `filter_apply`; cooldown 24h; always-requires-confirmation) | **LOCKED 2026-06-27** (`docs/operator-decisions-20260626.md`) |
| ZHVI replacement | Census ACS `B25077_001E` (Median Value, owner-occupied) via existing pipeline | **LOCKED 2026-06-26** (commit `0572943`) |
| Cold-start default `softWeights` | `{cost: 0.35, climate: 0.25, crime: 0.20, amenities: 0.10, broadband: 0.10}` | **LOCKED 2026-06-26** (commit `811530b`, spec §6.2) |
| Qdrant collection naming | `relocation-user-${userId}` (per-user collection, isolation by name) | **LOCKED 2026-06-26** (commit `811530b`, spec §6.3) |
| LLM provider + base URL | OpenCode Go (`opencode`) at `https://api.opencode.ai/v1` via the `openai` npm package | **LOCKED 2026-06-27** (`docs/operator-decisions-20260626.md`) |
| LLM API key string | **Operator supplies.** Placeholder `PASTE_...n` in `memove/server/.env`. Until this lands, T2.11 + T2.12 cannot pass their e2e gates | Operator-action needed |
| Python venv for ETL deps | `/home/mongo/projects/us-relocation-2026/.venv` (PEP 668, system pip blocked). Activate with `source .venv/bin/activate` before running `sources/scripts/*.py` | **DONE 2026-06-27** |
| memove workspace bootstrap | `pnpm install` + `pnpm --filter @memove/shared build` required before any `pnpm --filter @memove/server` or `--filter @memove/client` command. Workspaces declared in `memove/pnpm-workspace.yaml` (pnpm 11 ignores `workspaces` field in package.json) | **DONE 2026-06-27** (`pnpm-workspace.yaml` + workspace:* specifiers) |

Engine subagent proposes defaults for the un-locked decisions; operator confirms.

*Last touched: 2026-06-27 (Phase 4 bootstrap complete: pnpm install, Qdrant container, .env skeleton, venv, decisions doc. Remaining: operator drops OpenCode Go API key into `.env`.)*
