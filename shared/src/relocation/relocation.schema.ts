import { z } from 'zod';

/**
 * Relocation domain contract — single source of truth for the relocation
 * add-on. Schemas defined here are consumed by:
 *   - memove/server/src/ (NestJS relocation module: validation + DTO types)
 *   - memove/client/src/ (typed requests/responses for relocation pages)
 *   - sources/processed/relocation/locations.json (Python ETL validates against
 *     the inferred TS types via JSON Schema export)
 *
 * Companion to CONTRACT.md §1a, §1b, §2b. Per Phase 4 plan T1.1 (Day 1
 * skeleton; BLOCKS Data + Frontend subagents).
 *
 * Layout follows the existing @memove/shared pattern: one folder per domain,
 * schema-first, then inferred types via z.infer.
 */

// --- §1a Location (a US metro scored on relocation metrics) -----------------

export const provenanceRefSchema = z.object({
  source: z.string(), // 'us_census_acs_2022_acs5'
  pulledAt: z.string(), // ISO date
  license: z.string(), // 'public_domain' | 'CC-BY-4.0' | 'paid:bridge_interactive'
  url: z.string(),
});
export type ProvenanceRef = z.infer<typeof provenanceRefSchema>;

export const costSummarySchema = z.object({
  costOfLivingIndex: z.number(), // 0-200, US average = 100
  medianHomeValue: z.number(), // USD (Census ACS B25077_001E)
  medianRent: z.number(), // USD/month
  stateIncomeTaxRate: z.number(), // 0-1, marginal top rate
  propertyTaxRate: z.number(), // 0-1, effective annual rate
});
export type CostSummary = z.infer<typeof costSummarySchema>;

export const climateDataSchema = z.object({
  daysMaxGt90FAnnual: z.number(), // NOAA normals
  daysMinLt32FAnnual: z.number(),
  sunshineHoursAnnual: z.number(), // Open-Meteo / NOAA
  annualPrecipitationInches: z.number(),
  tornadoRiskScore: z.number(), // FEMA NRI 0-100
  hurricaneRiskScore: z.number(),
  floodRiskScore: z.number(),
  earthquakeRiskScore: z.number(),
  wildfireRiskScore: z.number(),
});
export type ClimateData = z.infer<typeof climateDataSchema>;

export const crimeDataSchema = z.object({
  violentCrimeRatePer100k: z.number(), // FBI UCR / city open data
  propertyCrimeRatePer100k: z.number(),
  yearOverYearTrend: z.number(), // -1 to 1
});
export type CrimeData = z.infer<typeof crimeDataSchema>;

export const healthcareDataSchema = z.object({
  healthcareAccessScore: z.number(), // 0-100, composite
  hospitalCountWithin10mi: z.number(),
});
export type HealthcareData = z.infer<typeof healthcareDataSchema>;

export const broadbandDataSchema = z.object({
  pctHouseholdsWith100MbpsPlus: z.number(), // FCC National Broadband Map
  medianDownloadMbps: z.number(),
});
export type BroadbandData = z.infer<typeof broadbandDataSchema>;

export const educationDataSchema = z.object({
  publicSchoolRatingAvg: z.number().optional(), // 1-10, optional in v1
  studentTeacherRatio: z.number().optional(),
});
export type EducationData = z.infer<typeof educationDataSchema>;

export const fiscalTierSchema = z.enum(['Resilient', 'Fragile', 'Distressed', 'Unknown']);
export type FiscalTier = z.infer<typeof fiscalTierSchema>;

export const fiscalProfileSchema = z.object({
  statePensionFundedRatio: z.number(), // 0-1, Equable
  fiscalTier: fiscalTierSchema,
  taxCompetitivenessScore: z.number(), // 0-100
});
export type FiscalProfile = z.infer<typeof fiscalProfileSchema>;

export const amenityProfileSchema = z.object({
  groceryStoreDensityPerCapita: z.number(),
  bigBoxStoreCount: z.number(), // Costco + Target + Walmart
  recreationAreaCount: z.number(),
  natureAreaCount: z.number(),
});
export type AmenityProfile = z.infer<typeof amenityProfileSchema>;

export const blendedScoreSchema = z.object({
  costScore0to50: z.number(),
  lifeScore0to50: z.number(),
  totalScore0to100: z.number(),
});
export type BlendedScore = z.infer<typeof blendedScoreSchema>;

// ── Extended data schemas (present in locations.json, used by community tools) ──

