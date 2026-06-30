import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { isAddonEnabled } from '../../services/adminService';
import { ADDON_IDS } from '../../addons';
import { RelocationService } from '../../nest/relocation/relocation.service';
import { RelocationJourneyService } from '../../nest/relocation/relocation-journey.service';
import { db } from '../../db/database';
import { TOOL_ANNOTATIONS_READONLY, TOOL_ANNOTATIONS_WRITE, ok } from './_shared';
import { canRead, canWrite } from '../scopes';

/**
 * MCP tools for the Moving Logistics Planner agent.
 *
 * 4 tools: plan_move_timeline, estimate_moving_costs,
 *          utility_setup_checklist, mark_move_task_complete
 *
 * Scope-gated: relocation:read for read ops, relocation:write for mutation.
 */

// ponytail: minimal DatabaseService-shaped adapter so the Nest-injected
// RelocationService and RelocationJourneyService work without DI in the
// MCP layer (same pattern as relocation_journey.ts).
const dbAdapter = {
  get: <T>(sql: string, ...params: unknown[]): T | undefined =>
    db.prepare(sql).get(...params) as T | undefined,
  run: (sql: string, ...params: unknown[]) => db.prepare(sql).run(...params),
} as never;

const relocationService = new RelocationService(dbAdapter);

function createJourneyService(): RelocationJourneyService {
  return new RelocationJourneyService(dbAdapter);
}

// ponytail: inline haversine; one call per estimate, accuracy > a util import here.
function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ── Timeline templates ─────────────────────────────────────────────────────

type TaskTemplate = {
  id: string;
  title: string;
  description: string;
  dueOffsetDays: number;
  category: 'research' | 'logistics' | 'admin' | 'housing' | 'financial';
  phase: string;
  condition?: (opts: TimelineOptions) => boolean;
};

interface TimelineOptions {
  familySize: number;
  hasChildren: boolean;
  hasPets: boolean;
  movingType: 'diy' | 'professional' | 'full_service';
}

const PHASES: { name: string; label: string; description: string }[] = [
  { name: '8_weeks', label: '8 Weeks Out', description: 'Initial research and planning' },
  { name: '6_weeks', label: '6 Weeks Out', description: 'Book movers and start logistics' },
  { name: '4_weeks', label: '4 Weeks Out', description: 'Packing and address changes' },
  { name: '2_weeks', label: '2 Weeks Out', description: 'Finalize logistics and admin' },
  { name: '1_week', label: '1 Week Out', description: 'Last-minute preparations' },
  { name: 'moving_day', label: 'Moving Day', description: 'Execute the move' },
  { name: 'post_move', label: 'Post-Move (1-4 weeks)', description: 'Settling in and registration' },
];

