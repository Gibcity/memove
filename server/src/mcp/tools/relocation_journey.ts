import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { isAddonEnabled } from '../../services/adminService';
import { ADDON_IDS } from '../../addons';
import { RelocationJourneyService } from '../../nest/relocation/relocation-journey.service';
import { TOOL_ANNOTATIONS_READONLY, TOOL_ANNOTATIONS_WRITE, ok } from './_shared';
import { canRead, canWrite } from '../scopes';
import { db } from '../../db/database';

/**
 * MCP tools for the relocation journey state — the persistent workspace
 * that tracks a user's relocation progress across sessions and agents.
 *
 * 7 tools: get_journey, shortlist_location, eliminate_location,
 *          update_preferences, toggle_task, save_comparison, set_phase
 *
 * The MCP layer doesn't use Nest DI, so we adapt the raw db singleton
 * into a DatabaseService-shaped object (same pattern as relocation.ts
 * which constructs RelocationService without DI).
 */

/** Minimal adapter wrapping the raw db singleton for RelocationJourneyService. */
const dbAdapter = {
  get: <T>(sql: string, ...params: unknown[]): T | undefined =>
    db.prepare(sql).get(...params) as T | undefined,
  run: (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params),
} as never;

const journeyService = new RelocationJourneyService(dbAdapter);

export function registerJourneyTools(
  server: McpServer,
  userId: number,
  scopes: string[] | null,
): void {
  if (!isAddonEnabled(ADDON_IDS.RELOCATION)) return;

  const R = canRead(scopes, 'relocation');
  const W = canWrite(scopes, 'relocation');

  // --- get_relocation_journey ---
  if (R) server.registerTool(
    'get_relocation_journey',
    {
      description:
        "Get the user's complete relocation journey — shortlisted cities, saved comparisons, move timeline, preferences, completed tasks, and current phase. This is the persistent workspace that survives across sessions. Call this at the start of any relocation conversation to understand where the user is in their journey.",
      inputSchema: {},
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async () => {
      const journey = journeyService.getJourney(userId);
      return ok({ journey });
    },
  );

  // --- shortlist_location ---
  if (W) server.registerTool(
    'shortlist_location',
    {
      description:
        "Add a location to the user's relocation shortlist. The shortlist persists across sessions and is visible in the relocation dashboard.",
      inputSchema: {
        locationId: z.string().describe("Location ID (e.g., 'austin-tx')"),
      },
      annotations: TOOL_ANNOTATIONS_WRITE,
    },
    async (args) => {
      const journey = journeyService.shortlistLocation(userId, args.locationId);
      return ok({ journey });
    },
  );

  // --- eliminate_location ---
  if (W) server.registerTool(
    'eliminate_location',
    {
      description:
        "Remove a location from the user's shortlist, with an optional reason that gets logged.",
      inputSchema: {
        locationId: z.string().describe('Location ID to remove'),
        reason: z.string().optional().describe('Why the user eliminated this location'),
      },
      annotations: TOOL_ANNOTATIONS_WRITE,
    },
    async (args) => {
      const journey = journeyService.eliminateLocation(userId, args.locationId, args.reason);
      return ok({ journey });
    },
  );

  // --- update_relocation_preferences ---
  if (W) server.registerTool(
    'update_relocation_preferences',
    {
      description:
        "Update the user's relocation preferences (budget, household size, employment type, demographics, climate preference, priorities). Merges with existing preferences — only provided fields are updated.",
      inputSchema: {
        maxBudget: z.number().optional().describe('Maximum housing budget in USD'),
        householdSize: z.number().int().optional().describe('Number of people in household'),
        employment: z.enum(['remote', 'hybrid', 'onsite', 'retired', 'student', 'looking']).optional(),
        hasChildren: z.boolean().optional(),
        schoolAgeChildren: z.number().int().optional(),
        climatePreference: z.enum(['warm', 'mild', 'four_seasons', 'cold_tolerant']).optional(),
        priorities: z.record(z.string(), z.number()).optional().describe('Category → weight (e.g., {cost: 5, climate: 3})'),
      },
      annotations: TOOL_ANNOTATIONS_WRITE,
    },
    async (args) => {
      const journey = journeyService.updatePreferences(userId, args as never);
      return ok({ journey });
    },
  );

  // --- toggle_move_task ---
  if (W) server.registerTool(
    'toggle_move_task',
    {
      description:
        "Mark a move timeline task as complete or incomplete. Toggles the current state.",
      inputSchema: {
        taskId: z.string().describe('Task ID from the move timeline'),
      },
      annotations: TOOL_ANNOTATIONS_WRITE,
    },
    async (args) => {
      const journey = journeyService.toggleTask(userId, args.taskId);
      return ok({ journey });
    },
  );

  // --- save_comparison ---
  if (W) server.registerTool(
    'save_comparison',
    {
      description:
        'Save a location comparison result to the user journey for future reference.',
      inputSchema: {
        comparison: z.record(z.string(), z.unknown()).describe('The comparison result object to save'),
      },
      annotations: TOOL_ANNOTATIONS_WRITE,
    },
    async (args) => {
      const journey = journeyService.saveComparison(userId, args.comparison);
      return ok({ journey });
    },
  );

  // --- set_relocation_phase ---
  if (W) server.registerTool(
    'set_relocation_phase',
    {
      description:
        "Set the user's current phase in the relocation journey: discovery (researching cities), housing (finding a place), logistics (planning the move), admin (paperwork/legal), or settlement (post-move setup).",
      inputSchema: {
        phase: z.enum(['discovery', 'housing', 'logistics', 'admin', 'settlement']),
      },
      annotations: TOOL_ANNOTATIONS_WRITE,
    },
    async (args) => {
      const journey = journeyService.setPhase(userId, args.phase);
      return ok({ journey });
    },
  );
}
