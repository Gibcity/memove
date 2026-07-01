# BRIEF-DATA.md — Phase 4 Data subagent

**Read first:** `CONTRACT.md` (the seam), `INVENTORY.md` (what we have), `RESEARCH.md` (what we know).

## Scope (10 lines)

Ingest US relocation data, convert to `Location[]` per `CONTRACT.md §1a`. Ship `sources/processed/relocation/locations.json`. Extend the existing `sources/scripts/*.py` ETL pipeline (don't modify working scripts; add new ones alongside). Reuse the 9 already-ETL'd sources from `RESEARCH.md §4`. Audit + replace the unverified `zhvi_*.json` data (Zillow API is dead — pick Census ACS `B25077` as the default replacement). Add the metrics `CONTRACT.md §1` schemas enumerate (cost, climate, crime, healthcare, broadband, education, fiscal, amenities, county boundaries, metro centroids, walkability, childcare) if time permits.

## Executor

OpenCode subagent. Skills: `clone-website`, `subagent-driven-development`, `TDD`. Workdir: `/home/mongo/projects/us-relocation-2026`.

## Acceptance criteria

See `CONTRACT.md §6 (Data subagent gates)`. Specifically: JSON-validates against `shared/src/types/relocation.ts`, every metric has a `metricsProvenance` entry, every script has a smoke-test URL fetch, `npm run verify` still passes, deliverable lists ZHVI audit result + replacement.

## Deliverable

`/tmp/data-subagent-deliverable.md` — ZHVI audit, metrics shipped (✅/⚠️/❌), new scripts + URLs, open questions, path to `locations.json`.