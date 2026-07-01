# BRIEF-FRONTEND.md — Phase 4 Frontend subagent

**Read first:** `CONTRACT.md` (the seam), `INVENTORY.md` (what we have), `RESEARCH.md` (what we know), `memove/client/src/pages/PATTERN.md` (memove's page+hook+model convention), `memove/client/README.md` (if present — memove's own conventions).

## Scope (10 lines)

Build the relocation elicitation conversation, candidate discovery feed, and map. Reuse memove's existing `MapboxGl` map component, page patterns, and design tokens (NOT the retired `dashboard/src/components/USMap.tsx` etc. — those are gone). Auto-gen the TS client from Engine's `memove/server/openapi/relocation.yaml` (or import from `@memove/shared` directly). The five colocated hooks (`useRelocationCandidates`, `useRelocationChat`, `useRelocationElicitation`, `useRelocationMapLayers`, `useRelocationScore`) live alongside the page at `memove/client/src/pages/relocation/` — every pan/dismiss/save flows through them. Wait for Engine's type+OpenAPI skeleton on Day 1 (per `CONTRACT.md §5`).

## Executor

OpenCode subagent. Skills: `clone-website`, `subagent-driven-development`, `writing-plans`, `TDD`, `systematic-debugging`. Workdir: `/home/mongo/projects/us-relocation-2026/memove/client` (inside memove's checkout).

## Acceptance criteria

See `CONTRACT.md §6 (Frontend subagent gates)`. Specifically: lint/eval/build clean (15-fixture eval gate must stay green), keyboard-navigable, **zero new npm deps** (5-dep budget stands), TS client auto-gen'd, no imports from `memove/server/src/`.

## Deliverable

`/tmp/frontend-subagent-deliverable.md` — TS client gen command + output path, pages/components shipped, implicit-signal coverage, a11y check, open questions.