export const transportationDataSchema = z.object({
  avgCommuteMinutes: z.number(),
  pctTransitCommute: z.number(),
  pctRemoteWork: z.number(),
  longCommutePct: z.number(),
});
export type TransportationData = z.infer<typeof transportationDataSchema>;

export const mobilityDataSchema = z.object({
  upwardMobilityScore: z.number(),
  mobilityPercentile: z.number(),
});
export type MobilityData = z.infer<typeof mobilityDataSchema>;

export const healthOutcomesDataSchema = z.object({
  lifeExpectancy: z.number(),
  adultObesityPct: z.number(),
  adultSmokingPct: z.number(),
  poorMentalHealthDays: z.number(),
  primaryCarePhysiciansPer100k: z.number(),
});
export type HealthOutcomesData = z.infer<typeof healthOutcomesDataSchema>;

// EPA National Walkability Index, aggregated to CBSA. Score is a
// population-weighted mean of block-group NatWalkInd (1-20 scale).
// Source: https://www.epa.gov/smartgrowth/national-walkability-index-user-guide-and-methodology
export const walkabilityDataSchema = z.object({
  walkabilityScore: z.number(), // 1-20, pop-weighted mean
  walkabilityUnweighted: z.number(), // 1-20, simple mean
  blockGroupCount: z.number(),
  totPop: z.number(),
});
export type WalkabilityData = z.infer<typeof walkabilityDataSchema>;

export const locationSchema = z.object({
  // Identity
  id: z.string(), // 'dallas-tx'
  name: z.string(), // 'Dallas, TX'
  state: z.string(), // 'TX'
  lat: z.number(), // centroid lat (US Census Gazetteer)
  lng: z.number(), // centroid lng
  population: z.number(), // Census ACS total population

  // Relocation metrics
  cost: costSummarySchema,
  climate: climateDataSchema,
  crime: crimeDataSchema,
  healthcare: healthcareDataSchema,
  broadband: broadbandDataSchema,
  education: educationDataSchema.optional(),
  fiscal: fiscalProfileSchema,
  amenities: amenityProfileSchema,

  // Extended metrics (present in locations.json, added 2026-06-29)
  transportation: transportationDataSchema.optional(),
  mobility: mobilityDataSchema.optional(),
  healthOutcomes: healthOutcomesDataSchema.optional(),
  walkability: walkabilityDataSchema.optional(),

  // Composite scores
  blended: blendedScoreSchema,
  fiscalTier: fiscalTierSchema,

  // Provenance
  metricsProvenance: z.record(z.string(), provenanceRefSchema),
});
export type Location = z.infer<typeof locationSchema>;

// --- §1b UserProfile (per-user preferences, the elicitation target) ---------

export const statedPrioritySchema = z.object({
  metric: z.string(), // 'cost' | 'climate' | 'crime' | ...
  rank: z.number(), // 1 = most important
  weight: z.number().optional(), // 0-1, optional explicit weight
});
export type StatedPriority = z.infer<typeof statedPrioritySchema>;

export const hardFilterSchema = z.object({
  field: z.string(), // 'climate.daysMaxGt90FAnnual' | 'cost.medianHomeValue'
  operator: z.enum(['lt', 'lte', 'gt', 'gte', 'eq', 'in', 'notIn']),
  value: z.union([z.number(), z.string(), z.array(z.string())]),
  source: z.enum(['stated', 'revealed']),
  confidence: z.number(), // 0-1
  discoveredAt: z.string(),
});
export type HardFilter = z.infer<typeof hardFilterSchema>;

// Mover context (for checklist personalization + default configuration)
export const moveContextSchema = z.object({
  isFirstMove: z.boolean().optional(),
  demographic: z
    .enum(['young_professional', 'family_with_kids', 'retiree', 'remote_worker', 'low_income_mover', 'student'])
    .optional(),
  moveDate: z.string().optional(), // ISO date of planned move
  destinationState: z.string().optional(), // 2-letter USPS code e.g. 'TX'
  originState: z.string().optional(), // 2-letter USPS code
  hasPets: z.boolean().optional(),
  householdSize: z.number().optional(),
  timelineUrgency: z.enum(['exploring', 'planning', 'urgent']).optional(),
});
export type MoveContext = z.infer<typeof moveContextSchema>;

