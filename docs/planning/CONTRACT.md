# CONTRACT.md — Phase 3 of memove → Relocation Discovery

**Generated:** 2026-06-25 (rev. 2026-06-26 — target build = memove)
**Builds on:** `INVENTORY.md` (what we have), `RESEARCH.md` (what we know, what we cite)
**Purpose:** the seam all three Phase 4 subagents build against. Per the prompt's operating rules: "Non-overlap is enforced by the contract. Each subagent owns its files/surface and must not edit another's."

**v1 scope (per operator direction 2026-06-25):** US-only. The original 59-metro v1 scope was expanded during data ingest to **939 CBSAs** (see `feature-map.md` §"Data gaps"). All four decisions captured in §0 below.

---

## §0 — Operator decisions (locked + open defaults)

| Decision | Status | Choice | Default if silent | Source |
|---|---|---|---|---|
| v1 geographic scope | Locked | US-only, **939 CBSA relocation dataset** (expanded from original 59-metro v1 scope during data ingest) | — | Operator 2026-06-25 |
| MCP resource namespace | Locked | `memove://relocation/...` (consistent with memove convention) | — | Operator 2026-06-25 |
| Engine ↔ Client boundary | Locked | Engine exposes clean REST + OpenAPI; memove's client consumes (no cross-package imports) | — | Operator 2026-06-25 |
| Per-user memory store | Locked | **Qdrant** (self-hosted, Rust, fast) — new deployment dependency from day 1 | — | Operator 2026-06-25 |
| Embedding model | Open | — | OpenAI `text-embedding-3-small` (1536d, $0.02/1M tokens); alt: local `all-MiniLM-L6-v2` (384d, free) | Engine subagent picks; operator confirms |
| Qdrant deployment topology | Open | — | Single-node Docker Compose alongside memove | Engine subagent proposes; operator confirms |
| Cold-start elicitation | Open | — | 3 lightweight questions + skip-button → embedding from first 5 interactions; alt: 0-question TikTok model | Engine subagent proposes; operator confirms |
| Hard-filter promotion UX | Open | — | Confirmation prompt "We've noticed you keep skipping X — make X a hard filter?"; alt: silent promotion with explanation | Engine subagent proposes; operator confirms |
| ZHVI replacement | **Locked** | **Census ACS `B25077_001E`** (Median Value, owner-occupied) via existing `census_acs_county_property_tax.py`. Public domain, all 939 CBSAs, zero new dependencies. | — | Operator 2026-06-26 |

---

## §1 — Domain schemas (the data subagent builds, the engine consumes, the frontend reads)

### 1a. `Location` (relocation candidate — distinct from memove's `Place`)

A `Location` is a US metro area scored on relocation metrics. Distinct from memove's `Place` (which is a travel POI inside a trip). New type, new NestJS entity, new SQLite table.

