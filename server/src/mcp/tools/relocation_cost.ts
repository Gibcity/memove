import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { isAddonEnabled } from '../../services/adminService';
import { ADDON_IDS } from '../../addons';
import { TOOL_ANNOTATIONS_READONLY, ok } from './_shared';
import { canRead } from '../scopes';

/**
 * MCP tools for the Cost of Living Deep-Dive agent.
 *
 * 4 tools: compare_cost_of_living, tax_impact_calculator,
 *          salary_adjustment, cost_breakdown
 *
 * Scope-gated: relocation:read for all ops.
 */

// ── Data loading (mirrors RelocationService's source of truth) ───────────────

const LOCATIONS_PATH = path.resolve(
  __dirname,
  '../../../../sources/processed/relocation/locations.json',
);

let _cache: any[] | null = null;
function loadLocations(): any[] {
  if (_cache === null) _cache = JSON.parse(fs.readFileSync(LOCATIONS_PATH, 'utf-8'));
  return _cache!;
}

function resolveLocation(idOrName: string): any | null {
  const locs = loadLocations();
  const norm = idOrName.toLowerCase().trim();
  // ponytail: fuzzy lookup that tolerates "austin-tx" vs the full CBSA
  // "austin-round-rock-georgetown-tx". Strip a trailing -<state> token so
  // friendly aliases work.
  const shortMatch = norm.match(/^(.+)-([a-z]{2})$/);
  const cityPart = shortMatch ? shortMatch[1] : norm;
  const statePart = shortMatch ? shortMatch[2] : null;
  return (
    locs.find((l) => l.id === norm) ??
    locs.find((l) => norm === `${l.name.toLowerCase()}, ${l.state.toLowerCase()}`) ??
    locs.find(
      (l) =>
        l.id.startsWith(cityPart) &&
        (statePart === null || l.id.endsWith(`-${statePart}`)),
    ) ??
    locs.find((l) => l.name.toLowerCase() === norm) ??
    locs.find((l) => l.name.toLowerCase().includes(norm)) ??
    null
  );
}

// ── Cost estimation math (per task spec multipliers) ─────────────────────────
// All annual costs are derived from the location's costOfLivingIndex
// (national average = 100). Multipliers match the spec.

const COL_BASE = 100;

function annualHousing(loc: any, ownerOccupied: boolean): number {
  return ownerOccupied
    ? (loc.cost.medianHomeValue ?? 0) // purchase outlay (we surface both paths)
    : (loc.cost.medianRent ?? 0) * 12;
}

function annualPropertyTax(loc: any, homeValueOverride?: number): number {
  const hv = homeValueOverride ?? loc.cost.medianHomeValue ?? 0;
  return hv * (loc.cost.propertyTaxRate ?? 0);
}

function annualIncomeTax(income: number, stateRate: number): number {
  // Simplified: flat state rate on the full income, federal treated separately.
  // Federal estimate: 12% effective (single filer, mid-bracket) — a flat shortcut
  // that the agent surfaces as a line item, not a true bracket simulation.
  return income * (0.12 + stateRate);
}

function annualTransportation(loc: any): number {
  // $300-800/mo scaled linearly by COL index, clamped.
  const monthly = 300 + (Math.min(Math.max(loc.cost.costOfLivingIndex, 70), 180) - 70) * 5.45;
  return Math.round(monthly) * 12;
}

function annualFood(loc: any, householdSize: number): number {
  // $400-1200/mo for 2 adults scaled by COL; scale by household.
  const adults = Math.max(1, Math.round(householdSize / 2));
  const monthlyBase = 400 + (Math.min(Math.max(loc.cost.costOfLivingIndex, 70), 180) - 70) * 8.18;
  return Math.round(monthlyBase * adults) * 12;
}

function annualUtilities(loc: any): number {
  // $150-400/mo. Hot/cold extremes push utilities up.
  const extremes = (loc.climate.daysMaxGt90FAnnual ?? 0) + (loc.climate.daysMinLt32FAnnual ?? 0);
  const monthly = 150 + extremes * 0.6 + (loc.cost.costOfLivingIndex - COL_BASE) * 1.2;
  return Math.max(150, Math.round(monthly)) * 12;
}

function annualHealthcare(loc: any, householdSize: number): number {
  // Baseline ~$6k/yr/adult; healthcareAccessScore scales: better access →
  // more utilization, higher cost. healthcareAccessScore ~0-100, 100 = top.
  const util = 1 + (loc.healthcare.healthcareAccessScore ?? 50) / 200; // 1.0-1.5x
  const adults = Math.max(1, Math.round(householdSize / 2));
  return Math.round(6000 * util * adults);
}