export const userProfileSchema = z.object({
  userId: z.string(), // memove's User.id (per server/src/types.ts)

  // Stated (weak prior)
  statedPriorities: z.array(statedPrioritySchema),

  // Revealed (strong signal)
  revealedEmbeddingRef: z.string(), // Qdrant point ID

  // Derived
  hardFilters: z.array(hardFilterSchema),
  softWeights: z.record(z.string(), z.number()), // metric → weight, sums to 1.0
  nonNegotiablesDiscovered: z.array(z.string()),

  // Mover context (for checklist personalization)
  moveContext: moveContextSchema.optional(),

  // Lifecycle
  createdAt: z.string(),
  updatedAt: z.string(),
  elicitationRoundsCompleted: z.number(),
  implicitSignalCount: z.number(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

// --- §2b ImplicitSignal (cross-cutting wire format) --------------------------

export const implicitSignalSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('map_pan'),
    center: z.object({ lat: z.number(), lng: z.number() }),
    zoom: z.number(),
    ts: z.string(),
  }),
  z.object({ kind: z.literal('candidate_view'), locationId: z.string(), dwellMs: z.number(), ts: z.string() }),
  z.object({
    kind: z.literal('candidate_dismiss'),
    locationId: z.string(),
    dwellMs: z.number(),
    reason: z.string().optional(),
    ts: z.string(),
  }),
  z.object({ kind: z.literal('candidate_save'), locationId: z.string(), ts: z.string() }),
  z.object({ kind: z.literal('candidate_compare'), locationIds: z.array(z.string()), ts: z.string() }),
  z.object({ kind: z.literal('search_query'), query: z.string(), ts: z.string() }),
  z.object({ kind: z.literal('filter_apply'), filter: z.record(z.string(), z.unknown()), ts: z.string() }),
]);
export type ImplicitSignal = z.infer<typeof implicitSignalSchema>;

// --- Scoring request / response shapes (companion to §2a) ------------------

export const scoreRangeSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
});

// dot-path → [min, max] numeric ranges. Keys match FilterSlider.field
// (e.g. 'cost.costOfLivingIndex'). Used by the candidate-discovery sidebar
// to narrow the scored set server-side before ranking.
export const scoreRequestSchema = z.object({
  topK: z.number().int().positive().optional(),
  filters: z.record(z.string(), scoreRangeSchema).optional(),
});
export type ScoreRequest = z.infer<typeof scoreRequestSchema>;
export type ScoreRange = z.infer<typeof scoreRangeSchema>;

// ponytail: matches the actual server response from relocation.service.scoreLocations.
// Top-level wraps the ranked `topMatches` (slim per-location summary), not full
// Location objects — FE joins against `listLocations` for full data.
export const topMatchSchema = z.object({
  rank: z.number().int().positive(),
  id: z.string(),
  name: z.string(),
  state: z.string(),
  matchScore: z.number(),
  subscores: z.record(z.string(), z.number()),
  trace: z.array(z.string()),
  dataGaps: z.array(z.string()),
  keyMetrics: z.record(z.string(), z.number()),
});
export type TopMatch = z.infer<typeof topMatchSchema>;
export type ScoredLocation = TopMatch; // ponytail: legacy alias, do not use

export const scoreResponseSchema = z.object({
  totalScored: z.number(),
  passedFilters: z.number(),
  returned: z.number(),
  weights: z.record(z.string(), z.number()),
  topMatches: z.array(topMatchSchema),
});
export type ScoreResponse = z.infer<typeof scoreResponseSchema>;

// --- Viewport stats (map aggregation over in-view metros) ------------------

// ponytail: US-only corpus never crosses the antimeridian, so a plain
// west <= lng <= east covers every real viewport. Add wrap handling only if
// the corpus ever goes global.
export const viewportBoundsSchema = z.object({
  north: z.number().min(-90).max(90),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  west: z.number().min(-180).max(180),
});
export type ViewportBounds = z.infer<typeof viewportBoundsSchema>;

// `averages` is metric → mean over the in-view metros (keys match the
// service's FIELD_PATHS, e.g. 'medianHomeValue'). Metrics with no data in
// view are omitted rather than reported as 0.
export const viewportStatsResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  bounds: viewportBoundsSchema,
  averages: z.record(z.string(), z.number()),
});
export type ViewportStatsResponse = z.infer<typeof viewportStatsResponseSchema>;

// --- Elicitation shapes (companion to §1d elicitation tools) -----------------

export const elicitationQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  options: z
    .array(
      z.object({
        value: z.string(),
        label: z.string(),
      }),
    )
    .optional(),
  skippable: z.boolean().default(true),
});
export type ElicitationQuestion = z.infer<typeof elicitationQuestionSchema>;

export const elicitationSessionSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  currentQuestion: elicitationQuestionSchema.nullable(),
  roundsCompleted: z.number(),
  status: z.enum(['active', 'complete', 'abandoned']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ElicitationSession = z.infer<typeof elicitationSessionSchema>;
