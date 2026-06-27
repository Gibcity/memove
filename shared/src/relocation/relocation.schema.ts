import { z } from 'zod';

/**
 * Relocation domain contract — single source of truth for the relocation
 * add-on. Schemas defined here are consumed by:
 *   - trek/server/src/ (NestJS relocation module: validation + DTO types)
 *   - trek/client/src/ (typed requests/responses for relocation pages)
 *   - sources/processed/relocation/locations.json (Python ETL validates against
 *     the inferred TS types via JSON Schema export)
 *
 * Companion to CONTRACT.md §1a, §1b, §2b. Per Phase 4 plan T1.1 (Day 1
 * skeleton; BLOCKS Data + Frontend subagents).
 *
 * Layout follows the existing @trek/shared pattern: one folder per domain,
 * schema-first, then inferred types via z.infer.
 */

// --- §1a Location (a US metro scored on relocation metrics) -----------------

export const provenanceRefSchema = z.object({
  source: z.string(),                 // 'us_census_acs_2022_acs5'
  pulledAt: z.string(),                // ISO date
  license: z.string(),                // 'public_domain' | 'CC-BY-4.0' | 'paid:bridge_interactive'
  url: z.string(),
});
export type ProvenanceRef = z.infer<typeof provenanceRefSchema>;

export const costSummarySchema = z.object({
  costOfLivingIndex: z.number(),       // 0-200, US average = 100
  medianHomeValue: z.number(),         // USD (Census ACS B25077_001E)
  medianRent: z.number(),              // USD/month
  stateIncomeTaxRate: z.number(),      // 0-1, marginal top rate
  propertyTaxRate: z.number(),         // 0-1, effective annual rate
});
export type CostSummary = z.infer<typeof costSummarySchema>;

export const climateDataSchema = z.object({
  daysMaxGt90FAnnual: z.number(),      // NOAA normals
  daysMinLt32FAnnual: z.number(),
  sunshineHoursAnnual: z.number(),     // Open-Meteo / NOAA
  annualPrecipitationInches: z.number(),
  tornadoRiskScore: z.number(),        // FEMA NRI 0-100
  hurricaneRiskScore: z.number(),
  floodRiskScore: z.number(),
  earthquakeRiskScore: z.number(),
  wildfireRiskScore: z.number(),
});
export type ClimateData = z.infer<typeof climateDataSchema>;

export const crimeDataSchema = z.object({
  violentCrimeRatePer100k: z.number(), // FBI UCR / city open data
  propertyCrimeRatePer100k: z.number(),
  yearOverYearTrend: z.number(),       // -1 to 1
});
export type CrimeData = z.infer<typeof crimeDataSchema>;

export const healthcareDataSchema = z.object({
  healthcareAccessScore: z.number(),   // 0-100, composite
  hospitalCountWithin10mi: z.number(),
});
export type HealthcareData = z.infer<typeof healthcareDataSchema>;

export const broadbandDataSchema = z.object({
  pctHouseholdsWith100MbpsPlus: z.number(), // FCC National Broadband Map
  medianDownloadMbps: z.number(),
});
export type BroadbandData = z.infer<typeof broadbandDataSchema>;

