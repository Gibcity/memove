import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { isAddonEnabled } from '../../services/adminService';
import { ADDON_IDS } from '../../addons';
import { RelocationService } from '../../nest/relocation/relocation.service';
import { TOOL_ANNOTATIONS_READONLY, TOOL_ANNOTATIONS_WRITE, ok } from './_shared';
import { canRead, canWrite } from '../scopes';
import { db } from '../../db/database';

/**
 * MCP tools for the relocation add-on.
 *
 * 5 tools: search_locations, score_locations, compare_locations,
 *          explain_score, fiscal_health
 *
 * Registered per the isAddonEnabled(ADDON_IDS.RELOCATION) gating pattern.
 * Scope-gated: relocation:read for read ops, relocation:write for mutation.
 */

// ponytail: minimal DatabaseService-shaped adapter so the Nest-injected
// RelocationService works without DI in the MCP layer (same pattern as
// relocation_journey.ts).
const dbAdapter = {
  get: <T>(sql: string, ...params: unknown[]): T | undefined =>
    db.prepare(sql).get(...params) as T | undefined,
  run: (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params),
  all: <T>(sql: string, ...params: unknown[]): T[] =>
    db.prepare(sql).all(...params) as T[],
} as never;

const relocationService = new RelocationService(dbAdapter);