const TASK_TEMPLATES: TaskTemplate[] = [
  // 8 weeks out
  { id: 'declutter', phase: '8_weeks', title: 'Declutter and donate', description: 'Sort belongings into keep, donate, and discard piles. Fewer items = lower moving cost.', dueOffsetDays: -56, category: 'logistics' },
  { id: 'research_movers', phase: '8_weeks', title: 'Research moving companies', description: 'Read reviews on BBB, Google, and Yelp. Check USDOT registration for interstate moves.', dueOffsetDays: -56, category: 'logistics' },
  { id: 'create_budget', phase: '8_weeks', title: 'Create moving budget', description: 'Use estimate_moving_costs to set a realistic total budget including deposits, travel, and incidentals.', dueOffsetDays: -54, category: 'financial' },
  { id: 'inventory', phase: '8_weeks', title: 'Take inventory of belongings', description: 'Photograph and list high-value items for insurance purposes. Especially important for full-service moves.', dueOffsetDays: -52, category: 'logistics' },
  { id: 'school_research', phase: '8_weeks', title: 'Research schools in destination', description: 'Identify zoned schools, check district ratings, and start enrollment research.', dueOffsetDays: -50, category: 'admin', condition: (o) => o.hasChildren },

  // 6 weeks out
  { id: 'get_quotes', phase: '6_weeks', title: 'Get 3 moving quotes', description: 'Get in-home or video estimates from at least 3 movers. Avoid large deposits.', dueOffsetDays: -42, category: 'logistics' },
  { id: 'book_movers', phase: '6_weeks', title: 'Book moving company', description: 'Lock in the date with a written contract. Verify insurance coverage and cancellation terms.', dueOffsetDays: -40, category: 'logistics', condition: (o) => o.movingType !== 'diy' },
  { id: 'reserve_truck', phase: '6_weeks', title: 'Reserve rental truck', description: 'Book a truck sized to your home. Reserve a day early to avoid sell-outs on weekends.', dueOffsetDays: -40, category: 'logistics', condition: (o) => o.movingType === 'diy' },
  { id: 'transfer_school_records', phase: '6_weeks', title: 'Transfer school records', description: 'Request transcripts, immunization records, and IEP/504 plans from current schools.', dueOffsetDays: -38, category: 'admin', condition: (o) => o.hasChildren },
  { id: 'vet_records', phase: '6_weeks', title: 'Update pet vaccinations and records', description: 'Get vet records and vaccination certificates. Some states require health certificates within 10-30 days of entry.', dueOffsetDays: -35, category: 'admin', condition: (o) => o.hasPets },

  // 4 weeks out
  { id: 'start_packing', phase: '4_weeks', title: 'Start packing non-essentials', description: 'Pack seasonal items, books, decor, and anything you won\'t need for 30 days. Label by room and contents.', dueOffsetDays: -28, category: 'logistics' },
  { id: 'order_supplies', phase: '4_weeks', title: 'Order packing supplies', description: 'Boxes, tape, bubble wrap, markers, and specialty boxes for TVs/mirrors. Estimate 10-15 boxes per room.', dueOffsetDays: -28, category: 'logistics' },
  { id: 'usps_change', phase: '4_weeks', title: 'Submit USPS change of address', description: 'File at usps.com. Schedule forwarding to start the day before your move. $1.10 for online.', dueOffsetDays: -28, category: 'admin' },
  { id: 'insurance_update', phase: '4_weeks', title: 'Update insurance policies', description: 'Quote homeowner/renter insurance at destination. Bundle auto and home for discounts.', dueOffsetDays: -25, category: 'financial' },
  { id: 'pet_supplies', phase: '4_weeks', title: 'Stock up on pet moving supplies', description: 'Carrier, updated ID tags with new address, extra food and medications for the trip.', dueOffsetDays: -22, category: 'logistics', condition: (o) => o.hasPets },

  // 2 weeks out
  { id: 'transfer_utilities', phase: '2_weeks', title: 'Schedule utility transfers', description: 'Coordinate electric, gas, water, internet, and trash at the new address. Aim for service to start move-in day.', dueOffsetDays: -14, category: 'admin' },
  { id: 'cancel_old_utilities', phase: '2_weeks', title: 'Schedule old utility shutoffs', description: 'Schedule final readings and shutoffs at the old address for the day after move-out.', dueOffsetDays: -14, category: 'admin' },
  { id: 'notify_landlord', phase: '2_weeks', title: 'Provide move-out notice to landlord', description: 'Submit written notice per lease terms. Schedule walkthrough inspection.', dueOffsetDays: -14, category: 'admin' },
  { id: 'pack_rooms', phase: '2_weeks', title: 'Pack most of your home', description: 'Leave only daily essentials, kitchen basics, and bedding. Most rooms should be fully packed by 2 weeks out.', dueOffsetDays: -12, category: 'logistics' },
  { id: 'finalize_travel', phase: '2_weeks', title: 'Finalize travel plans', description: 'Book flights or plan driving route. Reserve pet-friendly hotels if needed. Confirm timing with movers.', dueOffsetDays: -10, category: 'logistics' },

  // 1 week out
  { id: 'pack_essentials', phase: '1_week', title: 'Pack essentials box', description: 'First-night bag: toiletries, chargers, change of clothes, snacks, important documents, medications.', dueOffsetDays: -5, category: 'logistics' },
  { id: 'confirm_movers', phase: '1_week', title: 'Confirm with moving company', description: 'Reconfirm arrival window, addresses, and contact info. Get dispatcher\'s direct line.', dueOffsetDays: -4, category: 'logistics' },
  { id: 'refill_meds', phase: '1_week', title: 'Refill prescriptions', description: 'Refill all prescriptions to last at least 30 days post-move. Bring paper copies in case pharmacy is closed.', dueOffsetDays: -3, category: 'admin' },
  { id: 'empty_fridge', phase: '1_week', title: 'Empty and defrost freezer', description: 'Use up frozen food. Unplug fridge 24h before move to dry out.', dueOffsetDays: -2, category: 'logistics' },
  { id: 'pack_valuables', phase: '1_week', title: 'Pack valuables separately', description: 'Jewelry, documents, and small valuables go with you personally, not on the truck.', dueOffsetDays: -1, category: 'logistics' },

  // Moving day
  { id: 'walkthrough_old', phase: 'moving_day', title: 'Walkthrough at old home', description: 'Document condition with photos/videos, check all rooms and closets, hand off keys.', dueOffsetDays: 0, category: 'logistics' },
  { id: 'oversee_load', phase: 'moving_day', title: 'Oversee loading', description: 'Be present to direct placement of boxes and furniture on the truck. Get bill of lading.', dueOffsetDays: 0, category: 'logistics' },
  { id: 'travel_new', phase: 'moving_day', title: 'Travel to new home', description: 'Arrive before movers if possible. Check that utilities are active.', dueOffsetDays: 0, category: 'logistics' },
  { id: 'unload_inventory', phase: 'moving_day', title: 'Direct unloading and inventory check', description: 'Mark off boxes against inventory list. Note any damage on the bill of lading before signing.', dueOffsetDays: 0, category: 'logistics' },

  // Post-move
  { id: 'register_vehicle', phase: 'post_move', title: 'Register vehicle in new state', description: 'Most states require within 30 days. Bring title, insurance, and current registration.', dueOffsetDays: 7, category: 'admin' },
  { id: 'update_license', phase: 'post_move', title: 'Update driver\'s license', description: 'Visit new state DMV within required window (typically 10-30 days). Some require a new photo and vision test.', dueOffsetDays: 14, category: 'admin' },
  { id: 'register_to_vote', phase: 'post_move', title: 'Register to vote', description: 'Register at new address. Most states allow online registration.', dueOffsetDays: 14, category: 'admin' },
  { id: 'find_doctors', phase: 'post_move', title: 'Find new healthcare providers', description: 'Transfer medical records, identify new primary care, dentist, and specialists. Fill prescriptions at local pharmacy.', dueOffsetDays: 14, category: 'admin' },
  { id: 'enroll_school', phase: 'post_move', title: 'Enroll children in school', description: 'Complete enrollment with proof of residency, immunization records, and previous school records.', dueOffsetDays: 14, category: 'admin', condition: (o) => o.hasChildren },
  { id: 'update_pet_license', phase: 'post_move', title: 'Update pet license and tags', description: 'Some cities/counties require pet registration within 30 days. Update microchip address.', dueOffsetDays: 21, category: 'admin', condition: (o) => o.hasPets },
  { id: 'unpack_priority', phase: 'post_move', title: 'Unpack priority rooms', description: 'Bedroom, bathroom, and kitchen within the first week. Schedule donations for unopened boxes after 30 days.', dueOffsetDays: 7, category: 'housing' },
];