export const educationDataSchema = z.object({
  publicSchoolRatingAvg: z.number().optional(),  // 1-10, optional in v1
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
  bigBoxStoreCount: z.number(),        // Costco + Target + Walmart
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

export const locationSchema = z.object({
  // Identity
  id: z.string(),                      // 'dallas-tx'
  name: z.string(),                    // 'Dallas, TX'
  state: z.string(),                   // 'TX'
  lat: z.number(),                     // centroid lat (US Census Gazetteer)
  lng: z.number(),                     // centroid lng

  // Relocation metrics
  cost: costSummarySchema,
  climate: climateDataSchema,
  crime: crimeDataSchema,
  healthcare: healthcareDataSchema,
  broadband: broadbandDataSchema,
  education: educationDataSchema.optional(),
  fiscal: fiscalProfileSchema,
  amenities: amenityProfileSchema,

  // Composite scores
  blended: blendedScoreSchema,
  fiscalTier: fiscalTierSchema,

  // Provenance
  metricsProvenance: z.record(z.string(), provenanceRefSchema),
});
export type Location = z.infer<typeof locationSchema>;

// --- §1b UserProfile (per-user preferences, the elicitation target) ---------

export const statedPrioritySchema = z.object({
  metric: z.string(),                  // 'cost' | 'climate' | 'crime' | ...
  rank: z.number(),                    // 1 = most important
  weight: z.number().optional(),       // 0-1, optional explicit weight
});
export type StatedPriority = z.infer<typeof statedPrioritySchema>;

export const hardFilterSchema = z.object({
  field: z.string(),                   // 'climate.daysMaxGt90FAnnual' | 'cost.medianHomeValue'
  operator: z.enum(['lt', 'lte', 'gt', 'gte', 'eq', 'in', 'notIn']),
  value: z.union([z.number(), z.string(), z.array(z.string())]),
  source: z.enum(['stated', 'revealed']),
  confidence: z.number(),              // 0-1
  discoveredAt: z.string(),
});
export type HardFilter = z.infer<typeof hardFilterSchema>;

export const userProfileSchema = z.object({
  userId: z.string(),                  // TREK's User.id (per server/src/types.ts)

  // Stated (weak prior)
  statedPriorities: z.array(statedPrioritySchema),

  // Revealed (strong signal)
  revealedEmbeddingRef: z.string(),    // Qdrant point ID

  // Derived
  hardFilters: z.array(hardFilterSchema),
  softWeights: z.record(z.string(), z.number()),   // metric → weight, sums to 1.0
  nonNegotiablesDiscovered: z.array(z.string()),

  // Lifecycle
  createdAt: z.string(),
  updatedAt: z.string(),
  elicitationRoundsCompleted: z.number(),
  implicitSignalCount: z.number(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

// --- §2b ImplicitSignal (cross-cutting wire format) --------------------------

export const implicitSignalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('map_pan'),
             center: z.object({ lat: z.number(), lng: z.number() }),
             zoom: z.number(),
             ts: z.string() }),
  z.object({ kind: z.literal('candidate_view'),
             locationId: z.string(), dwellMs: z.number(), ts: z.string() }),
  z.object({ kind: z.literal('candidate_dismiss'),
             locationId: z.string(), dwellMs: z.number(),
             reason: z.string().optional(), ts: z.string() }),
  z.object({ kind: z.literal('candidate_save'),
             locationId: z.string(), ts: z.string() }),
  z.object({ kind: z.literal('candidate_compare'),
             locationIds: z.array(z.string()), ts: z.string() }),
  z.object({ kind: z.literal('search_query'),
             query: z.string(), ts: z.string() }),
  z.object({ kind: z.literal('filter_apply'),
             filter: z.record(z.string(), z.unknown()), ts: z.string() }),
]);
export type ImplicitSignal = z.infer<typeof implicitSignalSchema>;

// --- Scoring request / response shapes (companion to §2a) ------------------

export const scoreRequestSchema = z.object({
  topK: z.number().int().positive().optional(),
});
export type ScoreRequest = z.infer<typeof scoreRequestSchema>;

export const scoredLocationSchema = locationSchema.extend({
  rank: z.number().int().positive(),
  matchScore: z.number(),              // 0-100, weighted by softWeights + hardFilters
  decisionTrace: z.string(),          // natural-language explanation
});
export type ScoredLocation = z.infer<typeof scoredLocationSchema>;

export const scoreResponseSchema = z.object({
  candidates: z.array(scoredLocationSchema),
  profileSnapshot: userProfileSchema,
  generatedAt: z.string(),
});
export type ScoreResponse = z.infer<typeof scoreResponseSchema>;

// --- Elicitation shapes (companion to §1d elicitation tools) -----------------

export const elicitationQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  options: z.array(z.object({
    value: z.string(),
    label: z.string(),
  })).optional(),
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