export function registerRelocationTools(
  server: McpServer,
  _userId: number,
  scopes: string[] | null,
): void {
  if (!isAddonEnabled(ADDON_IDS.RELOCATION)) return;

  const R = canRead(scopes, 'relocation');
  const W = canWrite(scopes, 'relocation');

  // --- search_locations ---
  if (R) server.registerTool(
    'search_locations',
    {
      description:
        'Search and filter US metro areas (939 CBSAs) by criteria like state, max home value, crime rate, disaster risk, climate. Returns matching locations with key metrics. Use this to narrow down candidates before scoring.',
      inputSchema: {
        states: z
          .array(z.string())
          .optional()
          .describe("State codes to include (e.g., ['TX','FL','TN'])"),
        excludeStates: z
          .array(z.string())
          .optional()
          .describe('State codes to exclude'),
        maxHomeValue: z
          .number()
          .optional()
          .describe('Maximum median home value in USD'),
        maxRent: z
          .number()
          .optional()
          .describe('Maximum median monthly rent in USD'),
        maxViolentCrime: z
          .number()
          .optional()
          .describe('Maximum violent crime rate per 100k'),
        maxRiskTornado: z
          .number()
          .optional()
          .describe('Maximum FEMA tornado risk score (0-100)'),
        maxRiskHurricane: z
          .number()
          .optional()
          .describe('Maximum FEMA hurricane risk score'),
        maxRiskEarthquake: z
          .number()
          .optional()
          .describe('Maximum FEMA earthquake risk score'),
        maxRiskWildfire: z
          .number()
          .optional()
          .describe('Maximum FEMA wildfire risk score'),
        maxHotDays: z
          .number()
          .optional()
          .describe('Max days >90°F per year'),
        maxColdDays: z
          .number()
          .optional()
          .describe('Max days <32°F per year'),
        nameContains: z
          .string()
          .optional()
          .describe('Filter by name (case-insensitive)'),
        limit: z
          .number()
          .int()
          .positive()
          .optional()
          .default(20)
          .describe('Max results to return'),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const result = relocationService.searchLocations(args as never);
      return ok(result);
    },
  );

  // --- score_locations ---
  if (R) server.registerTool(
    'score_locations',
    {
      description:
        'Rank all 939 US metro areas by weighted preferences (Multi-Criteria Decision Analysis). Pass category weights (0-5 each) and optional hard filters. Returns ranked matches with match scores (0-100), subscores per category, and explanation traces.',
      inputSchema: {
        weights: z
          .object({
            cost: z
              .number()
              .int()
              .min(0)
              .max(5)
              .optional()
              .describe('Affordability: home prices, rent, taxes, cost of living'),
            climate: z
              .number()
              .int()
              .min(0)
              .max(5)
              .optional()
              .describe('Low disaster risk: earthquake, tornado, hurricane, wildfire, flood'),
            safety: z
              .number()
              .int()
              .min(0)
              .max(5)
              .optional()
              .describe('Low crime rates'),
            healthcare: z
              .number()
              .int()
              .min(0)
              .max(5)
              .optional()
              .describe('Hospital access and healthcare quality'),
            jobs: z
              .number()
              .int()
              .min(0)
              .max(5)
              .optional()
              .describe('Tax competitiveness + broadband access'),
            outdoors: z
              .number()
              .int()
              .min(0)
              .max(5)
              .optional()
              .describe('Sunshine hours, low precipitation'),
          })
          .optional()
          .describe(
            'Category weights (0=ignore, 5=critical). Defaults: cost=5, climate=4, safety=3, healthcare=3, jobs=3, outdoors=3.',
          ),
        states: z
          .array(z.string())
          .optional()
          .describe('State codes to include'),
        excludeStates: z
          .array(z.string())
          .optional()
          .describe('State codes to exclude'),
        maxHomeValue: z.number().optional(),
        maxRent: z.number().optional(),
        maxRiskTornado: z.number().optional(),
        maxRiskHurricane: z.number().optional(),
        maxRiskEarthquake: z.number().optional(),
        maxRiskWildfire: z.number().optional(),
        maxHotDays: z.number().optional(),
        maxColdDays: z.number().optional(),
        limit: z.number().int().positive().optional().default(20),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const result = relocationService.scoreLocations(args as never);
      return ok(result);
    },
  );

  // --- compare_locations ---
  if (R) server.registerTool(
    'compare_locations',
    {
      description:
        "Compare 2 or more locations side-by-side across all dimensions (cost, climate, crime, healthcare, etc.) with a computed winner. Pass location IDs (e.g., 'austin-tx', 'denver-co'). Use search_locations first to find IDs.",
      inputSchema: {
        locationIds: z
          .array(z.string())
          .min(2)
          .describe("Location IDs to compare (e.g., ['austin-tx','nashville-tn'])"),
        weights: z
          .object({
            cost: z.number().int().min(0).max(5).optional(),
            climate: z.number().int().min(0).max(5).optional(),
            safety: z.number().int().min(0).max(5).optional(),
            healthcare: z.number().int().min(0).max(5).optional(),
            jobs: z.number().int().min(0).max(5).optional(),
            outdoors: z.number().int().min(0).max(5).optional(),
          })
          .optional()
          .describe('Optional scoring weights for determining the winner'),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const result = relocationService.compareLocations(
        args.locationIds,
        args.weights as Record<string, number> | undefined,
      );
      return ok(result);
    },
  );

  // --- explain_score ---
  if (R) server.registerTool(
    'explain_score',
    {
      description:
        'Get a detailed breakdown of WHY a location received its score — subscores per category, human-readable explanation trace, and which data fields are missing (0.0 sentinel). Useful for transparency and debugging rankings.',
      inputSchema: {
        locationId: z
          .string()
          .describe("Location ID (e.g., 'memphis-tn') or partial name match"),
        weights: z
          .object({
            cost: z.number().int().min(0).max(5).optional(),
            climate: z.number().int().min(0).max(5).optional(),
            safety: z.number().int().min(0).max(5).optional(),
            healthcare: z.number().int().min(0).max(5).optional(),
            jobs: z.number().int().min(0).max(5).optional(),
            outdoors: z.number().int().min(0).max(5).optional(),
          })
          .optional()
          .describe('Optional scoring weights'),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const result = relocationService.explainScore(
        args.locationId,
        args.weights as Record<string, number> | undefined,
      );
      return ok(result);
    },
  );

  // --- fiscal_health ---
  if (R) server.registerTool(
    'fiscal_health',
    {
      description:
        "Assess the fiscal health of a location's state — predicts FUTURE tax burden based on pension debt, tax trajectory, and fiscal tier. Answers: 'Will my taxes go up in 5 years because the state can't pay its bills?' Returns a fiscal health score (0-100), risk level, estimated tax increase over 10 years, and human-readable explanation. This is the platform's key differentiator.",
      inputSchema: {
        locationId: z
          .string()
          .describe("Location ID (e.g., 'chicago-il') or partial name match"),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const result = relocationService.fiscalHealth(args.locationId);
      return ok(result);
    },
  );

  // --- update_relocation_profile (write) ---
  if (W) server.registerTool(
    'update_relocation_profile',
    {
      description:
        'Update the current user\'s relocation preferences — soft weights, hard filters, or stated priorities. These affect how locations are scored.',
      inputSchema: {
        softWeights: z
          .record(z.string(), z.number())
          .optional()
          .describe('Metric → weight map (e.g., {"cost": 0.35, "climate": 0.25})'),
        hardFilters: z
          .array(
            z.object({
              field: z.string(),
              operator: z.enum(['lt', 'lte', 'gt', 'gte', 'eq', 'in', 'notIn']),
              value: z.union([z.number(), z.string(), z.array(z.string())]),
              source: z.enum(['stated', 'revealed']),
              confidence: z.number(),
              discoveredAt: z.string(),
            }),
          )
          .optional(),
        statedPriorities: z
          .array(
            z.object({
              metric: z.string(),
              rank: z.number(),
              weight: z.number().optional(),
            }),
          )
          .optional(),
      },
      annotations: TOOL_ANNOTATIONS_WRITE,
    },
    async (args) => {
      const profile = relocationService.upsertUserProfile(
        String(_userId),
        args as Record<string, unknown>,
      );
      return ok({ profile });
    },
  );

  // --- get_relocation_profile (read) ---
  if (R) server.registerTool(
    'get_relocation_profile',
    {
      description:
        'Get the current user\'s relocation profile — preferences, hard filters, and elicitation state.',
      inputSchema: {},
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async () => {
      const profile = relocationService.getUserProfile(String(_userId));
      return ok({ profile });
    },
  );
}