// ── Cost estimation tables ──────────────────────────────────────────────────

// Base costs by home size for each service type. Ranges are low/mid/high in USD.
// ponytail: rough industry averages; user can refine after get_quotes.
const MOVING_BASE_COSTS: Record<string, Record<string, [number, number, number]>> = {
  studio:   { diy: [200, 350, 500],    professional: [400, 600, 900],    full_service: [800, 1200, 1800] },
  '1br':    { diy: [300, 500, 750],    professional: [600, 900, 1400],   full_service: [1200, 1800, 2600] },
  '2br':    { diy: [400, 700, 1100],   professional: [900, 1500, 2300],  full_service: [1800, 2800, 4200] },
  '3br':    { diy: [600, 1000, 1600],  professional: [1400, 2400, 3800], full_service: [2800, 4500, 6800] },
  '4br':    { diy: [900, 1500, 2400],  professional: [2000, 3500, 5500], full_service: [4000, 6500, 9800] },
};

// Per-mile cost added on top of base for each service type.
const MOVING_PER_MILE: Record<string, [number, number, number]> = {
  diy: [0.5, 0.85, 1.2],
  professional: [1.0, 1.6, 2.4],
  full_service: [1.5, 2.4, 3.5],
};

// ── Tool registration ───────────────────────────────────────────────────────