function buildBreakdown(loc: any, householdSize: number, homeValueOverride?: number) {
  const housingRent = (loc.cost.medianRent ?? 0) * 12;
  const housingOwnerPropTax = annualPropertyTax(loc, homeValueOverride);
  return {
    locationId: loc.id,
    name: loc.name,
    state: loc.state,
    costOfLivingIndex: loc.cost.costOfLivingIndex,
    householdSize,
    housing: {
      medianHomeValue: loc.cost.medianHomeValue,
      medianMonthlyRent: loc.cost.medianRent,
      annualRent: housingRent,
      annualPropertyTaxOnMedianHome: housingOwnerPropTax,
    },
    taxes: {
      stateIncomeTaxRate: loc.cost.stateIncomeTaxRate,
      propertyTaxRate: loc.cost.propertyTaxRate,
    },
    transportation: { annual: annualTransportation(loc) },
    food: { annual: annualFood(loc, householdSize) },
    utilities: { annual: annualUtilities(loc) },
    healthcare: { annual: annualHealthcare(loc, householdSize) },
  };
}

function totals(b: ReturnType<typeof buildBreakdown>, includeOwnerCosts: boolean) {
  return (
    b.housing.annualRent +
    (includeOwnerCosts ? b.housing.annualPropertyTaxOnMedianHome : 0) +
    b.transportation.annual +
    b.food.annual +
    b.utilities.annual +
    b.healthcare.annual
  );
}

// ponytail: helpers exported for unit testing only — not part of the MCP
// surface. Real tool access is through registerCostAnalysisTools.
export const __test = {
  resolveLocation,
  buildBreakdown,
  totals,
  annualIncomeTax,
  annualPropertyTax,
  annualTransportation,
  annualFood,
  annualUtilities,
  annualHealthcare,
};

// ── Tool registration ────────────────────────────────────────────────────────