```typescript
// shared/src/types/relocation.ts  (NEW file, owned by Data subagent, consumed by all)
export interface Location {
  // Identity
  id: string;                    // 'dallas-tx'
  name: string;                  // 'Dallas, TX'
  state: string;                 // 'TX'
  lat: number;                   // centroid lat (from US Census Gazetteer)
  lng: number;                   // centroid lng

  // Relocation metrics (per-field provenance — see §1c)
  cost: CostSummary;
  climate: ClimateData;
  crime: CrimeData;
  healthcare: HealthcareData;
  broadband: BroadbandData;
  education: EducationData;
  fiscal: FiscalProfile;
  amenities: AmenityProfile;

  // Composite scores (computed from the metrics above — Engine owns the formula)
  blended: BlendedScore;
  fiscalTier: FiscalTier;

  // Provenance
  metricsProvenance: Record<string, ProvenanceRef>;
}

export interface CostSummary {
  costOfLivingIndex: number;       // 0-200, relative to US average=100
  medianHomeValue: number;         // USD, from Zillow ZHVI or Census ACS B25077
  medianRent: number;              // USD/month
  stateIncomeTaxRate: number;      // 0-1, marginal top rate
  propertyTaxRate: number;         // 0-1, effective annual rate
}

export interface ClimateData {
  daysMaxGt90FAnnual: number;      // NOAA normals
  daysMinLt32FAnnual: number;
  sunshineHoursAnnual: number;     // Open-Meteo / NOAA
  annualPrecipitationInches: number;
  tornadoRiskScore: number;        // FEMA NRI (0-100)
  hurricaneRiskScore: number;
  floodRiskScore: number;
  earthquakeRiskScore: number;
  wildfireRiskScore: number;
}

export interface CrimeData {
  violentCrimeRatePer100k: number; // FBI UCR / city open data
  propertyCrimeRatePer100k: number;
  yearOverYearTrend: number;       // -1 to 1
}

export interface HealthcareData {
  healthcareAccessScore: number;   // 0-100, composite (Census ACS uninsured rate + proximity)
  hospitalCountWithin10mi: number;
}

export interface BroadbandData {
  pctHouseholdsWith100MbpsPlus: number; // FCC National Broadband Map
  medianDownloadMbps: number;
}

export interface EducationData {
  // Optional in v1 — see RESEARCH.md §4 "schools UNVERIFIED"
  publicSchoolRatingAvg?: number;  // 1-10, GreatSchools or NCES
  studentTeacherRatio?: number;
}

export interface FiscalProfile {
  // populated from existing state_tax_competitiveness.json + equable_state_classifications.json
  statePensionFundedRatio: number; // 0-1, Equable
  fiscalTier: FiscalTier;
  taxCompetitivenessScore: number; // 0-100
}

export interface AmenityProfile {
  // populated from osm_store_access.json
  groceryStoreDensityPerCapita: number;
  bigBoxStoreCount: number;        // Costco + Target + Walmart
  recreationAreaCount: number;
  natureAreaCount: number;
}

export interface BlendedScore {
  costScore0to50: number;          // the relocation scoring engine's formula (see services/scoringService.ts)
  lifeScore0to50: number;
  totalScore0to100: number;
}

export type FiscalTier = 'Resilient' | 'Fragile' | 'Distressed' | 'Unknown';

// Per-field provenance — every metric knows its source
export interface ProvenanceRef {
  source: string;                 // 'us_census_acs_2022_acs5'
  pulledAt: string;                // ISO date
  license: string;                // 'public_domain' | 'CC-BY-4.0' | 'paid:bridge_interactive'
  url: string;
}
```

**Owned by:** Data subagent (writes `shared/src/types/relocation.ts` + ingestion pipelines).
**Consumed by:** Engine (reads + computes `blended`), Frontend (reads + renders).
**Must NOT touch:** memove's `Place`, `Trip`, `Day` types — those live in `server/src/types.ts`.

### 1b. `UserProfile` (the engine builds, the client reads, the elicitation loop updates)

```typescript
// shared/src/types/relocation.ts  (SAME file as Location — colocate for v1)
export interface UserProfile {
  userId: string;                 // memove's user.id

  // Stated (weak prior) — from one-shot elicitation form
  statedPriorities: StatedPriority[];

  // Revealed (strong signal) — from interaction embedding in Qdrant
  revealedEmbeddingRef: string;   // Qdrant point ID for the user's preference vector

  // Derived (from the elicitation loop)
  hardFilters: HardFilter[];      // non-negotiables that emerged (e.g., "no income-tax states")
  softWeights: Record<string, number>; // metric → weight, sum to 1.0
  nonNegotiablesDiscovered: string[]; // human-readable list for UI ("never >90F days", "always <$500K home")

  // Lifecycle
  createdAt: string;
  updatedAt: string;
  elicitationRoundsCompleted: number;
  implicitSignalCount: number;    // total interactions fed into embedding
}

export interface StatedPriority {
  metric: keyof Location;         // 'cost' | 'climate' | 'crime' | ...
  rank: number;                   // 1 = most important
  weight: number;                 // 0-1, optional explicit weight
}

export interface HardFilter {
  field: keyof Location | string; // 'climate.daysMaxGt90FAnnual' | 'cost.medianHomeValue'
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'in' | 'notIn';
  value: number | string | string[];
  source: 'stated' | 'revealed';  // how it was discovered
  confidence: number;             // 0-1, revealed-confidence should exceed stated
  discoveredAt: string;
}
```

**Owned by:** Engine subagent.
**Consumed by:** Data subagent (never — Data only reads Location), Frontend (reads + renders profile + elicitation UI).
**Persisted in:** Qdrant (per-user embedding) + memove's SQLite (the `UserProfile` JSON blob, keyed by `userId`).