export function registerLogisticsTools(
  server: McpServer,
  userId: number,
  scopes: string[] | null,
): void {
  if (!isAddonEnabled(ADDON_IDS.RELOCATION)) return;

  const R = canRead(scopes, 'relocation');
  const W = canWrite(scopes, 'relocation');

  // --- plan_move_timeline ---
  if (W) server.registerTool(
    'plan_move_timeline',
    {
      description:
        'Generate a personalized moving checklist with phased tasks and target dates. Uses family size, pets, and moving type to tailor tasks. Saves the timeline to the user\'s relocation journey so it persists across sessions. Output is grouped by phase (8 weeks, 6 weeks, 4 weeks, 2 weeks, 1 week, moving day, post-move) with specific dueOffsetDays from the move date.',
      inputSchema: {
        moveDate: z
          .string()
          .describe('Target move date in ISO 8601 format (e.g., "2026-08-15")'),
        fromLocationId: z
          .string()
          .describe("Origin location ID (e.g., 'chicago-il')"),
        toLocationId: z
          .string()
          .describe("Destination location ID (e.g., 'austin-tx')"),
        familySize: z
          .number()
          .int()
          .min(1)
          .default(1)
          .describe('Number of people in household'),
        hasChildren: z
          .boolean()
          .default(false)
          .describe('Whether household includes children'),
        hasPets: z
          .boolean()
          .default(false)
          .describe('Whether household includes pets'),
        movingType: z
          .enum(['diy', 'professional', 'full_service'])
          .default('professional')
          .describe('Type of move: diy (rental truck), professional (movers), or full_service (pack+move)'),
        save: z
          .boolean()
          .default(true)
          .describe('Persist timeline to user journey (default true)'),
      },
      annotations: TOOL_ANNOTATIONS_WRITE,
    },
    async (args) => {
      const moveDate = new Date(args.moveDate);
      if (Number.isNaN(moveDate.getTime())) {
        return {
          content: [{ type: 'text' as const, text: 'Invalid moveDate. Use ISO 8601 (e.g., "2026-08-15").' }],
          isError: true,
        };
      }

      const opts: TimelineOptions = {
        familySize: args.familySize,
        hasChildren: args.hasChildren,
        hasPets: args.hasPets,
        movingType: args.movingType,
      };

      // Filter templates by condition and build tasks with computed due dates.
      const tasks = TASK_TEMPLATES
        .filter((t) => !t.condition || t.condition(opts))
        .map((t) => {
          const due = new Date(moveDate);
          due.setUTCDate(due.getUTCDate() + t.dueOffsetDays);
          return {
            id: t.id,
            title: t.title,
            description: t.description,
            phase: t.phase,
            category: t.category,
            dueOffsetDays: t.dueOffsetDays,
            dueDate: due.toISOString().slice(0, 10),
            completed: false,
          };
        });

      // Group by phase for readable output.
      const phases = PHASES.map((p) => ({
        name: p.name,
        label: p.label,
        description: p.description,
        tasks: tasks.filter((t) => t.phase === p.name),
      }));

      const summary = {
        moveDate: args.moveDate,
        fromLocationId: args.fromLocationId,
        toLocationId: args.toLocationId,
        familySize: args.familySize,
        hasChildren: args.hasChildren,
        hasPets: args.hasPets,
        movingType: args.movingType,
        totalTasks: tasks.length,
        completedTasks: 0,
        phases: phases.map((p) => ({
          name: p.name,
          label: p.label,
          taskCount: p.tasks.length,
        })),
      };

      if (args.save) {
        const svc = createJourneyService();
        svc.setMoveTimeline(userId, { moveDate: args.moveDate, tasks });
      }

      return ok({ summary, phases });
    },
  );

  // --- estimate_moving_costs ---
  if (R) server.registerTool(
    'estimate_moving_costs',
    {
      description:
        'Estimate total moving costs with itemized breakdown and low/mid/high ranges based on distance, home size, and service type. Categories: movers/truck, packing supplies, travel (flights/gas), storage, temporary housing, deposits, and incidentals. Distance is computed from origin/destination coordinates.',
      inputSchema: {
        fromLocationId: z.string().describe("Origin location ID (e.g., 'chicago-il')"),
        toLocationId: z.string().describe("Destination location ID (e.g., 'austin-tx')"),
        homeSize: z
          .enum(['studio', '1br', '2br', '3br', '4br'])
          .describe('Home size category'),
        movingType: z
          .enum(['diy', 'professional', 'full_service'])
          .default('professional')
          .describe('Type of move'),
        includeStorage: z
          .boolean()
          .default(false)
          .describe('Add estimated storage costs (e.g., 1 month during transition)'),
        includeTempHousing: z
          .boolean()
          .default(false)
          .describe('Add estimated temporary housing (e.g., 1 week overlap or hotel during drive)'),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const from = relocationService.getLocationById(args.fromLocationId);
      const to = relocationService.getLocationById(args.toLocationId);
      if (!from) return { content: [{ type: 'text' as const, text: `Unknown fromLocationId: ${args.fromLocationId}` }], isError: true };
      if (!to) return { content: [{ type: 'text' as const, text: `Unknown toLocationId: ${args.toLocationId}` }], isError: true };

      const distanceMiles = Math.round(haversineMiles(from, to));

      const base = MOVING_BASE_COSTS[args.homeSize]?.[args.movingType];
      if (!base) {
        return { content: [{ type: 'text' as const, text: `Invalid homeSize/movingType combo.` }], isError: true };
      }
      const perMile = MOVING_PER_MILE[args.movingType];

      // Movers/truck: base + perMile * distance
      const moversLow = Math.round(base[0] + perMile[0] * distanceMiles);
      const moversMid = Math.round(base[1] + perMile[1] * distanceMiles);
      const moversHigh = Math.round(base[2] + perMile[2] * distanceMiles);

      // Packing supplies scale with home size; full_service bundles these in movers.
      const suppliesLowMidHigh: [number, number, number] =
        args.movingType === 'full_service'
          ? [0, 0, 0]
          : args.homeSize === 'studio'
            ? [60, 100, 160]
            : args.homeSize === '1br'
              ? [100, 160, 240]
              : args.homeSize === '2br'
                ? [180, 280, 400]
                : args.homeSize === '3br'
                  ? [280, 420, 600]
                  : [380, 580, 850];

      // Travel: $0.20/mile for diy gas + lodging scaled by distance; flights roughly $400/person roundtrip.
      const isLong = distanceMiles > 400;
      const travel: [number, number, number] = isLong
        ? [600, 1100, 2000] // flight range
        : args.movingType === 'diy'
          ? [Math.round(80 + distanceMiles * 0.25), Math.round(140 + distanceMiles * 0.35), Math.round(220 + distanceMiles * 0.5)]
          : [120, 220, 380];

      // Storage: optional, monthly.
      const storage: [number, number, number] = args.includeStorage
        ? args.homeSize === 'studio' ? [80, 130, 200] : args.homeSize === '1br' ? [110, 180, 280] : args.homeSize === '2br' ? [160, 240, 360] : args.homeSize === '3br' ? [220, 320, 480] : [300, 440, 640]
        : [0, 0, 0];

      // Temp housing: optional.
      const tempHousing: [number, number, number] = args.includeTempHousing
        ? isLong ? [500, 900, 1500] : [300, 600, 1000]
        : [0, 0, 0];

      // Deposits: typical first+last + security at destination, scaled by local rent.
      const destRent = to.cost?.medianRent ?? 1500;
      const depLow = Math.round(destRent * 2);
      const depMid = Math.round(destRent * 2.5);
      const depHigh = Math.round(destRent * 3);

      const items: { category: string; description: string; low: number; mid: number; high: number }[] = [
        {
          category: 'movers_truck',
          description: args.movingType === 'diy' ? 'Truck rental + fuel' : args.movingType === 'full_service' ? 'Full-service packing + moving' : 'Professional movers',
          low: moversLow,
          mid: moversMid,
          high: moversHigh,
        },
        {
          category: 'packing_supplies',
          description: args.movingType === 'full_service' ? 'Included in service' : 'Boxes, tape, wrap, markers',
          low: suppliesLowMidHigh[0],
          mid: suppliesLowMidHigh[1],
          high: suppliesLowMidHigh[2],
        },
        {
          category: 'travel',
          description: isLong ? 'Flights or long-drive fuel + lodging' : 'Drive fuel + meals',
          low: travel[0],
          mid: travel[1],
          high: travel[2],
        },
        ...(args.includeStorage ? [{
          category: 'storage',
          description: '1 month storage unit',
          low: storage[0], mid: storage[1], high: storage[2],
        }] : []),
        ...(args.includeTempHousing ? [{
          category: 'temp_housing',
          description: isLong ? '1-2 weeks temporary housing' : '1 week overlap housing',
          low: tempHousing[0], mid: tempHousing[1], high: tempHousing[2],
        }] : []),
        {
          category: 'deposits',
          description: 'First/last month rent + security at destination',
          low: depLow, mid: depMid, high: depHigh,
        },
        {
          category: 'incidentals',
          description: 'Tips, meals, cleaning supplies, last-minute purchases (~10% of move costs)',
          low: 0, mid: 0, high: 0, // computed below
        },
      ];

      // Recompute incidentals as 10% of subtotal.
      const subLow = items.slice(0, -1).reduce((s, i) => s + i.low, 0);
      const subMid = items.slice(0, -1).reduce((s, i) => s + i.mid, 0);
      const subHigh = items.slice(0, -1).reduce((s, i) => s + i.high, 0);
      items[items.length - 1] = {
        category: 'incidentals',
        description: 'Tips, meals, cleaning supplies, last-minute purchases (~10% of move costs)',
        low: Math.round(subLow * 0.08),
        mid: Math.round(subMid * 0.1),
        high: Math.round(subHigh * 0.13),
      };

      const totalLow = items.reduce((s, i) => s + i.low, 0);
      const totalMid = items.reduce((s, i) => s + i.mid, 0);
      const totalHigh = items.reduce((s, i) => s + i.high, 0);

      return ok({
        fromLocation: { id: from.id, name: from.name, state: from.state },
        toLocation: { id: to.id, name: to.name, state: to.state },
        distanceMiles,
        homeSize: args.homeSize,
        movingType: args.movingType,
        breakdown: items,
        total: { low: totalLow, mid: totalMid, high: totalHigh },
        notes: [
          'These are national averages; actual costs vary by region, season, and demand.',
          'Get at least 3 in-home quotes for accuracy on long-distance moves.',
          'Mid-point estimate is most realistic; budget toward the high end for buffer.',
        ],
      });
    },
  );

  // --- utility_setup_checklist ---
  if (R) server.registerTool(
    'utility_setup_checklist',
    {
      description:
        'Generate a utility setup/transfer checklist for the destination. Returns a list of utilities to set up (electric, gas, water, sewer, internet, trash, HOA if applicable) with provider guidance based on the destination location, plus a checklist for canceling old utilities. Home type (apartment vs house) affects whether water/trash and certain services are tenant vs landlord responsibility.',
      inputSchema: {
        toLocationId: z.string().describe("Destination location ID (e.g., 'austin-tx')"),
        homeType: z
          .enum(['apartment', 'house'])
          .default('house')
          .describe('Home type at destination'),
        startDate: z
          .string()
          .optional()
          .describe('Target move-in date (ISO). Used to suggest lead times. Defaults to 2 weeks out.'),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const to = relocationService.getLocationById(args.toLocationId);
      if (!to) {
        return { content: [{ type: 'text' as const, text: `Unknown toLocationId: ${args.toLocationId}` }], isError: true };
      }

      const state = to.state ?? '';
      const moveIn = args.startDate ? new Date(args.startDate) : new Date(Date.now() + 14 * 86400_000);
      const daysOut = (n: number) => {
        const d = new Date(moveIn);
        d.setUTCDate(d.getUTCDate() - n);
        return d.toISOString().slice(0, 10);
      };

      // ponytail: national provider shortlist; metro-specific ISPs vary — user picks from list.
      const isApartment = args.homeType === 'apartment';

      const setup = [
        {
          utility: 'electric',
          responsibility: isApartment ? 'tenant' : 'homeowner',
          leadDays: 7,
          scheduledDate: daysOut(7),
          providers: stateNationalElectric(state),
          notes: isApartment
            ? 'Ask landlord which provider services the building. Many apartments have exclusive electric contracts.'
            : 'Compare rates on your state public utility commission site before signing up.',
        },
        {
          utility: 'gas',
          responsibility: isApartment ? 'often_tenant' : 'homeowner',
          leadDays: 7,
          scheduledDate: daysOut(7),
          providers: ['Local gas utility', 'Check with city for regulated vs deregulated markets'],
          notes: isApartment
            ? 'Many apartments have gas included or use a single building provider. Confirm with landlord.'
            : 'In deregulated states (TX, IL, NY, OH, PA, GA, MA, MD, NJ, CT, ME, MI, NH, RI, VA) you can choose a retail supplier.',
        },
        {
          utility: 'water',
          responsibility: isApartment ? 'landlord' : 'homeowner',
          leadDays: isApartment ? 0 : 3,
          scheduledDate: isApartment ? null : daysOut(3),
          providers: ['Municipal water utility'],
          notes: isApartment
            ? 'Water is typically included in rent. Confirm with landlord; no action needed.'
            : 'Set up service at the city water department. Some cities auto-bill based on occupancy.',
        },
        {
          utility: 'sewer_trash',
          responsibility: isApartment ? 'landlord' : 'homeowner',
          leadDays: isApartment ? 0 : 7,
          scheduledDate: isApartment ? null : daysOut(7),
          providers: ['Municipal sanitation department', 'Private hauler (verify service area)'],
          notes: isApartment
            ? 'Usually included in rent. Verify pickup schedule for large items.'
            : 'Trash day pickup is typically city-run; recycling may require separate signup.',
        },
        {
          utility: 'internet',
          responsibility: 'tenant',
          leadDays: 14,
          scheduledDate: daysOut(14),
          providers: nationalISPs(),
          notes: 'Schedule install 2 weeks out — fiber installs can require a technician visit with 5-10 day lead time.',
        },
        {
          utility: 'renter_or_homeowner_insurance',
          responsibility: 'tenant',
          leadDays: 5,
          scheduledDate: daysOut(5),
          providers: ['Lemonade', 'State Farm', 'GEICO', 'Progressive', 'USAA (military)'],
          notes: 'Bring proof of insurance to closing/move-in. Required by most landlords and mortgage lenders.',
        },
        ...(isApartment ? [] : [{
          utility: 'hoa',
          responsibility: 'homeowner',
          leadDays: 14,
          scheduledDate: daysOut(14),
          providers: ['HOA management (check closing docs for contact)'],
          notes: 'Get HOA rules, trash schedule, parking, and amenity access. Some require transfer fee.',
        }]),
      ];

      const cancel = [
        {
          utility: 'electric',
          action: 'Schedule final reading and shutoff for day after move-out',
          leadDays: 7,
          scheduledDate: daysOut(7),
        },
        {
          utility: 'gas',
          action: 'Schedule final reading and shutoff',
          leadDays: 7,
          scheduledDate: daysOut(7),
        },
        {
          utility: 'water',
          action: 'Request final bill at move-out (landlord handles if rented)',
          leadDays: 3,
          scheduledDate: daysOut(3),
        },
        {
          utility: 'internet',
          action: 'Cancel or transfer. Return equipment (modem/router) to avoid fees',
          leadDays: 3,
          scheduledDate: daysOut(3),
        },
        {
          utility: 'renter_or_homeowner_insurance',
          action: 'Cancel old policy or set end date. Set new policy start date as the same day',
          leadDays: 1,
          scheduledDate: daysOut(1),
        },
        {
          utility: 'subscriptions',
          action: 'Update address on streaming, meal kits, Amazon, paper delivery, gym, etc.',
          leadDays: 3,
          scheduledDate: daysOut(3),
        },
      ];

      return ok({
        toLocation: { id: to.id, name: to.name, state: to.state },
        homeType: args.homeType,
        moveInDate: moveIn.toISOString().slice(0, 10),
        setup,
        cancel,
        notes: [
          `State: ${state}. Provider availability and regulations vary.`,
          'Schedule utility setup 1-2 weeks before move-in to ensure service on day one.',
          'Apartments: many utilities are landlord-managed — confirm before signing up to avoid duplicate billing.',
        ],
      });
    },
  );

  // --- mark_move_task_complete ---
  if (W) server.registerTool(
    'mark_move_task_complete',
    {
      description:
        'Mark a move timeline task as complete (or incomplete — calling again toggles). Persists to the user\'s relocation journey. Use the taskId from plan_move_timeline output.',
      inputSchema: {
        taskId: z
          .string()
          .describe("Task ID from the move timeline (e.g., 'get_quotes', 'transfer_utilities')"),
      },
      annotations: TOOL_ANNOTATIONS_WRITE,
    },
    async (args) => {
      const svc = createJourneyService();
      const journey = svc.toggleTask(userId, args.taskId);

      const taskInTimeline = journey.moveTimeline?.tasks.find((t) => t.id === args.taskId);
      const isComplete = journey.completedTasks.includes(args.taskId);

      return ok({
        taskId: args.taskId,
        completed: isComplete,
        task: taskInTimeline ?? null,
        completedCount: journey.completedTasks.length,
        totalTasks: journey.moveTimeline?.tasks.length ?? 0,
      });
    },
  );
}

// ponytail: inline national provider shortlist. Not exhaustive — metros differ.
function nationalISPs(): string[] {
  return ['Xfinity/Comcast', 'Spectrum/Charter', 'AT&T Fiber', 'Verizon Fios', 'T-Mobile Home Internet', 'CenturyLink/Lumen', 'Google Fiber (limited metros)', 'Starlink (rural)'];
}

function stateNationalElectric(state: string): string[] {
  // ponytail: list common providers per state. Not authoritative.
  const map: Record<string, string[]> = {
    TX: ['TXU Energy', 'Reliant', 'Direct Energy', 'Cirro Energy', 'Payless Power', 'Oncor delivery (regardless of retailer)'],
    CA: ['PG&E', 'SCE', 'SDG&E', 'Clean Power Alliance (CCA)'],
    FL: ['Florida Power & Light (FPL)', 'Duke Energy Florida', 'Tampa Electric (TECO)'],
    NY: ['Con Edison', 'NYSEG', 'RG&E', 'National Grid', 'PSEG Long Island'],
    IL: ['ComEd', 'Ameren Illinois'],
    PA: ['PECO', 'PPL', 'FirstEnergy (Met-Ed/Penelec)'],
    OH: ['AEP Ohio', 'Duke Energy Ohio', 'FirstEnergy (Illuminating/Ohio Edison/Toledo Edison)'],
    GA: ['Georgia Power', 'Sawnee EMC', 'Jackson EMC'],
    NC: ['Duke Energy', 'Dominion Energy', 'NC Electric Cooperatives'],
    VA: ['Dominion Energy', 'Appalachian Power'],
    MA: ['Eversource', 'National Grid'],
    AZ: ['APS', 'Tucson Electric Power (TEP)', 'Salt River Project (SRP)'],
    NV: ['NV Energy'],
    WA: ['Seattle City Light', 'Puget Sound Energy', 'Snohomish PUD'],
    CO: ['Xcel Energy', 'Black Hills Energy'],
  };
  if (map[state]) return map[state];
  return ['State\'s largest investor-owned utility (check state PUC site)'];
}