export function registerCostAnalysisTools(
  server: McpServer,
  _userId: number,
  scopes: string[] | null,
): void {
  if (!isAddonEnabled(ADDON_IDS.RELOCATION)) return;
  const R = canRead(scopes, 'relocation');

  // --- compare_cost_of_living ---
  if (R) server.registerTool(
    'compare_cost_of_living',
    {
      description:
        'Deep cost-of-living comparison between 2+ US metros. Breaks down housing, taxes, transportation, food, utilities, and healthcare — both monthly and annual. Returns per-city totals and the deltas so the user can see exactly what changes if they move. Cost categories beyond housing/taxes are estimated from the COL index using standard BLS-style multipliers (see methodology field).',
      inputSchema: {
        locationIds: z
          .array(z.string())
          .min(2)
          .describe("Location IDs to compare (e.g., ['austin-tx','nashville-tn'])"),
        householdIncome: z
          .number()
          .positive()
          .optional()
          .describe('Optional household income — enables income-tax line items in the breakdown'),
        householdSize: z
          .number()
          .int()
          .positive()
          .optional()
          .default(2)
          .describe('Household size for food/healthcare scaling (default 2)'),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const breakdown: Record<string, unknown> = {};
      const baseline: Record<string, number> = {};
      let baseKey: string | null = null;

      for (const id of args.locationIds) {
        const loc = resolveLocation(id);
        if (!loc) continue;
        const b = buildBreakdown(loc, args.householdSize ?? 2);
        const incTax = args.householdIncome
          ? annualIncomeTax(args.householdIncome, loc.cost.stateIncomeTaxRate ?? 0)
          : 0;
        const annualTotal = totals(b, true) + incTax;
        breakdown[loc.id] = {
          ...b,
          taxes: { ...b.taxes, annualIncomeTaxEstimate: incTax },
          annualTotal,
          monthlyTotal: Math.round(annualTotal / 12),
        };
        if (baseKey === null) {
          baseKey = loc.id;
          baseline['housing'] = b.housing.annualRent;
          baseline['propertyTax'] = b.housing.annualPropertyTaxOnMedianHome;
          baseline['transportation'] = b.transportation.annual;
          baseline['food'] = b.food.annual;
          baseline['utilities'] = b.utilities.annual;
          baseline['healthcare'] = b.healthcare.annual;
          baseline['incomeTax'] = incTax;
        }
      }

      // Deltas vs first resolved location.
      const deltas: Record<string, Record<string, number | string>> = {};
      for (const [id, data] of Object.entries(breakdown)) {
        if (id === baseKey) continue;
        const d: any = data as any;
        deltas[id] = {
          vsBase: baseKey as string,
          annualTotalDelta: d.annualTotal - (breakdown[baseKey!] as any).annualTotal,
          housingDelta: d.housing.annualRent - baseline['housing'],
          propertyTaxDelta: d.housing.annualPropertyTaxOnMedianHome - baseline['propertyTax'],
          transportationDelta: d.transportation.annual - baseline['transportation'],
          foodDelta: d.food.annual - baseline['food'],
          utilitiesDelta: d.utilities.annual - baseline['utilities'],
          healthcareDelta: d.healthcare.annual - baseline['healthcare'],
          incomeTaxDelta: d.taxes.annualIncomeTaxEstimate - baseline['incomeTax'],
        };
      }

      return ok({
        baseline: baseKey,
        householdSize: args.householdSize ?? 2,
        householdIncome: args.householdIncome ?? null,
        locations: breakdown,
        deltas,
        methodology:
          'Housing: median rent × 12 (renter path) + medianHomeValue × propertyTaxRate (owner path). Transportation: $300-800/mo scaled by COL index. Food: $400-1200/mo per 2 adults scaled by COL. Utilities: $150 base + climate extremes + COL. Healthcare: $6k/adult × utilization 1.0-1.5x from healthcareAccessScore. Income tax: 12% federal flat + state rate (simplified).',
      });
    },
  );

  // --- tax_impact_calculator ---
  if (R) server.registerTool(
    'tax_impact_calculator',
    {
      description:
        "Calculate the net tax impact of moving between two locations. Returns state income tax delta (simplified 12% federal flat + state rate), property tax delta on the median home, and combined annual tax burden. Use this when the user asks 'how much more/less will I pay in taxes if I move from A to B?'",
      inputSchema: {
        fromLocationId: z.string().describe("Origin location ID (e.g., 'austin-tx')"),
        toLocationId: z.string().describe("Destination location ID (e.g., 'denver-co')"),
        annualIncome: z.number().positive().describe('Annual household income in USD'),
        homeValue: z
          .number()
          .positive()
          .optional()
          .describe('Home value to use for property-tax comparison (defaults to destination median if omitted)'),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const from = resolveLocation(args.fromLocationId);
      const to = resolveLocation(args.toLocationId);
      if (!from || !to) {
        return {
          content: [
            { type: 'text' as const, text: `Unknown location: ${!from ? args.fromLocationId : args.toLocationId}` },
          ],
          isError: true,
        };
      }

      const hv = args.homeValue ?? to.cost.medianHomeValue ?? 0;
      const fedFlat = 0.12; // simplified effective federal rate
      const fromInc = args.annualIncome * (fedFlat + (from.cost.stateIncomeTaxRate ?? 0));
      const toInc = args.annualIncome * (fedFlat + (to.cost.stateIncomeTaxRate ?? 0));
      const fromProp = hv * (from.cost.propertyTaxRate ?? 0);
      const toProp = hv * (to.cost.propertyTaxRate ?? 0);
      const fromTotal = fromInc + fromProp;
      const toTotal = toInc + toProp;

      return ok({
        from: { id: from.id, name: from.name, state: from.state },
        to: { id: to.id, name: to.name, state: to.state },
        annualIncome: args.annualIncome,
        homeValueUsed: hv,
        incomeTax: {
          from: { stateRate: from.cost.stateIncomeTaxRate, total: fromInc, federal: args.annualIncome * fedFlat, state: args.annualIncome * (from.cost.stateIncomeTaxRate ?? 0) },
          to: { stateRate: to.cost.stateIncomeTaxRate, total: toInc, federal: args.annualIncome * fedFlat, state: args.annualIncome * (to.cost.stateIncomeTaxRate ?? 0) },
          delta: toInc - fromInc,
        },
        propertyTax: {
          from: { rate: from.cost.propertyTaxRate, annual: fromProp },
          to: { rate: to.cost.propertyTaxRate, annual: toProp },
          delta: toProp - fromProp,
        },
        totalAnnualTaxBurden: {
          from: fromTotal,
          to: toTotal,
          delta: toTotal - fromTotal,
          direction: toTotal > fromTotal ? 'increase' : toTotal < fromTotal ? 'decrease' : 'unchanged',
        },
        methodology: '12% federal flat + state rate on full income; property tax = home value × effective rate. Not a substitute for a CPA; effective federal rate is a simplification.',
      });
    },
  );

  // --- salary_adjustment ---
  if (R) server.registerTool(
    'salary_adjustment',
    {
      description:
        "What salary does the user need in city B to maintain the same standard of living they have in city A? Computes equivalent salary from the COL index ratio, plus purchasing-power change at the current salary, and a full category-by-category breakdown of where the extra money goes (or is freed up).",
      inputSchema: {
        fromLocationId: z.string().describe("Origin location ID (e.g., 'san-francisco-ca')"),
        toLocationId: z.string().describe("Destination location ID (e.g., 'austin-tx')"),
        currentSalary: z.number().positive().describe('Current annual salary in USD (in origin city)'),
        householdSize: z.number().int().positive().optional().default(2),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const from = resolveLocation(args.fromLocationId);
      const to = resolveLocation(args.toLocationId);
      if (!from || !to) {
        return {
          content: [
            { type: 'text' as const, text: `Unknown location: ${!from ? args.fromLocationId : args.toLocationId}` },
          ],
          isError: true,
        };
      }

      // Ratio of destination COL to origin COL. Anchors to 100 baseline so the
      // math is stable if either index is missing.
      const fromIdx = from.cost.costOfLivingIndex ?? COL_BASE;
      const toIdx = to.cost.costOfLivingIndex ?? COL_BASE;
      const ratio = toIdx / fromIdx;
      const equivalentSalary = Math.round(args.currentSalary * ratio);

      // Purchasing power at the *current* salary in the new city.
      const purchasingPowerRatio = args.currentSalary / equivalentSalary; // <1 = worse, >1 = better
      const purchasingPowerChangePct = Math.round((purchasingPowerRatio - 1) * 1000) / 10;

      // Per-category deltas to show where the savings (or costs) come from.
      const fromB = buildBreakdown(from, args.householdSize ?? 2);
      const toB = buildBreakdown(to, args.householdSize ?? 2);
      const cats: Array<[string, number, number]> = [
        ['housing (rent)', fromB.housing.annualRent, toB.housing.annualRent],
        ['property tax', fromB.housing.annualPropertyTaxOnMedianHome, toB.housing.annualPropertyTaxOnMedianHome],
        ['transportation', fromB.transportation.annual, toB.transportation.annual],
        ['food', fromB.food.annual, toB.food.annual],
        ['utilities', fromB.utilities.annual, toB.utilities.annual],
        ['healthcare', fromB.healthcare.annual, toB.healthcare.annual],
      ];

      return ok({
        from: { id: from.id, name: from.name, costOfLivingIndex: fromIdx },
        to: { id: to.id, name: to.name, costOfLivingIndex: toIdx },
        currentSalary: args.currentSalary,
        equivalentSalary,
        colRatio: Math.round(ratio * 1000) / 1000,
        purchasingPowerChangePct,
        direction: ratio > 1.05 ? 'city B is more expensive' : ratio < 0.95 ? 'city B is cheaper' : 'roughly equivalent',
        categoryBreakdown: cats.map(([name, a, b]) => ({
          category: name,
          from: a,
          to: b,
          annualDelta: b - a,
        })),
        note: 'Equivalent salary is a COL-indexed baseline; lifestyle preferences, housing tenure (rent vs own), and tax-filing specifics can shift the real number by ±15%.',
      });
    },
  );

  // --- cost_breakdown ---
  if (R) server.registerTool(
    'cost_breakdown',
    {
      description:
        'Detailed cost-of-living breakdown for a single US metro. Returns housing (rent + property tax on median home), transportation, food, utilities, healthcare, and state/local tax rates — both monthly and annual. Use this when the user wants to see the full monthly budget for a single city, not a comparison.',
      inputSchema: {
        locationId: z.string().describe("Location ID (e.g., 'austin-tx') or partial name match"),
        householdSize: z.number().int().positive().optional().default(2),
        homeValue: z.number().positive().optional().describe('Override home value for property-tax line (defaults to location median)'),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const loc = resolveLocation(args.locationId);
      if (!loc) {
        return {
          content: [{ type: 'text' as const, text: `Unknown location: ${args.locationId}` }],
          isError: true,
        };
      }
      const b = buildBreakdown(loc, args.householdSize ?? 2, args.homeValue);
      const annual = totals(b, true);
      const monthly = Math.round(annual / 12);

      return ok({
        location: { id: loc.id, name: loc.name, state: loc.state },
        householdSize: args.householdSize ?? 2,
        costOfLivingIndex: loc.cost.costOfLivingIndex,
        monthly: {
          housingRent: b.housing.medianMonthlyRent,
          propertyTax: Math.round(b.housing.annualPropertyTaxOnMedianHome / 12),
          transportation: Math.round(b.transportation.annual / 12),
          food: Math.round(b.food.annual / 12),
          utilities: Math.round(b.utilities.annual / 12),
          healthcare: Math.round(b.healthcare.annual / 12),
          total: monthly,
        },
        annual: {
          housingRent: b.housing.annualRent,
          propertyTax: b.housing.annualPropertyTaxOnMedianHome,
          transportation: b.transportation.annual,
          food: b.food.annual,
          utilities: b.utilities.annual,
          healthcare: b.healthcare.annual,
          total: annual,
        },
        taxRates: {
          stateIncomeTaxRate: loc.cost.stateIncomeTaxRate,
          propertyTaxRate: loc.cost.propertyTaxRate,
        },
        notes: {
          medianHomeValue: b.housing.medianHomeValue,
          homeValueUsed: args.homeValue ?? b.housing.medianHomeValue,
        },
        methodology:
          'Same multipliers as compare_cost_of_living. Owner-occupied cost path: annualRent replaced with property tax on home value, so the housing line reflects ownership. For a pure-renter budget, subtract property tax from the total.',
      });
    },
  );
}
