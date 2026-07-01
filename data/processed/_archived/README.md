# _archived

Orphaned R&D artifacts from earlier exploration passes. **Not** wired into
the live relocation dataset at `sources/processed/relocation/locations.json`
or any descendant file. Retained as reference material only.

## Contents

- `zhvi_candidate_metros.json` — Zillow ZHVI metro pull (2026-06-18). The
  Phase-1 R&D pass for `median_home_value`.
- `zhvi_50_state_candidates.json` — Zillow ZHVI Phase-2 expansion to all 50
  states + DC (2026-06-19).

## Provenance decision (2026-07-01)

The live `Location.medianHomeValue` field uses **Census ACS** via
`us_census_acs_2022_acs5` (see `sources/processed/relocation/locations.json`
`metricsProvenance.cost.medianHomeValue`). Zillow ZHVI was not adopted after
the provenance audit (D3, 2026-07-01) — the live dataset relies on the
public-domain ACS table and remains unchanged.

These files are archived (not deleted) so the exploration history is
auditable if the data choice is ever revisited.

**Do not** point new code at these files. They are reference only.
