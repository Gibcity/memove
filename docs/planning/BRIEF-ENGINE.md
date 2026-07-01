# BRIEF-ENGINE.md — Phase 4 Engine subagent

**Read first:** `CONTRACT.md` (the seam), `INVENTORY.md` (what we have), `RESEARCH.md` (what we know), `memove/MCP.md` (the MCP spec — 47KB, the canonical integration reference).

## Scope (10 lines)

Ship the NestJS `relocation` module, extend the MCP server with `tools/relocation.ts` + 7 `memove://relocation/...` resources + 2 new scopes, run the elicitation + scoring loop on Qdrant, expose a clean REST + OpenAPI interface for the memove client. Implement per `RESEARCH.md §3` (Lilian Weng's plan/act/observe/reflect loop, TikTok-style embedding-on-every-interaction). **Publish `shared/src/types/relocation.ts` and `memove/server/openapi/relocation.yaml` skeletons on Day 1** — they unblock Data and Frontend (see `CONTRACT.md §5`).

## Executor

OpenCode subagent. Skills: `clone-website`, `subagent-driven-development`, `writing-plans`, `TDD`, `systematic-debugging`. Workdir: `/home/mongo/projects/us-relocation-2026/memove`.

## Acceptance criteria

See `CONTRACT.md §6 (Engine subagent gates)`. Specifically: lint/test/e2e/build clean, per-tool schema validates, Qdrant tested with test container, types skeleton first, **no cross-package imports from `memove/client/src/`** (the previous `dashboard/src/` reference is RETIRED).

## Deliverable

`/tmp/engine-subagent-deliverable.md` — type+OpenAPI skeleton PRs, REST endpoints shipped, MCP tools/resources shipped, Qdrant topology, elicitation summary, open questions.