### 1c. `memove://relocation/...` resource catalog (MCP read-only views)

Lives in `server/src/mcp/resources.ts` (extend, don't replace). Pattern matches the existing `memove://trips/{tripId}/places` template style.

| Resource URI | Returns | Scope |
|---|---|---|
| `memove://relocation/locations` | List of all 939 locations, lightweight summary | `relocation:read` |
| `memove://relocation/locations/{locationId}` | Full `Location` for one metro | `relocation:read` |
| `memove://relocation/locations/{locationId}/provenance` | Just the `metricsProvenance` map | `relocation:read` |
| `memove://relocation/profile` | Current user's `UserProfile` | `relocation:read` |
| `memove://relocation/profile/elicitation-state` | Current elicitation round state | `relocation:read` |
| `memove://relocation/scored-list` | Top-K scored candidates for the user | `relocation:read` |
| `memove://relocation/scored-list/decision-trace` | Why each top candidate scored as it did | `relocation:read` |

**Owned by:** Engine subagent.
**Consumed by:** Frontend (calls via MCP client from React).
**Must NOT touch:** Existing `memove://` resources.

### 1d. MCP tool catalog (the engine adds, the frontend calls)

Lives in `server/src/mcp/tools/relocation.ts` (new file, registered in `server/src/mcp/tools.ts` aggregator).

| Tool name | Purpose | Scope |
|---|---|---|
| `start_elicitation_session` | Begin a new elicitation round; returns first question + session state | `relocation:write` |
| `record_elicitation_response` | User answers a question; returns next question or "ready to score" | `relocation:write` |
| `submit_implicit_signal` | Record a behavioral signal (pan, dismiss, save, dwell time) | `relocation:write` |
| `get_user_profile` | Read current `UserProfile` | `relocation:read` |
| `score_candidate_set` | Compute top-K scored candidates given current profile | `relocation:read` |
| `search_candidates_by_criteria` | Hard-filter + soft-rank on the 939-CBSA set | `relocation:read` |
| `explain_score` | Natural-language explanation of why a candidate scored as it did | `relocation:read` |
| `discover_hard_filter` | Promote a revealed signal to a hard filter (with confirmation prompt) | `relocation:write` |

**Owned by:** Engine subagent.
**Consumed by:** Frontend (calls via MCP client from React).
**Must NOT touch:** Existing MCP tools in `server/src/mcp/tools/*.ts`.

### 1e. Scopes (extend `server/src/mcp/scopes.ts`)

```
relocation:read
relocation:write
```

Same OAuth 2.1 flow, same RFC 8707 audience binding, no new auth surface.

---

## §2 — Interface surface (the collision-prevention contract)

### 2a. REST endpoints (Engine exposes, memove's client consumes)

These are the **clean interface** the operator asked for. Engine owns and ships them; memove's client consumes them. **No cross-package imports** between `memove/client/src/` and `memove/server/src/`.

| Method | Path | Request body | Response | Engine owns | Client consumes |
|---|---|---|---|---|---|
| `GET` | `/api/relocation/locations` | — | `Location[]` (lightweight) | Engine | memove's relocation map layer calls this to populate candidate markers |
| `GET` | `/api/relocation/locations/:id` | — | `Location` (full) | Engine | Drill-down |
| `POST` | `/api/relocation/profile/elicitation/start` | — | `{ sessionId, firstQuestion }` | Engine | Elicitation page |
| `POST` | `/api/relocation/profile/elicitation/respond` | `{ sessionId, answer }` | `{ nextQuestion \| done, profileSnapshot }` | Engine | Elicitation page |
| `POST` | `/api/relocation/profile/signal` | `{ signal: ImplicitSignal }` | `{ profileSnapshot }` | Engine | Client sends every pan/dismiss/save as an implicit signal |
| `GET` | `/api/relocation/profile` | — | `UserProfile` | Engine | Profile page |
| `POST` | `/api/relocation/score` | `{ topK?: number }` | `ScoredLocation[]` | Engine | Discovery feed + map results |
| `POST` | `/api/relocation/score/explain` | `{ locationId }` | `{ explanation, trace }` | Engine | Verdict panel |

**Auth:** all endpoints behind existing OAuth 2.1; require `relocation:read` or `relocation:write` scope (per table).

> **Update note (build state):** This table described the v1 seam — **8 endpoints**. The server now exposes **26 endpoints** including the original 8 plus journey, career, concierge, housing, and move-checklist feature surfaces. See `memove/server/src/nest/relocation/relocation.controller.ts` and the `memove/server/src/nest/relocation/*.service.ts` modules for the current endpoint inventory.

**CORS:** Engine emits the existing memove CORS headers; memove's existing client config picks them up.

**Engine MUST publish an OpenAPI spec** at `server/openapi/relocation.yaml` so the memove client TypeScript bindings can be auto-generated.

### 2b. ImplicitSignal shape (the cross-cutting wire format)

Defined by Engine (the producer of the data), consumed by the client (the producer of the events). Single source of truth — Engine's brief owns the schema; the Frontend brief consumes.

```typescript
// shared/src/types/relocation.ts  (Engine owns the file, client consumes)
export type ImplicitSignal =
  | { kind: 'map_pan'; center: { lat: number; lng: number }; zoom: number; ts: string }
  | { kind: 'candidate_view'; locationId: string; dwellMs: number; ts: string }
  | { kind: 'candidate_dismiss'; locationId: string; dwellMs: number; reason?: string; ts: string }
  | { kind: 'candidate_save'; locationId: string; ts: string }
  | { kind: 'candidate_compare'; locationIds: string[]; ts: string }
  | { kind: 'search_query'; query: string; ts: string }
  | { kind: 'filter_apply'; filter: Record<string, unknown>; ts: string };
```

### 2c. Shared types module

**Single file, owned by Engine:** `memove/shared/src/relocation/relocation.schema.ts` (zod schemas + inferred TS types, per the existing `@memove/shared` domain-folder pattern).

Why Engine (not Data) owns the types file: the types encode the elicitation contract (`UserProfile`, `HardFilter`, `ImplicitSignal`), which is the Engine's domain. The `Location` schema lives in the same file for v1; if it grows large, split into `memove/shared/src/relocation/location.schema.ts` later.

**Both Data and Frontend MUST import from this file**, not redefine. Engine owns the schema (zod) + inferred TS types; Data validates ETL output against the exported JSON Schema; Frontend imports the inferred types from `@memove/shared`.

---

## §3 — Glossary (shared terms, isolated subagents stay aligned)

| Term | Definition | Owner |
|---|---|---|
| **Location** | A US metro scored on relocation metrics. Distinct from memove's `Place`. | Data |
| **Candidate** | A `Location` being evaluated for a specific user. Same data, scored per-user. | Engine |
| **Elicitation round** | One question-answer cycle in the elicitation conversation. | Engine |
| **Stated preference** | What the user says they want (one-shot form). Weak prior. | Engine |
| **Revealed preference** | What the user does (interaction embedding in Qdrant). Strong signal. | Engine |
| **Hard filter** | Non-negotiable constraint (e.g., "no income-tax states"). Promoted from revealed signal with confirmation. | Engine |
| **Soft weight** | Relative importance 0-1 of a metric in the scoring formula. | Engine |
| **Implicit signal** | A behavioral event from the UI (pan, dismiss, save, dwell). | Engine (schema) + Client (producer) |
| **Embedding** | A user's preference vector in Qdrant, updated on every implicit signal. | Engine |
| **Decision trace** | The natural-language + structural explanation of why a candidate scored as it did. | Engine |
| **Blend score** | The composite `totalScore0to100` from the relocation scoring formula. | Engine computes and returns via the scoring API. |
| **Add-on** | memove's pattern for conditionally registering features (`isAddonEnabled`). The relocation add-on follows this pattern. | Engine |
| **Scope** | OAuth 2.1 permission string. `relocation:read`, `relocation:write` are the new ones. | Engine |
| **`memove://relocation/...`** | MCP resource URI prefix for the new resources. Consistent with existing `memove://` convention. | Engine |

---

## §4 — Ownership matrix (the file-level contract)

Each row = one file or surface. **Owned by** = the subagent that writes it; **Must NOT touch** = the subagent that must not edit it.

| File / surface | Owned by | Must NOT touch | Notes |
|---|---|---|---|
| `memove/server/src/nest/relocation/*` (new module) | Engine | Data, Frontend | New NestJS module: controller + service + DTO + entity + module |
| `memove/server/src/mcp/tools/relocation.ts` (new file) | Engine | Data, Frontend | Registered in `tools.ts` aggregator (Engine edits the aggregator line, nothing else) |
| `memove/server/src/mcp/resources.ts` | Engine extends (only the relocation resource registrations) | Data, Frontend | Don't reorder or rename existing resources |
| `memove/server/src/mcp/scopes.ts` | Engine extends (only the two new scope strings) | Data, Frontend | |
| `memove/server/src/services/qdrantClient.ts` (new) | Engine | Data, Frontend | Qdrant client wrapper |
| `memove/shared/src/relocation/relocation.schema.ts` (new) | Engine | Data, Frontend | zod schemas + inferred TS types. Both Data and Frontend import from this file — never redefine |
| `memove/server/openapi/relocation.yaml` (new) | Engine | Data, Frontend | Auto-gen consumed by the client's TS bindings |
| `memove/server/package.json` | Engine adds new deps (`@qdrant/js-client-rest`, `@modelcontextprotocol/sdk` — already present) | Data, Frontend | Use exact dep versions; document the rationale per repo rule (memove has no zero-new-deps rule; verify with operator) |
| `memove/server/src/migrations/<ts>-add-relocation-tables.ts` (new) | Engine | Data, Frontend | Adds `user_profile` and `elicitation_session` tables |
| `memove/client/src/pages/relocation/AgentSurface.tsx` (current) | Frontend | Engine, Data | Adaptive chat-driven relocation surface — message thread + sticky input + typed `PayloadRenderer` for `city_list`, `compare_prompt`, `timeline_prompt`, `cost_prompt`, `admin_prompt` cards. **Replaces** the prior `MissionControlShell.tsx` 3-panel layout (purged 2026-07; chat proved a better primary surface). |
| `memove/client/src/pages/relocation/ConciergePanel.tsx` + `PayloadRenderer.tsx` | Frontend | Engine, Data | Concierge + typed-payload rendering used by AgentSurface. |
| `memove/client/src/pages/relocation/views/*` | Frontend | Engine, Data | Per-payload-kind views (`ScoreResultsView`, `CompareResultsView`, `FiscalProfileView`, `LocationSearchView`, `ScoreExplanationView`, `GenericDataView`, `_shared`). |
| `memove/client/src/pages/relocation/useRelocationChat.ts` | Frontend | Engine, Data | Single colocated hook — captures chat thread, calls `/api/relocation/chat` + `/concierge`, dispatches implicit signals. **Replaces** the prior 5-hook surface (`useRelocationCandidates`, `useRelocationElicitation`, `useRelocationMapLayers`, `useRelocationScore` purged with MissionControlShell). |
| `sources/scripts/*_relocation.py` (new) | Data | Engine, Frontend | New ETL scripts for any new sources |
| `sources/processed/relocation/*` (new) | Data | Engine, Frontend | New processed data files |
| `sources/raw/relocation/*` (new) | Data | Engine, Frontend | New raw pulls |
| ~~`dashboard/src/lib/scoring/*`~~ | **RETIRED** (prototype tree purged 2026-06-26) | n/a | The relocation scoring formula lives in `memove/server/src/services/scoringService.ts` (zod-validated input, server-side compute). The dashboard's scoring code is no longer in this repo. |
| ~~`dashboard/src/components/USMap.tsx` etc.~~ | **RETIRED** (prototype tree purged 2026-06-26) | n/a | memove's own `MapboxGl` component is the production surface. Frontend uses memove's component, not the retired prototype's. |
| `sources/processed/metros.json` | READ for Data (legacy 59-metro ETL output; superseded by `sources/processed/relocation/locations.json` covering all 939 CBSAs) | Engine, Frontend | The starting dataset |
| `memove/server/src/types.ts` (existing types) | nobody edits | Engine adds types to `shared/src/types/relocation.ts`, NOT here | Critical boundary |

---

## §5 — Coordination points (when subagents must talk)

Per the prompt's rule that subagents are context-isolated: they don't share a chat. Coordination happens via these explicit handoffs.

| When | What | Who → Who | Artifact |
|---|---|---|---|
| Engine Day 1 | Publishes `shared/src/types/relocation.ts` skeleton | Engine → Data, Frontend | Type-only PR |
| Engine Day 1 | Publishes `memove/server/openapi/relocation.yaml` skeleton | Engine → Frontend | Spec-only PR |
| Data, after Engine ships types | ETL scripts land that produce `Location` JSON matching the types | Data → Engine | Data PR |
| Frontend, after Engine publishes OpenAPI | Auto-gen TS client + first elicitation page | Frontend → Engine | Frontend PR |
| All three done | Integration test: elicitation → profile → scored candidates → map render | All three | REPORT.md |

---

## §6 — Quality gates (each subagent must satisfy before merging)

### Data subagent gates

- Every new ETL script has a smoke test that fetches its URL and confirms 200 + expected shape before processing.
- Every output `sources/processed/relocation/*.json` passes JSON schema validation against `shared/src/types/relocation.ts`.
- The `zhvi_*` provenance audit lands (the open finding from RESEARCH.md §4) — if the data is from a dead source, replace it.

### Engine subagent gates

- `npm run lint` clean (memove has lint configured).
- `npm run test` clean (vitest unit tests; add tests for the new module).
- `npm run test:e2e` (Playwright) covers the new REST endpoints.
- `npm run build` (TypeScript build) clean.
- Per-tool schema validated against `@modelcontextprotocol/sdk` types.
- Qdrant integration tested with a test container; deployment doc updated.

### Frontend subagent gates

- `npm run lint` clean (Next.js eslint).
- `npm run eval` (the 15-fixture regression gate per memove's existing test suite) passes.
- `npm run build` (Next.js static export) clean.
- New elicitation UI is keyboard-navigable; respects existing accessibility patterns.
- No new npm deps (the 5-dep budget stands).

### Cross-cutting gates

- All three subagents' changes pass `npm run verify` at the repo root (tsc + eval + build).
- All three subagents' changes pass `git push` after the integration test in REPORT.md.

---

## §7 — Phase 4 dispatch order (depends on the coordination matrix in §5)

To avoid blocking:

1. **Engine starts first.** Publishes the type skeleton (`shared/src/types/relocation.ts`) + OpenAPI skeleton within the first day. Both Data and Frontend block on this.
2. **Data and Frontend can run in parallel** once Engine has shipped the skeletons.
3. **Integration test** (Phase 5) once all three ship.

Per the operator's earlier direction, **all three Phase 4 subagents run inside OpenCode**, not as Hermes `delegate_task` calls. Each OpenCode invocation embeds `CONTRACT.md` + that agent's brief + the relevant `INVENTORY.md`/`RESEARCH.md` excerpts + the acceptance criteria from §6.

---

## §9 — Anti-patterns (carry-over from INVENTORY + RESEARCH)

- **Don't replace `Place` with `Location`** — different domains.
- **Don't replace the MCP server** — extend it via `tools/relocation.ts`.
- **Don't replace the OAuth flow** — add scopes.
- **Don't cross the Engine ↔ Client boundary** with package imports.
- **Don't trust unverified sources** — every Data subagent URL must be curl-verified.
- **Don't rebuild memove's UI surface** — Frontend reuses memove's existing `MapboxGl`, page patterns, and design tokens via `@memove/shared` and the existing `pages/PATTERN.md`.
- **Don't use SQLite JSONB for embedding storage** — operator chose Qdrant from day 1.

---

## §10 — Phase 5 success criteria

The integration test (Phase 5 / `REPORT.md`) must demonstrate:

1. **End-to-end elicitation:** open the relocation add-on in memove → see the first elicitation question → answer 3 questions → see the first candidate list on the map.
2. **Implicit-signal feedback:** pan the map → dismiss Memphis → confirm hard-filter → see Memphis excluded from subsequent results.
3. **Cold-start performance:** new user opens the platform → 0-question elicitation OR 3-question quick form → first candidate list in <5 minutes wall clock.
4. **Cross-user isolation:** user A's profile + embedding don't affect user B's results.
5. **Per-metric provenance:** every metric on every location shows its source URL + pulled date.
6. **Eval gate green:** `npm run eval` still passes (15/15 ranking fixtures) — relocation is additive, doesn't regress memove's existing tests.

---

This contract is now the seam. Phase 4 dispatch (Data brief, Engine brief, Frontend brief) should reference this file by path and pull the schemas/surface definitions verbatim — no re-derivation in the briefs.