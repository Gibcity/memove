"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.journeyToolDefs = exports.adminToolDefs = exports.logisticsToolDefs = exports.communityToolDefs = exports.costToolDefs = exports.coreTools = exports.ALL_RELOCATION_TOOLS = void 0;
const zod_1 = require("zod");
const _shared_1 = require("./tools/_shared");
const locations_loader_1 = require("../nest/relocation/locations.loader");
// ponytail: shared schema pieces — re-used across multiple tool definitions so
// the registry stays flat. Inline definitions would scatter duplicate zod shapes.
const W = {
    cost: zod_1.z.number().int().min(0).max(5).optional(),
    climate: zod_1.z.number().int().min(0).max(5).optional(),
    safety: zod_1.z.number().int().min(0).max(5).optional(),
    healthcare: zod_1.z.number().int().min(0).max(5).optional(),
    jobs: zod_1.z.number().int().min(0).max(5).optional(),
    outdoors: zod_1.z.number().int().min(0).max(5).optional(),
};
const weights = zod_1.z.object(W).optional();
// ════════════════════════════════════════════════════════════════════════════
//  relocation.ts  (7 tools — core discovery / scoring / profile)
// ════════════════════════════════════════════════════════════════════════════
const relocationTools = [
    {
        name: 'search_locations',
        description: 'Search and filter US metro areas (939 CBSAs) by criteria like state, max home value, crime rate, disaster risk, climate. Returns matching locations with key metrics. Use this to narrow down candidates before scoring.',
        inputSchema: {
            states: zod_1.z.array(zod_1.z.string()).optional().describe("State codes to include (e.g., ['TX','FL','TN'])"),
            excludeStates: zod_1.z.array(zod_1.z.string()).optional().describe('State codes to exclude'),
            maxHomeValue: zod_1.z.number().optional().describe('Maximum median home value in USD'),
            maxRent: zod_1.z.number().optional().describe('Maximum median monthly rent in USD'),
            maxViolentCrime: zod_1.z.number().optional().describe('Maximum violent crime rate per 100k'),
            maxRiskTornado: zod_1.z.number().optional().describe('Maximum FEMA tornado risk score (0-100)'),
            maxRiskHurricane: zod_1.z.number().optional().describe('Maximum FEMA hurricane risk score'),
            maxRiskEarthquake: zod_1.z.number().optional().describe('Maximum FEMA earthquake risk score'),
            maxRiskWildfire: zod_1.z.number().optional().describe('Maximum FEMA wildfire risk score'),
            maxHotDays: zod_1.z.number().optional().describe('Max days >90°F per year'),
            maxColdDays: zod_1.z.number().optional().describe('Max days <32°F per year'),
            nameContains: zod_1.z.string().optional().describe('Filter by name (case-insensitive)'),
            limit: zod_1.z.number().int().positive().optional().default(20).describe('Max results to return'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (svc, args, _userId) => svc.relocation.searchLocations(args),
    },
    {
        name: 'score_locations',
        description: 'Rank all 939 US metro areas by weighted preferences (Multi-Criteria Decision Analysis). Pass category weights (0-5 each) and optional hard filters. Returns ranked matches with match scores (0-100), subscores per category, and explanation traces.',
        inputSchema: {
            weights: zod_1.z.object(W).optional().describe('Category weights (0=ignore, 5=critical). Defaults: cost=5, climate=4, safety=3, healthcare=3, jobs=3, outdoors=3.'),
            states: zod_1.z.array(zod_1.z.string()).optional().describe('State codes to include'),
            excludeStates: zod_1.z.array(zod_1.z.string()).optional().describe('State codes to exclude'),
            maxHomeValue: zod_1.z.number().optional(),
            maxRent: zod_1.z.number().optional(),
            maxRiskTornado: zod_1.z.number().optional(),
            maxRiskHurricane: zod_1.z.number().optional(),
            maxRiskEarthquake: zod_1.z.number().optional(),
            maxRiskWildfire: zod_1.z.number().optional(),
            maxHotDays: zod_1.z.number().optional(),
            maxColdDays: zod_1.z.number().optional(),
            limit: zod_1.z.number().int().positive().optional().default(20),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (svc, args, _userId) => svc.relocation.scoreLocations(args),
    },
    {
        name: 'compare_locations',
        description: "Compare 2 or more locations side-by-side across all dimensions (cost, climate, crime, healthcare, etc.) with a computed winner. Pass location IDs (e.g., 'austin-tx', 'denver-co'). Use search_locations first to find IDs.",
        inputSchema: {
            locationIds: zod_1.z.array(zod_1.z.string()).min(2).describe("Location IDs to compare (e.g., ['austin-tx','nashville-tn'])"),
            weights,
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (svc, args, _userId) => svc.relocation.compareLocations(args.locationIds, args.weights),
    },
    {
        name: 'explain_score',
        description: 'Get a detailed breakdown of WHY a location received its score — subscores per category, human-readable explanation trace, and which data fields are missing (0.0 sentinel). Useful for transparency and debugging rankings.',
        inputSchema: {
            locationId: zod_1.z.string().describe("Location ID (e.g., 'memphis-tn') or partial name match"),
            weights,
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (svc, args, _userId) => svc.relocation.explainScore(args.locationId, args.weights),
    },
    {
        name: 'fiscal_health',
        description: "Assess the fiscal health of a location's state — predicts FUTURE tax burden based on pension debt, tax trajectory, and fiscal tier. Answers: 'Will my taxes go up in 5 years because the state can't pay its bills?' Returns a fiscal health score (0-100), risk level, estimated tax increase over 10 years, and human-readable explanation. This is the platform's key differentiator.",
        inputSchema: {
            locationId: zod_1.z.string().describe("Location ID (e.g., 'chicago-il') or partial name match"),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (svc, args, _userId) => svc.relocation.fiscalHealth(args.locationId),
    },
    {
        name: 'update_relocation_profile',
        description: "Update the current user's relocation preferences — soft weights, hard filters, or stated priorities. These affect how locations are scored.",
        inputSchema: {
            softWeights: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).optional().describe('Metric → weight map (e.g., {"cost": 0.35, "climate": 0.25})'),
            hardFilters: zod_1.z
                .array(zod_1.z.object({
                field: zod_1.z.string(),
                operator: zod_1.z.enum(['lt', 'lte', 'gt', 'gte', 'eq', 'in', 'notIn']),
                value: zod_1.z.union([zod_1.z.number(), zod_1.z.string(), zod_1.z.array(zod_1.z.string())]),
                source: zod_1.z.enum(['stated', 'revealed']),
                confidence: zod_1.z.number(),
                discoveredAt: zod_1.z.string(),
            }))
                .optional(),
            statedPriorities: zod_1.z
                .array(zod_1.z.object({ metric: zod_1.z.string(), rank: zod_1.z.number(), weight: zod_1.z.number().optional() }))
                .optional(),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        scope: 'write',
        // ponytail: per-user write tool — handler signature is `(svc, args, userId?)`
        // and the MCP adapter passes userId through where scope-gated.
        handler: (svc, args, userId) => svc.relocation.upsertUserProfile(userId, args),
    },
    {
        name: 'get_relocation_profile',
        description: "Get the current user's relocation profile — preferences, hard filters, and elicitation state.",
        inputSchema: {},
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (svc, _args, userId) => ({ profile: svc.relocation.getUserProfile(userId) }),
    },
];
// ════════════════════════════════════════════════════════════════════════════
//  relocation_cost.ts  (4 tools — pure-function cost math)
// ════════════════════════════════════════════════════════════════════════════
const COL_BASE = 100;
function resolveLocation(idOrName) {
    const locs = (0, locations_loader_1.loadLocations)();
    const norm = idOrName.toLowerCase().trim();
    // ponytail: fuzzy lookup that tolerates "austin-tx" vs the full CBSA
    // "austin-round-rock-georgetown-tx". Strip a trailing -<state> token so
    // friendly aliases work.
    const shortMatch = norm.match(/^(.+)-([a-z]{2})$/);
    const cityPart = shortMatch ? shortMatch[1] : norm;
    const statePart = shortMatch ? shortMatch[2] : null;
    return (locs.find((l) => l.id === norm) ??
        locs.find((l) => norm === `${l.name.toLowerCase()}, ${l.state.toLowerCase()}`) ??
        locs.find((l) => l.id.startsWith(cityPart) &&
            (statePart === null || l.id.endsWith(`-${statePart}`))) ??
        locs.find((l) => l.name.toLowerCase() === norm) ??
        locs.find((l) => l.name.toLowerCase().includes(norm)) ??
        null);
}
// ponytail: pure-function cost math kept inline — no new file/module for it.
// These were originally co-located with the cost MCP tools; bringing them
// here keeps the chat path self-contained (no MCP dependency for math).
function annualPropertyTax(loc, homeValueOverride) {
    const hv = homeValueOverride ?? loc.cost?.medianHomeValue ?? 0;
    return hv * (loc.cost?.propertyTaxRate ?? 0);
}
function annualIncomeTax(income, stateRate) {
    return income * (0.12 + stateRate);
}
function annualTransportation(loc) {
    const monthly = 300 + (Math.min(Math.max(loc.cost?.costOfLivingIndex ?? COL_BASE, 70), 180) - 70) * 5.45;
    return Math.round(monthly) * 12;
}
function annualFood(loc, householdSize) {
    const adults = Math.max(1, Math.round(householdSize / 2));
    const monthlyBase = 400 + (Math.min(Math.max(loc.cost?.costOfLivingIndex ?? COL_BASE, 70), 180) - 70) * 8.18;
    return Math.round(monthlyBase * adults) * 12;
}
function annualUtilities(loc) {
    const extremes = (loc.climate?.daysMaxGt90FAnnual ?? 0) + (loc.climate?.daysMinLt32FAnnual ?? 0);
    const monthly = 150 + extremes * 0.6 + ((loc.cost?.costOfLivingIndex ?? COL_BASE) - COL_BASE) * 1.2;
    return Math.max(150, Math.round(monthly)) * 12;
}
function annualHealthcare(loc, householdSize) {
    const util = 1 + (loc.healthcare?.healthcareAccessScore ?? 50) / 200;
    const adults = Math.max(1, Math.round(householdSize / 2));
    return Math.round(6000 * util * adults);
}
function buildBreakdown(loc, householdSize, homeValueOverride) {
    const housingRent = (loc.cost?.medianRent ?? 0) * 12;
    const housingOwnerPropTax = annualPropertyTax(loc, homeValueOverride);
    return {
        locationId: loc.id,
        name: loc.name,
        state: loc.state,
        costOfLivingIndex: loc.cost?.costOfLivingIndex,
        householdSize,
        housing: {
            medianHomeValue: loc.cost?.medianHomeValue,
            medianMonthlyRent: loc.cost?.medianRent,
            annualRent: housingRent,
            annualPropertyTaxOnMedianHome: housingOwnerPropTax,
        },
        taxes: {
            stateIncomeTaxRate: loc.cost?.stateIncomeTaxRate,
            propertyTaxRate: loc.cost?.propertyTaxRate,
        },
        transportation: { annual: annualTransportation(loc) },
        food: { annual: annualFood(loc, householdSize) },
        utilities: { annual: annualUtilities(loc) },
        healthcare: { annual: annualHealthcare(loc, householdSize) },
    };
}
function totals(b, includeOwnerCosts) {
    return (b.housing.annualRent +
        (includeOwnerCosts ? b.housing.annualPropertyTaxOnMedianHome : 0) +
        b.transportation.annual +
        b.food.annual +
        b.utilities.annual +
        b.healthcare.annual);
}
const costTools = [
    {
        name: 'compare_cost_of_living',
        description: 'Deep cost-of-living comparison between 2+ US metros. Breaks down housing, taxes, transportation, food, utilities, and healthcare — both monthly and annual. Returns per-city totals and the deltas so the user can see exactly what changes if they move. Cost categories beyond housing/taxes are estimated from the COL index using standard BLS-style multipliers (see methodology field).',
        inputSchema: {
            locationIds: zod_1.z.array(zod_1.z.string()).min(2).describe("Location IDs to compare (e.g., ['austin-tx','nashville-tn'])"),
            householdIncome: zod_1.z.number().positive().optional().describe('Optional household income — enables income-tax line items in the breakdown'),
            householdSize: zod_1.z.number().int().positive().optional().default(2).describe('Household size for food/healthcare scaling (default 2)'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (_svc, args, _userId) => {
            const breakdown = {};
            const baseline = {};
            let baseKey = null;
            const ids = args.locationIds;
            for (const id of ids) {
                const loc = resolveLocation(id);
                if (!loc)
                    continue;
                const b = buildBreakdown(loc, args.householdSize ?? 2);
                const incTax = args.householdIncome
                    ? annualIncomeTax(args.householdIncome, loc.cost?.stateIncomeTaxRate ?? 0)
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
            const deltas = {};
            for (const [id, data] of Object.entries(breakdown)) {
                if (id === baseKey)
                    continue;
                const d = data;
                const base = breakdown[baseKey];
                deltas[id] = {
                    vsBase: baseKey,
                    annualTotalDelta: d.annualTotal - base.annualTotal,
                    housingDelta: d.housing.annualRent - baseline['housing'],
                    propertyTaxDelta: d.housing.annualPropertyTaxOnMedianHome - baseline['propertyTax'],
                    transportationDelta: d.transportation.annual - baseline['transportation'],
                    foodDelta: d.food.annual - baseline['food'],
                    utilitiesDelta: d.utilities.annual - baseline['utilities'],
                    healthcareDelta: d.healthcare.annual - baseline['healthcare'],
                    incomeTaxDelta: d.taxes.annualIncomeTaxEstimate - baseline['incomeTax'],
                };
            }
            return {
                baseline: baseKey,
                householdSize: args.householdSize ?? 2,
                householdIncome: args.householdIncome ?? null,
                locations: breakdown,
                deltas,
                methodology: 'Housing: median rent × 12 (renter path) + medianHomeValue × propertyTaxRate (owner path). Transportation: $300-800/mo scaled by COL index. Food: $400-1200/mo per 2 adults scaled by COL. Utilities: $150 base + climate extremes + COL. Healthcare: $6k/adult × utilization 1.0-1.5x from healthcareAccessScore. Income tax: 12% federal flat + state rate (simplified).',
            };
        },
    },
    {
        name: 'tax_impact_calculator',
        description: "Calculate the net tax impact of moving between two locations. Returns state income tax delta (simplified 12% federal flat + state rate), property tax delta on the median home, and combined annual tax burden.",
        inputSchema: {
            fromLocationId: zod_1.z.string().describe("Origin location ID (e.g., 'austin-tx')"),
            toLocationId: zod_1.z.string().describe("Destination location ID (e.g., 'denver-co')"),
            annualIncome: zod_1.z.number().positive().describe('Annual household income in USD'),
            homeValue: zod_1.z.number().positive().optional().describe('Home value to use for property-tax comparison (defaults to destination median if omitted)'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (_svc, args, _userId) => {
            const from = resolveLocation(args.fromLocationId);
            const to = resolveLocation(args.toLocationId);
            if (!from || !to) {
                return { __error: `Unknown location: ${!from ? args.fromLocationId : args.toLocationId}` };
            }
            const hv = args.homeValue ?? to.cost?.medianHomeValue ?? 0;
            const fedFlat = 0.12;
            const income = args.annualIncome;
            const fromInc = income * (fedFlat + (from.cost?.stateIncomeTaxRate ?? 0));
            const toInc = income * (fedFlat + (to.cost?.stateIncomeTaxRate ?? 0));
            const fromProp = hv * (from.cost?.propertyTaxRate ?? 0);
            const toProp = hv * (to.cost?.propertyTaxRate ?? 0);
            const fromTotal = fromInc + fromProp;
            const toTotal = toInc + toProp;
            return {
                from: { id: from.id, name: from.name, state: from.state },
                to: { id: to.id, name: to.name, state: to.state },
                annualIncome: income,
                homeValueUsed: hv,
                incomeTax: {
                    from: { stateRate: from.cost?.stateIncomeTaxRate, total: fromInc, federal: income * fedFlat, state: income * (from.cost?.stateIncomeTaxRate ?? 0) },
                    to: { stateRate: to.cost?.stateIncomeTaxRate, total: toInc, federal: income * fedFlat, state: income * (to.cost?.stateIncomeTaxRate ?? 0) },
                    delta: toInc - fromInc,
                },
                propertyTax: {
                    from: { rate: from.cost?.propertyTaxRate, annual: fromProp },
                    to: { rate: to.cost?.propertyTaxRate, annual: toProp },
                    delta: toProp - fromProp,
                },
                totalAnnualTaxBurden: {
                    from: fromTotal,
                    to: toTotal,
                    delta: toTotal - fromTotal,
                    direction: toTotal > fromTotal ? 'increase' : toTotal < fromTotal ? 'decrease' : 'unchanged',
                },
                methodology: '12% federal flat + state rate on full income; property tax = home value × effective rate. Not a substitute for a CPA; effective federal rate is a simplification.',
            };
        },
    },
    {
        name: 'salary_adjustment',
        description: 'What salary does the user need in city B to maintain the same standard of living they have in city A?',
        inputSchema: {
            fromLocationId: zod_1.z.string().describe("Origin location ID (e.g., 'san-francisco-ca')"),
            toLocationId: zod_1.z.string().describe("Destination location ID (e.g., 'austin-tx')"),
            currentSalary: zod_1.z.number().positive().describe('Current annual salary in USD (in origin city)'),
            householdSize: zod_1.z.number().int().positive().optional().default(2),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (_svc, args, _userId) => {
            const from = resolveLocation(args.fromLocationId);
            const to = resolveLocation(args.toLocationId);
            if (!from || !to) {
                return { __error: `Unknown location: ${!from ? args.fromLocationId : args.toLocationId}` };
            }
            const fromIdx = from.cost?.costOfLivingIndex ?? COL_BASE;
            const toIdx = to.cost?.costOfLivingIndex ?? COL_BASE;
            const ratio = toIdx / fromIdx;
            const currentSalary = args.currentSalary;
            const equivalentSalary = Math.round(currentSalary * ratio);
            const purchasingPowerRatio = currentSalary / equivalentSalary;
            const purchasingPowerChangePct = Math.round((purchasingPowerRatio - 1) * 1000) / 10;
            const householdSize = args.householdSize ?? 2;
            const fromB = buildBreakdown(from, householdSize);
            const toB = buildBreakdown(to, householdSize);
            const cats = [
                ['housing (rent)', fromB.housing.annualRent, toB.housing.annualRent],
                ['property tax', fromB.housing.annualPropertyTaxOnMedianHome, toB.housing.annualPropertyTaxOnMedianHome],
                ['transportation', fromB.transportation.annual, toB.transportation.annual],
                ['food', fromB.food.annual, toB.food.annual],
                ['utilities', fromB.utilities.annual, toB.utilities.annual],
                ['healthcare', fromB.healthcare.annual, toB.healthcare.annual],
            ];
            return {
                from: { id: from.id, name: from.name, costOfLivingIndex: fromIdx },
                to: { id: to.id, name: to.name, costOfLivingIndex: toIdx },
                currentSalary,
                equivalentSalary,
                colRatio: Math.round(ratio * 1000) / 1000,
                purchasingPowerChangePct,
                direction: ratio > 1.05 ? 'city B is more expensive' : ratio < 0.95 ? 'city B is cheaper' : 'roughly equivalent',
                categoryBreakdown: cats.map(([name, a, b]) => ({ category: name, from: a, to: b, annualDelta: b - a })),
                note: 'Equivalent salary is a COL-indexed baseline; lifestyle preferences, housing tenure (rent vs own), and tax-filing specifics can shift the real number by ±15%.',
            };
        },
    },
    {
        name: 'cost_breakdown',
        description: 'Detailed cost-of-living breakdown for a single US metro.',
        inputSchema: {
            locationId: zod_1.z.string().describe("Location ID (e.g., 'austin-tx') or partial name match"),
            householdSize: zod_1.z.number().int().positive().optional().default(2),
            homeValue: zod_1.z.number().positive().optional().describe('Override home value for property-tax line (defaults to location median)'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (_svc, args, _userId) => {
            const loc = resolveLocation(args.locationId);
            if (!loc)
                return { __error: `Unknown location: ${args.locationId}` };
            const householdSize = args.householdSize ?? 2;
            const b = buildBreakdown(loc, householdSize, args.homeValue);
            const annual = totals(b, true);
            const monthly = Math.round(annual / 12);
            return {
                location: { id: loc.id, name: loc.name, state: loc.state },
                householdSize,
                costOfLivingIndex: loc.cost?.costOfLivingIndex,
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
                    stateIncomeTaxRate: loc.cost?.stateIncomeTaxRate,
                    propertyTaxRate: loc.cost?.propertyTaxRate,
                },
                notes: {
                    medianHomeValue: b.housing.medianHomeValue,
                    homeValueUsed: args.homeValue ?? b.housing.medianHomeValue,
                },
                methodology: 'Same multipliers as compare_cost_of_living. Owner-occupied cost path: annualRent replaced with property tax on home value, so the housing line reflects ownership. For a pure-renter budget, subtract property tax from the total.',
            };
        },
    },
];
// ════════════════════════════════════════════════════════════════════════════
//  relocation_community.ts  (4 tools — settlement / community fit)
// ════════════════════════════════════════════════════════════════════════════
const COMMUNITY_NATIONAL_AVG = {
    lifeExpectancy: 78.5,
    adultObesityPct: 33.6,
    adultSmokingPct: 11.5,
    poorMentalHealthDays: 4.0,
    primaryCarePhysiciansPer100k: 75.0,
};
const SPECIALTY_GUIDANCE = {
    pediatrics: "Pediatricians cluster near hospital systems; verify the nearest children's hospital and confirm in-network status with your insurance.",
    cardiology: 'Look for an ACC-accredited chest pain center or a hospital with a cath lab. Cardiologists follow tertiary centers, not just any clinic.',
    mental_health: 'Psychiatrist supply is constrained nationally — expect 4-8 week wait times for new patients. Check Psychology Today and Zocdoc for in-network therapists.',
    maternity: 'Confirm a Level II or III NICU at the nearest hospital if any pregnancy risk exists. Midwife-friendly birth centers matter for low-risk pregnancies.',
    geriatrics: 'Board-certified geriatricians are rare (~1 per 3,000 seniors). Look for a geriatrics consult service at a university-affiliated hospital.',
};
const LIFESTYLE_WEIGHTS = {
    family_oriented: { upwardMobility: 30, healthcare: 25, lifeExpectancy: 25, recreation: 20 },
    young_professional: { broadband: 25, transit: 20, healthcare: 15, affordability: 40 },
    retiree: { healthcare: 35, lifeExpectancy: 25, affordability: 20, commute: 20 },
    outdoor_enthusiast: { sunshine: 25, natureAreas: 30, recreation: 20, lowPrecipitation: 25 },
    arts_culture: { populationProxy: 30, healthcare: 15, broadband: 15, upwardMobility: 40 },
    foodie: { grocery: 30, populationProxy: 30, recreation: 20, upwardMobility: 20 },
};
const communityTools = [
    {
        name: 'assess_healthcare_access',
        description: 'Detailed healthcare access analysis for a location — hospital density, physician supply, life expectancy vs national average, and specialist-specific guidance.',
        inputSchema: {
            locationId: zod_1.z.string().describe("Location ID (e.g., 'austin-tx') or partial name match"),
            specialty: zod_1.z.enum(['pediatrics', 'cardiology', 'mental_health', 'maternity', 'geriatrics']).optional().describe('Optional specialty to get targeted guidance for'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (svc, args, _userId) => {
            const loc = svc.relocation.getLocationById(args.locationId);
            if (!loc)
                return { __error: `Location not found: ${args.locationId}` };
            const hc = loc.healthcare;
            const ho = loc.healthOutcomes;
            const delta = ho?.lifeExpectancy > 0 ? (ho.lifeExpectancy - COMMUNITY_NATIONAL_AVG.lifeExpectancy).toFixed(1) : null;
            const specialtyNote = args.specialty ? SPECIALTY_GUIDANCE[args.specialty] : null;
            return {
                location: { id: loc.id, name: loc.name, state: loc.state },
                accessScore: hc?.healthcareAccessScore,
                hospitalCountWithin10mi: hc?.hospitalCountWithin10mi,
                primaryCarePhysiciansPer100k: ho?.primaryCarePhysiciansPer100k,
                primaryCareDelta: ho?.primaryCarePhysiciansPer100k > 0 ? Math.round(ho.primaryCarePhysiciansPer100k - COMMUNITY_NATIONAL_AVG.primaryCarePhysiciansPer100k) : null,
                lifeExpectancy: ho?.lifeExpectancy,
                lifeExpectancyVsNational: delta,
                healthOutcomes: {
                    adultObesityPct: ho?.adultObesityPct,
                    obesityVsNational: ho?.adultObesityPct > 0 ? `${(ho.adultObesityPct - COMMUNITY_NATIONAL_AVG.adultObesityPct).toFixed(1)} pts` : null,
                    adultSmokingPct: ho?.adultSmokingPct,
                    smokingVsNational: ho?.adultSmokingPct > 0 ? `${(ho.adultSmokingPct - COMMUNITY_NATIONAL_AVG.adultSmokingPct).toFixed(1)} pts` : null,
                    poorMentalHealthDays: ho?.poorMentalHealthDays,
                },
                specialistGuidance: specialtyNote,
            };
        },
    },
    {
        name: 'school_district_overview',
        description: 'School quality overview for a location. Uses upward mobility data as a community-investment proxy and points the user to authoritative sources (GreatSchools, Niche, district sites).',
        inputSchema: {
            locationId: zod_1.z.string().describe("Location ID (e.g., 'austin-tx') or partial name match"),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (svc, args, _userId) => {
            const loc = svc.relocation.getLocationById(args.locationId);
            if (!loc)
                return { __error: `Location not found: ${args.locationId}` };
            const m = loc.mobility;
            const ho = loc.healthOutcomes;
            const amen = loc.amenities;
            const reconIndicator = m.mobilityPercentile >= 75 ? 'Strong' : m.mobilityPercentile >= 50 ? 'Average' : m.mobilityPercentile > 0 ? 'Below average' : 'No data';
            const fmtPct = m.mobilityPercentile > 0 && Number.isFinite(m.upwardMobilityScore)
                ? `Kids from this area reaching top income quintile: ${m.upwardMobilityScore.toFixed(1)} (${m.mobilityPercentile}th percentile)`
                : 'Kids from this area reaching top income quintile: no data';
            return {
                location: { id: loc.id, name: loc.name, state: loc.state },
                mobility: {
                    upwardMobilityScore: m.upwardMobilityScore,
                    percentile: m.mobilityPercentile,
                    interpretation: fmtPct,
                    proxyFor: `Higher mobility correlates with stronger public-school investment, lower child poverty, and broader community resources. ${reconIndicator} (vs other US metros)`,
                },
                communityHealthProxy: {
                    lifeExpectancy: ho.lifeExpectancy,
                    poorMentalHealthDays: ho.poorMentalHealthDays,
                    interpretation: 'Long life expectancy and low poor-mental-health days correlate with well-resourced community services, including schools.',
                },
                amenityAccess: {
                    recreationAreaCount: amen.recreationAreaCount,
                    interpretation: 'Recreation area count is a proxy for parks, libraries, and after-school programming access.',
                },
                nextSteps: [
                    'Look up the assigned school district on GreatSchools.org for rating + test scores.',
                    'Cross-check Niche.com for parent reviews and demographic breakdowns.',
                    'Visit the district website for enrollment deadlines and boundary maps.',
                    'Contact the district directly for special-education / IEP transfer logistics.',
                    'Verify school assignment by address — district lines rarely match the CBSA boundary.',
                ],
            };
        },
    },
    {
        name: 'community_fit_analysis',
        description: "Analyze how well a location fits a stated lifestyle — family_oriented, young_professional, retiree, outdoor_enthusiast, arts_culture, foodie.",
        inputSchema: {
            locationId: zod_1.z.string().describe("Location ID (e.g., 'austin-tx') or partial name match"),
            lifestyle: zod_1.z.enum(['family_oriented', 'young_professional', 'retiree', 'outdoor_enthusiast', 'arts_culture', 'foodie']),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (svc, args, _userId) => {
            const loc = svc.relocation.getLocationById(args.locationId);
            if (!loc)
                return { __error: `Location not found: ${args.locationId}` };
            const lifestyle = args.lifestyle;
            const ho = loc.healthOutcomes;
            const trans = loc.transportation;
            const amen = loc.amenities;
            const climate = loc.climate;
            const hc = loc.healthcare;
            const strengths = [];
            const weaknesses = [];
            function add(cond, hit, miss) {
                (cond ? strengths : weaknesses).push(cond ? hit : miss);
            }
            const dims = {};
            switch (lifestyle) {
                case 'family_oriented': {
                    dims.upwardMobility = loc.mobility.mobilityPercentile;
                    dims.healthcare = hc.healthcareAccessScore;
                    dims.lifeExpectancy = ho.lifeExpectancy > 0 ? ho.lifeExpectancy * 1.2 : 0;
                    dims.recreation = Math.min(100, amen.recreationAreaCount * 4);
                    add(loc.mobility.mobilityPercentile >= 75, 'Strong upward mobility — kids from here tend to do well economically.', 'Average or below-average upward mobility; investigate school quality directly.');
                    add(hc.healthcareAccessScore >= 70, 'Solid healthcare access for routine family care.', 'Limited healthcare access — pediatrician availability may be tight.');
                    add(ho.poorMentalHealthDays > 0 && ho.poorMentalHealthDays <= 4, 'Community mental health is in the healthy range.', 'Higher-than-average poor mental health days — factor in family services access.');
                    break;
                }
                case 'young_professional': {
                    dims.broadband = loc.broadband.pctHouseholdsWith100MbpsPlus;
                    dims.transit = trans.pctTransitCommute * 100 + trans.pctRemoteWork * 2;
                    dims.healthcare = hc.healthcareAccessScore;
                    dims.affordability = Math.max(0, 100 - loc.cost.costOfLivingIndex);
                    add(loc.broadband.pctHouseholdsWith100MbpsPlus >= 85, 'Excellent broadband — remote-work and streaming ready.', 'Weaker broadband; check address-level speeds before committing.');
                    add(trans.pctRemoteWork >= 12 || trans.avgCommuteMinutes <= 22, 'Commute patterns skew remote or short — better work-life balance.', 'Long average commutes or low remote work — factor in transit quality of life.');
                    add(loc.cost.medianRent > 0 && loc.cost.medianRent <= 1300, 'Rent is approachable for a single professional income.', 'Rent is high relative to national median — roommates likely needed.');
                    break;
                }
                case 'retiree': {
                    dims.healthcare = hc.healthcareAccessScore;
                    dims.lifeExpectancy = ho.lifeExpectancy > 0 ? ho.lifeExpectancy * 1.2 : 0;
                    dims.affordability = Math.max(0, 100 - loc.cost.costOfLivingIndex);
                    dims.commute = trans.pctTransitCommute >= 2 ? 80 : 50;
                    add(hc.hospitalCountWithin10mi >= 3, 'Multiple hospitals within 10 miles — strong specialty + emergency coverage.', 'Few hospitals nearby — important for specialist + ER access.');
                    add(ho.lifeExpectancy >= COMMUNITY_NATIONAL_AVG.lifeExpectancy, 'Life expectancy above national average — community supports aging well.', 'Life expectancy below national average — investigate why (healthcare, environment).');
                    add(trans.pctTransitCommute >= 2, 'Some transit presence — useful for older drivers giving up the car.', 'Auto-dependent — plan for the transition off driving.');
                    break;
                }
                case 'outdoor_enthusiast': {
                    dims.sunshine = climate.sunshineHoursAnnual > 0 ? Math.min(100, climate.sunshineHoursAnnual / 32) : 0;
                    dims.natureAreas = Math.min(100, amen.natureAreaCount * 5);
                    dims.recreation = Math.min(100, amen.recreationAreaCount * 4);
                    dims.lowPrecipitation = climate.annualPrecipitationInches > 0 ? Math.max(0, 100 - climate.annualPrecipitationInches * 2) : 50;
                    add(amen.natureAreaCount >= 8, 'Strong nature-area count — hiking/wildlife nearby.', 'Limited nature areas; expect to drive for trail access.');
                    add(climate.sunshineHoursAnnual >= 2500, 'High sunshine hours — year-round outdoor options.', 'Low sunshine — seasonal mood and outdoor time restrictions likely.');
                    add(climate.annualPrecipitationInches <= 30, 'Lower precipitation — fewer washout days.', 'Heavy precipitation — outdoor hobbies get rained out regularly.');
                    break;
                }
                case 'arts_culture': {
                    dims.populationProxy = Math.max(0, 100 - loc.cost.costOfLivingIndex);
                    dims.healthcare = hc.healthcareAccessScore;
                    dims.broadband = loc.broadband.pctHouseholdsWith100MbpsPlus;
                    dims.upwardMobility = loc.mobility.mobilityPercentile;
                    add(loc.cost.costOfLivingIndex >= 100, 'Cost of living above national average — usually correlates with amenity-rich metro areas.', 'Lower cost-of-living area may mean less dense cultural scene — verify directly.');
                    add(loc.mobility.mobilityPercentile >= 60, 'Community-investment proxies are healthy — supports cultural institutions.', 'Mixed community-investment signals — research specific venues and museums.');
                    add(amen.recreationAreaCount >= 10, 'Strong recreation-area count — often tracks with public spaces and event venues.', 'Lower recreation density — cultural amenities likely more limited.');
                    weaknesses.push('No direct arts/culture index available — verify with Niche.com, local magazines, and event calendars before committing.');
                    break;
                }
                case 'foodie': {
                    dims.grocery = Math.min(100, amen.groceryStoreDensityPerCapita * 50);
                    dims.populationProxy = Math.max(0, 100 - loc.cost.costOfLivingIndex);
                    dims.recreation = Math.min(100, amen.recreationAreaCount * 4);
                    dims.upwardMobility = loc.mobility.mobilityPercentile;
                    add(amen.groceryStoreDensityPerCapita >= 1.5, 'Strong grocery-store density — usually tracks with diverse restaurants.', 'Sparse grocery density — restaurant scene may also be limited.');
                    add(amen.bigBoxStoreCount >= 6, 'Multiple big-box stores nearby — strong retail + food infrastructure.', 'Few big-box retailers — retail/food variety may be thinner.');
                    weaknesses.push('No restaurant-scene index available — cross-reference Yelp, Eater, and local food blogs.');
                    break;
                }
            }
            const w = LIFESTYLE_WEIGHTS[lifestyle];
            let scoreSum = 0;
            let weightSum = 0;
            for (const [k, weight] of Object.entries(w)) {
                scoreSum += Math.max(0, Math.min(100, dims[k] ?? 0)) * weight;
                weightSum += weight;
            }
            const matchScore = weightSum > 0 ? Math.round(scoreSum / weightSum) : 0;
            return {
                location: { id: loc.id, name: loc.name, state: loc.state },
                lifestyle,
                matchScore,
                subscores: dims,
                strengths,
                weaknesses,
                caveat: 'Heuristic fit based on platform data only. Confirm cultural fit through visits, local conversations, and (for arts_culture/foodie) venue/event research.',
            };
        },
    },
    {
        name: 'settlement_checklist',
        description: 'Post-move settlement checklist for the first 30 days — healthcare, community, services, and (optionally) family + pet tasks.',
        inputSchema: {
            toLocationId: zod_1.z.string().describe("Location ID of the new city/metro (e.g., 'austin-tx')"),
            hasChildren: zod_1.z.boolean().optional().describe('Include family-schooling tasks'),
            hasPets: zod_1.z.boolean().optional().describe('Include pet care tasks'),
            employmentType: zod_1.z.enum(['remote', 'hybrid', 'in_person', 'self_employed', 'unemployed']).optional().describe('Modifies services section (work setup, commute)'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (svc, args, _userId) => {
            const loc = svc.relocation.getLocationById(args.toLocationId);
            if (!loc)
                return { __error: `Location not found: ${args.toLocationId}` };
            const hc = loc.healthcare;
            const amen = loc.amenities;
            const trans = loc.transportation;
            const checklist = {
                destination: { id: loc.id, name: loc.name, state: loc.state },
                healthcare: {
                    why: `${hc.hospitalCountWithin10mi} hospitals within 10 miles; access score ${hc.healthcareAccessScore}/100.`,
                    tasks: [
                        'Find a primary care physician accepting new patients (Zocdoc, insurance portal).',
                        'Find a dentist — confirm in-network status.',
                        'Transfer prescriptions to a local pharmacy on day one.',
                        'Locate the nearest urgent care and ER (not the same as the nearest hospital).',
                        `Verify health insurance coverage in ${loc.state} — network may differ.`,
                    ],
                },
                community: {
                    tasks: [
                        'Register to vote (deadline often 30 days before the next election).',
                        `Update driver's license at the ${loc.state} DMV within the state-required window (often 30-90 days).`,
                        'Register the vehicle with the state (if moving from out of state).',
                        'Find the nearest library + community center.',
                        `Look up ${amen.recreationAreaCount} local recreation areas — parks are the fastest path to neighbors.`,
                    ],
                },
                services: {
                    tasks: [
                        'Open a local bank account (easier bill pay + escrow + utilities).',
                        'Set up utilities: power, gas, water, trash, internet.',
                        `Identify the closest grocery stores (density score ${amen.groceryStoreDensityPerCapita.toFixed(2)} per capita indicates supply).`,
                        'Find a gym or fitness studio — many offer first-month deals.',
                        'Forward mail via USPS Change of Address (start date = move-in day).',
                        'Transfer homeowner/renter insurance to the new state.',
                    ],
                },
            };
            if (args.hasChildren) {
                checklist.family = {
                    tasks: [
                        'Enroll kids in school — district-by-address; verify boundaries before signing a lease.',
                        'Find a pediatrician accepting new patients.',
                        'Request immunization records transfer from the previous school/pediatrician.',
                        'Locate after-school programs and youth sports leagues.',
                        'Find pediatric urgent care hours (most cities have dedicated pediatric ER lines).',
                        'Register for childcare waitlists EARLY — even before the move.',
                    ],
                };
            }
            if (args.hasPets) {
                checklist.pets = {
                    tasks: [
                        `Find a local veterinarian — confirm ${loc.state} rabies certificate requirements.`,
                        'Register the pet with the city/county if required (some cities mandate this within 30 days).',
                        'Locate the nearest 24/7 emergency vet hospital.',
                        'Find dog parks and off-leash areas via BringFido and Sniffspot.',
                        'Update microchip registration with the new address.',
                        `Confirm leash + vaccination laws in ${loc.state} / county.`,
                    ],
                };
            }
            if (args.employmentType) {
                const kind = args.employmentType;
                const empTasks = [];
                if (kind === 'remote') {
                    empTasks.push(`Set up a dedicated home office — broadband at ${trans.pctRemoteWork.toFixed(1)}% of households, verify at your exact address.`);
                    empTasks.push('Update address with employer + payroll + tax withholding state.');
                    empTasks.push('File a new state tax return if moving from a different state (depends on reciprocity).');
                }
                else if (kind === 'hybrid') {
                    empTasks.push(`Average commute is ${trans.avgCommuteMinutes.toFixed(1)} minutes — check your specific route, not the average.`);
                    empTasks.push('Decide transit vs. driving — pctTransitCommute tells you realistic alternatives.');
                    empTasks.push("Confirm employer's in-office days and set up a routine around them.");
                }
                else if (kind === 'in_person') {
                    empTasks.push(`Average commute is ${trans.avgCommuteMinutes.toFixed(1)} minutes — sample it 3+ times at different hours before committing.`);
                    empTasks.push('Identify backup commute routes (most metros have 2 viable options).');
                    empTasks.push('Open a workplace-adjacent locker or mail service if traffic is unreliable.');
                }
                else if (kind === 'self_employed') {
                    empTasks.push('Register a business entity in the new state (LLC, sole prop, etc.).');
                    empTasks.push('Update EIN records + business licenses.');
                    empTasks.push('Set up a registered agent if forming an LLC in the new state.');
                    empTasks.push("Find a CPA familiar with the destination state's tax structure.");
                }
                else if (kind === 'unemployed') {
                    empTasks.push("Register with the state's unemployment/job service office.");
                    empTasks.push('Update LinkedIn + job-search site locations to the new metro.');
                    empTasks.push('Identify co-working spaces for interview prep + outbound work.');
                }
                checklist.services.tasks.push(...empTasks);
            }
            return checklist;
        },
    },
];
// ════════════════════════════════════════════════════════════════════════════
//  relocation_logistics.ts  (4 tools — moving planner + estimator + utilities)
// ════════════════════════════════════════════════════════════════════════════
// ponytail: inline haversine; one call per estimate, accuracy > a util import.
function haversineMiles(a, b) {
    const R = 3958.8;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
const LOGISTICS_PHASES = [
    { name: '8_weeks', label: '8 Weeks Out', description: 'Initial research and planning' },
    { name: '6_weeks', label: '6 Weeks Out', description: 'Book movers and start logistics' },
    { name: '4_weeks', label: '4 Weeks Out', description: 'Packing and address changes' },
    { name: '2_weeks', label: '2 Weeks Out', description: 'Finalize logistics and admin' },
    { name: '1_week', label: '1 Week Out', description: 'Last-minute preparations' },
    { name: 'moving_day', label: 'Moving Day', description: 'Execute the move' },
    { name: 'post_move', label: 'Post-Move (1-4 weeks)', description: 'Settling in and registration' },
];
const TASK_TEMPLATES = [
    { id: 'declutter', phase: '8_weeks', title: 'Declutter and donate', description: 'Sort belongings into keep, donate, and discard piles.', dueOffsetDays: -56, category: 'logistics' },
    { id: 'research_movers', phase: '8_weeks', title: 'Research moving companies', description: 'Read reviews on BBB, Google, and Yelp.', dueOffsetDays: -56, category: 'logistics' },
    { id: 'create_budget', phase: '8_weeks', title: 'Create moving budget', description: 'Use estimate_moving_costs to set a realistic total budget.', dueOffsetDays: -54, category: 'financial' },
    { id: 'inventory', phase: '8_weeks', title: 'Take inventory of belongings', description: 'Photograph and list high-value items for insurance.', dueOffsetDays: -52, category: 'logistics' },
    { id: 'school_research', phase: '8_weeks', title: 'Research schools in destination', description: 'Identify zoned schools, check ratings.', dueOffsetDays: -50, category: 'admin', condition: (o) => o.hasChildren },
    { id: 'get_quotes', phase: '6_weeks', title: 'Get 3 moving quotes', description: 'Get in-home or video estimates from at least 3 movers.', dueOffsetDays: -42, category: 'logistics' },
    { id: 'book_movers', phase: '6_weeks', title: 'Book moving company', description: 'Lock in the date with a written contract.', dueOffsetDays: -40, category: 'logistics', condition: (o) => o.movingType !== 'diy' },
    { id: 'reserve_truck', phase: '6_weeks', title: 'Reserve rental truck', description: 'Book a truck sized to your home.', dueOffsetDays: -40, category: 'logistics', condition: (o) => o.movingType === 'diy' },
    { id: 'transfer_school_records', phase: '6_weeks', title: 'Transfer school records', description: 'Request transcripts, immunization records.', dueOffsetDays: -38, category: 'admin', condition: (o) => o.hasChildren },
    { id: 'vet_records', phase: '6_weeks', title: 'Update pet vaccinations and records', description: 'Get vet records and vaccination certificates.', dueOffsetDays: -35, category: 'admin', condition: (o) => o.hasPets },
    { id: 'start_packing', phase: '4_weeks', title: 'Start packing non-essentials', description: 'Pack seasonal items, books, decor.', dueOffsetDays: -28, category: 'logistics' },
    { id: 'order_supplies', phase: '4_weeks', title: 'Order packing supplies', description: 'Boxes, tape, bubble wrap, markers.', dueOffsetDays: -28, category: 'logistics' },
    { id: 'usps_change', phase: '4_weeks', title: 'Submit USPS change of address', description: 'File at usps.com.', dueOffsetDays: -28, category: 'admin' },
    { id: 'insurance_update', phase: '4_weeks', title: 'Update insurance policies', description: 'Quote homeowner/renter insurance at destination.', dueOffsetDays: -25, category: 'financial' },
    { id: 'pet_supplies', phase: '4_weeks', title: 'Stock up on pet moving supplies', description: 'Carrier, updated ID tags, food and medications.', dueOffsetDays: -22, category: 'logistics', condition: (o) => o.hasPets },
    { id: 'transfer_utilities', phase: '2_weeks', title: 'Schedule utility transfers', description: 'Coordinate electric, gas, water, internet.', dueOffsetDays: -14, category: 'admin' },
    { id: 'cancel_old_utilities', phase: '2_weeks', title: 'Schedule old utility shutoffs', description: 'Schedule final readings and shutoffs.', dueOffsetDays: -14, category: 'admin' },
    { id: 'notify_landlord', phase: '2_weeks', title: 'Provide move-out notice to landlord', description: 'Submit written notice per lease terms.', dueOffsetDays: -14, category: 'admin' },
    { id: 'pack_rooms', phase: '2_weeks', title: 'Pack most of your home', description: 'Leave only daily essentials.', dueOffsetDays: -12, category: 'logistics' },
    { id: 'finalize_travel', phase: '2_weeks', title: 'Finalize travel plans', description: 'Book flights or plan driving route.', dueOffsetDays: -10, category: 'logistics' },
    { id: 'pack_essentials', phase: '1_week', title: 'Pack essentials box', description: 'First-night bag: toiletries, chargers, change of clothes.', dueOffsetDays: -5, category: 'logistics' },
    { id: 'confirm_movers', phase: '1_week', title: 'Confirm with moving company', description: 'Reconfirm arrival window, addresses.', dueOffsetDays: -4, category: 'logistics' },
    { id: 'refill_meds', phase: '1_week', title: 'Refill prescriptions', description: 'Refill all prescriptions to last 30 days post-move.', dueOffsetDays: -3, category: 'admin' },
    { id: 'empty_fridge', phase: '1_week', title: 'Empty and defrost freezer', description: 'Use up frozen food.', dueOffsetDays: -2, category: 'logistics' },
    { id: 'pack_valuables', phase: '1_week', title: 'Pack valuables separately', description: 'Jewelry, documents, small valuables go with you.', dueOffsetDays: -1, category: 'logistics' },
    { id: 'walkthrough_old', phase: 'moving_day', title: 'Walkthrough at old home', description: 'Document condition with photos/videos.', dueOffsetDays: 0, category: 'logistics' },
    { id: 'oversee_load', phase: 'moving_day', title: 'Oversee loading', description: 'Direct placement of boxes on the truck.', dueOffsetDays: 0, category: 'logistics' },
    { id: 'travel_new', phase: 'moving_day', title: 'Travel to new home', description: 'Arrive before movers if possible.', dueOffsetDays: 0, category: 'logistics' },
    { id: 'unload_inventory', phase: 'moving_day', title: 'Direct unloading and inventory check', description: 'Mark off boxes against inventory list.', dueOffsetDays: 0, category: 'logistics' },
    { id: 'register_vehicle', phase: 'post_move', title: 'Register vehicle in new state', description: 'Most states require within 30 days.', dueOffsetDays: 7, category: 'admin' },
    { id: 'update_license', phase: 'post_move', title: "Update driver's license", description: 'Visit new state DMV within required window.', dueOffsetDays: 14, category: 'admin' },
    { id: 'register_to_vote', phase: 'post_move', title: 'Register to vote', description: 'Register at new address.', dueOffsetDays: 14, category: 'admin' },
    { id: 'find_doctors', phase: 'post_move', title: 'Find new healthcare providers', description: 'Transfer records, identify new primary care.', dueOffsetDays: 14, category: 'admin' },
    { id: 'enroll_school', phase: 'post_move', title: 'Enroll children in school', description: 'Complete enrollment with proof of residency.', dueOffsetDays: 14, category: 'admin', condition: (o) => o.hasChildren },
    { id: 'update_pet_license', phase: 'post_move', title: 'Update pet license and tags', description: 'Some cities/counties require within 30 days.', dueOffsetDays: 21, category: 'admin', condition: (o) => o.hasPets },
    { id: 'unpack_priority', phase: 'post_move', title: 'Unpack priority rooms', description: 'Bedroom, bathroom, kitchen within first week.', dueOffsetDays: 7, category: 'housing' },
];
const MOVING_BASE_COSTS = {
    studio: { diy: [200, 350, 500], professional: [400, 600, 900], full_service: [800, 1200, 1800] },
    '1br': { diy: [300, 500, 750], professional: [600, 900, 1400], full_service: [1200, 1800, 2600] },
    '2br': { diy: [400, 700, 1100], professional: [900, 1500, 2300], full_service: [1800, 2800, 4200] },
    '3br': { diy: [600, 1000, 1600], professional: [1400, 2400, 3800], full_service: [2800, 4500, 6800] },
    '4br': { diy: [900, 1500, 2400], professional: [2000, 3500, 5500], full_service: [4000, 6500, 9800] },
};
const MOVING_PER_MILE = {
    diy: [0.5, 0.85, 1.2],
    professional: [1.0, 1.6, 2.4],
    full_service: [1.5, 2.4, 3.5],
};
const logisticsTools = [
    {
        name: 'plan_move_timeline',
        description: "Generate a personalized moving checklist with phased tasks. Saves to the user's relocation journey.",
        inputSchema: {
            moveDate: zod_1.z.string().describe('Target move date in ISO 8601 format (e.g., "2026-08-15")'),
            fromLocationId: zod_1.z.string().describe("Origin location ID (e.g., 'chicago-il')"),
            toLocationId: zod_1.z.string().describe("Destination location ID (e.g., 'austin-tx')"),
            familySize: zod_1.z.number().int().min(1).default(1).describe('Number of people in household'),
            hasChildren: zod_1.z.boolean().default(false).describe('Whether household includes children'),
            hasPets: zod_1.z.boolean().default(false).describe('Whether household includes pets'),
            movingType: zod_1.z.enum(['diy', 'professional', 'full_service']).default('professional').describe('Type of move'),
            save: zod_1.z.boolean().default(true).describe('Persist timeline to user journey (default true)'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        scope: 'write',
        handler: (svc, args, userId) => {
            const moveDate = new Date(args.moveDate);
            if (Number.isNaN(moveDate.getTime())) {
                return { __error: 'Invalid moveDate. Use ISO 8601 (e.g., "2026-08-15").' };
            }
            const opts = {
                familySize: args.familySize,
                hasChildren: args.hasChildren,
                hasPets: args.hasPets,
                movingType: args.movingType,
            };
            const tasks = TASK_TEMPLATES
                .filter((t) => !t.condition || t.condition(opts))
                .map((t) => {
                const due = new Date(moveDate);
                due.setUTCDate(due.getUTCDate() + t.dueOffsetDays);
                return {
                    id: t.id, title: t.title, description: t.description, phase: t.phase, category: t.category,
                    dueOffsetDays: t.dueOffsetDays, dueDate: due.toISOString().slice(0, 10), completed: false,
                };
            });
            const phases = LOGISTICS_PHASES.map((p) => ({
                name: p.name, label: p.label, description: p.description,
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
                phases: phases.map((p) => ({ name: p.name, label: p.label, taskCount: p.tasks.length })),
            };
            if (args.save) {
                svc.journey.setMoveTimeline(Number(userId), { moveDate: args.moveDate, tasks: tasks });
            }
            return { summary, phases };
        },
    },
    {
        name: 'estimate_moving_costs',
        description: 'Estimate total moving costs with itemized breakdown and low/mid/high ranges.',
        inputSchema: {
            fromLocationId: zod_1.z.string().describe("Origin location ID (e.g., 'chicago-il')"),
            toLocationId: zod_1.z.string().describe("Destination location ID (e.g., 'austin-tx')"),
            homeSize: zod_1.z.enum(['studio', '1br', '2br', '3br', '4br']).describe('Home size category'),
            movingType: zod_1.z.enum(['diy', 'professional', 'full_service']).default('professional').describe('Type of move'),
            includeStorage: zod_1.z.boolean().default(false).describe('Add estimated storage costs'),
            includeTempHousing: zod_1.z.boolean().default(false).describe('Add estimated temporary housing'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (svc, args, _userId) => {
            const from = svc.relocation.getLocationById(args.fromLocationId);
            const to = svc.relocation.getLocationById(args.toLocationId);
            if (!from)
                return { __error: `Unknown fromLocationId: ${args.fromLocationId}` };
            if (!to)
                return { __error: `Unknown toLocationId: ${args.toLocationId}` };
            const distanceMiles = Math.round(haversineMiles(from, to));
            const homeSize = args.homeSize;
            const movingType = args.movingType;
            const base = MOVING_BASE_COSTS[homeSize]?.[movingType];
            if (!base)
                return { __error: 'Invalid homeSize/movingType combo.' };
            const perMile = MOVING_PER_MILE[movingType];
            const moversLow = Math.round(base[0] + perMile[0] * distanceMiles);
            const moversMid = Math.round(base[1] + perMile[1] * distanceMiles);
            const moversHigh = Math.round(base[2] + perMile[2] * distanceMiles);
            const suppliesLowMidHigh = movingType === 'full_service' ? [0, 0, 0]
                : homeSize === 'studio' ? [60, 100, 160]
                    : homeSize === '1br' ? [100, 160, 240]
                        : homeSize === '2br' ? [180, 280, 400]
                            : homeSize === '3br' ? [280, 420, 600]
                                : [380, 580, 850];
            const isLong = distanceMiles > 400;
            const travel = isLong
                ? [600, 1100, 2000]
                : movingType === 'diy'
                    ? [Math.round(80 + distanceMiles * 0.25), Math.round(140 + distanceMiles * 0.35), Math.round(220 + distanceMiles * 0.5)]
                    : [120, 220, 380];
            const storage = args.includeStorage
                ? homeSize === 'studio' ? [80, 130, 200]
                    : homeSize === '1br' ? [110, 180, 280]
                        : homeSize === '2br' ? [160, 240, 360]
                            : homeSize === '3br' ? [220, 320, 480]
                                : [300, 440, 640]
                : [0, 0, 0];
            const tempHousing = args.includeTempHousing
                ? isLong ? [500, 900, 1500] : [300, 600, 1000]
                : [0, 0, 0];
            const destRent = to.cost?.medianRent ?? 1500;
            const depLow = Math.round(destRent * 2);
            const depMid = Math.round(destRent * 2.5);
            const depHigh = Math.round(destRent * 3);
            const items = [
                { category: 'movers_truck', description: movingType === 'diy' ? 'Truck rental + fuel' : movingType === 'full_service' ? 'Full-service packing + moving' : 'Professional movers', low: moversLow, mid: moversMid, high: moversHigh },
                { category: 'packing_supplies', description: movingType === 'full_service' ? 'Included in service' : 'Boxes, tape, wrap, markers', low: suppliesLowMidHigh[0], mid: suppliesLowMidHigh[1], high: suppliesLowMidHigh[2] },
                { category: 'travel', description: isLong ? 'Flights or long-drive fuel + lodging' : 'Drive fuel + meals', low: travel[0], mid: travel[1], high: travel[2] },
                ...(args.includeStorage ? [{ category: 'storage', description: '1 month storage unit', low: storage[0], mid: storage[1], high: storage[2] }] : []),
                ...(args.includeTempHousing ? [{ category: 'temp_housing', description: isLong ? '1-2 weeks temporary housing' : '1 week overlap housing', low: tempHousing[0], mid: tempHousing[1], high: tempHousing[2] }] : []),
                { category: 'deposits', description: 'First/last month rent + security at destination', low: depLow, mid: depMid, high: depHigh },
                { category: 'incidentals', description: 'Tips, meals, cleaning (~10% of move costs)', low: 0, mid: 0, high: 0 },
            ];
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
            return {
                fromLocation: { id: from.id, name: from.name, state: from.state },
                toLocation: { id: to.id, name: to.name, state: to.state },
                distanceMiles,
                homeSize,
                movingType,
                breakdown: items,
                total: { low: totalLow, mid: totalMid, high: totalHigh },
                notes: [
                    'These are national averages; actual costs vary by region, season, and demand.',
                    'Get at least 3 in-home quotes for accuracy on long-distance moves.',
                    'Mid-point estimate is most realistic; budget toward the high end for buffer.',
                ],
            };
        },
    },
    {
        name: 'utility_setup_checklist',
        description: 'Generate a utility setup/transfer checklist for the destination.',
        inputSchema: {
            toLocationId: zod_1.z.string().describe("Destination location ID (e.g., 'austin-tx')"),
            homeType: zod_1.z.enum(['apartment', 'house']).default('house').describe('Home type at destination'),
            startDate: zod_1.z.string().optional().describe('Target move-in date (ISO). Defaults to 2 weeks out.'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (svc, args, _userId) => {
            const to = svc.relocation.getLocationById(args.toLocationId);
            if (!to)
                return { __error: `Unknown toLocationId: ${args.toLocationId}` };
            const state = to.state ?? '';
            const moveIn = args.startDate ? new Date(args.startDate) : new Date(Date.now() + 14 * 86400_000);
            const daysOut = (n) => {
                const d = new Date(moveIn);
                d.setUTCDate(d.getUTCDate() - n);
                return d.toISOString().slice(0, 10);
            };
            const isApartment = args.homeType === 'apartment';
            const setup = [
                { utility: 'electric', responsibility: isApartment ? 'tenant' : 'homeowner', leadDays: 7, scheduledDate: daysOut(7), notes: isApartment ? 'Ask landlord which provider services the building.' : 'Compare rates on your state public utility commission site.' },
                { utility: 'gas', responsibility: isApartment ? 'often_tenant' : 'homeowner', leadDays: 7, scheduledDate: daysOut(7), notes: 'Deregulated states (TX, IL, NY, OH, PA, GA, MA, MD, NJ, CT, ME, MI, NH, RI, VA) you can choose a retail supplier.' },
                { utility: 'water', responsibility: isApartment ? 'landlord' : 'homeowner', leadDays: isApartment ? 0 : 3, scheduledDate: isApartment ? null : daysOut(3), notes: isApartment ? 'Water is typically included in rent.' : 'Set up service at the city water department.' },
                { utility: 'sewer_trash', responsibility: isApartment ? 'landlord' : 'homeowner', leadDays: isApartment ? 0 : 7, scheduledDate: isApartment ? null : daysOut(7), notes: 'Usually included in rent for apartments.' },
                { utility: 'internet', responsibility: 'tenant', leadDays: 14, scheduledDate: daysOut(14), notes: 'Schedule install 2 weeks out — fiber installs can require a technician visit with 5-10 day lead time.' },
                { utility: 'renter_or_homeowner_insurance', responsibility: 'tenant', leadDays: 5, scheduledDate: daysOut(5), notes: 'Bring proof of insurance to closing/move-in.' },
                ...(isApartment ? [] : [{ utility: 'hoa', responsibility: 'homeowner', leadDays: 14, scheduledDate: daysOut(14), notes: 'Get HOA rules, trash schedule, parking, and amenity access. Some require transfer fee.' }]),
            ];
            const cancel = [
                { utility: 'electric', action: 'Schedule final reading and shutoff for day after move-out', leadDays: 7, scheduledDate: daysOut(7) },
                { utility: 'gas', action: 'Schedule final reading and shutoff', leadDays: 7, scheduledDate: daysOut(7) },
                { utility: 'water', action: 'Request final bill at move-out (landlord handles if rented)', leadDays: 3, scheduledDate: daysOut(3) },
                { utility: 'internet', action: 'Cancel or transfer. Return equipment (modem/router) to avoid fees', leadDays: 3, scheduledDate: daysOut(3) },
                { utility: 'renter_or_homeowner_insurance', action: 'Cancel old policy or set end date', leadDays: 1, scheduledDate: daysOut(1) },
                { utility: 'subscriptions', action: 'Update address on streaming, meal kits, Amazon, paper delivery, gym, etc.', leadDays: 3, scheduledDate: daysOut(3) },
            ];
            return {
                toLocation: { id: to.id, name: to.name, state },
                homeType: args.homeType,
                moveInDate: moveIn.toISOString().slice(0, 10),
                setup, cancel,
                notes: [
                    `State: ${state}. Provider availability and regulations vary.`,
                    'Schedule utility setup 1-2 weeks before move-in to ensure service on day one.',
                    'Apartments: many utilities are landlord-managed — confirm before signing up to avoid duplicate billing.',
                ],
            };
        },
    },
    {
        name: 'mark_move_task_complete',
        description: "Mark a move timeline task as complete (or incomplete — calling again toggles). Persists to the user's relocation journey.",
        inputSchema: {
            taskId: zod_1.z.string().describe("Task ID from the move timeline (e.g., 'get_quotes', 'transfer_utilities')"),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        scope: 'write',
        handler: (svc, args, userId) => {
            const journey = svc.journey.toggleTask(Number(userId), args.taskId);
            const taskInTimeline = journey.moveTimeline?.tasks.find((t) => t.id === args.taskId);
            const isComplete = journey.completedTasks.includes(args.taskId);
            return {
                taskId: args.taskId,
                completed: isComplete,
                task: taskInTimeline ?? null,
                completedCount: journey.completedTasks.length,
                totalTasks: journey.moveTimeline?.tasks.length ?? 0,
            };
        },
    },
];
// ════════════════════════════════════════════════════════════════════════════
//  relocation_admin.ts  (4 tools — administrative / legal data tables)
// ════════════════════════════════════════════════════════════════════════════
const relocation_admin_1 = require("./tools/relocation_admin");
// NOTE: relocation_admin.ts is also being refactored in this PR — its tool
// registration loop just re-reads these same consts via the registry. The
// export lets both paths (MCP and chat) reuse one source of truth.
const COMMON_DOCS = [
    'Current out-of-state license (or other ID with photo, SSN, and DOB)',
    'Proof of identity (passport or birth certificate)',
    'Social Security card or proof of SSN',
    'Proof of new state residency (utility bill, bank statement, or lease, dated within 60 days)',
    'Proof of physical address in new state',
];
const TITLE_TRANSFER_GENERIC = {
    required: [
        "Out-of-state vehicle title (signed by seller; lien release if applicable)",
        'Bill of sale (if not on title)',
        "Valid driver's license from new state",
        'Proof of insurance meeting new state minimums',
        'Odometer reading',
    ],
    notes: 'Some states require a VIN verification inspection by law enforcement or licensed inspector at additional cost ($10-50).',
};
const adminTools = [
    {
        name: 'dmv_license_guide',
        description: "State-specific driver's license and vehicle registration requirements for the destination state. Returns deadlines, required documents, fees, appointment info, REAL ID availability.",
        inputSchema: {
            toState: zod_1.z.string().length(2).describe('Destination 2-letter state code (e.g., "TX", "FL", "CA")'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (_svc, args, _userId) => {
            const code = args.toState.toUpperCase();
            const d = relocation_admin_1.DMV_DATA[code];
            if (!d)
                return { error: 'Unknown state code', toState: code, availableStates: Object.keys(relocation_admin_1.DMV_DATA).sort() };
            return {
                toState: code,
                driverLicense: {
                    deadlineDays: d.licenseDeadlineDays,
                    description: `Must obtain new ${code} driver's license within ${d.licenseDeadlineDays} days of establishing residency.`,
                    requiredDocuments: COMMON_DOCS,
                    feeUSD: d.licenseFee,
                    appointmentRequired: d.appointmentRequired,
                    appointmentNote: d.appointmentRequired ? 'Book online in advance; walk-in wait times can exceed 2-4 hours.' : 'Walk-in generally accepted; arrive early to avoid lines.',
                    realId: { available: d.realIdAvailable, feeIncludedInLicenseFee: true, note: 'REAL ID required for domestic flights and federal facilities starting May 2025.' },
                },
                vehicleRegistration: {
                    deadlineDays: d.registrationDeadlineDays,
                    description: `Register out-of-state vehicle within ${d.registrationDeadlineDays} days.`,
                    feeBaseUSD: d.registrationFeeBase,
                    feeNote: 'Base fee. Additional taxes based on vehicle value/weight apply in most states.',
                    titleTransfer: TITLE_TRANSFER_GENERIC,
                },
                stateNotes: d.notes ?? null,
            };
        },
    },
    {
        name: 'voter_registration_guide',
        description: "Voter registration rules for the destination state — registration deadline, online/mail/in-person availability, same-day registration, party affiliation rules.",
        inputSchema: {
            toState: zod_1.z.string().length(2).describe('Destination 2-letter state code (e.g., "TX", "FL", "CA")'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (_svc, args, _userId) => {
            const code = args.toState.toUpperCase();
            const v = relocation_admin_1.VOTER_DATA[code];
            if (!v)
                return { error: 'Unknown state code', toState: code, availableStates: Object.keys(relocation_admin_1.VOTER_DATA).sort() };
            const deadlineDesc = v.registrationDeadlineDaysBeforeElection === 0 ? 'Election Day registration is allowed'
                : v.sameDayRegistration ? `${v.registrationDeadlineDaysBeforeElection} days before Election Day (same-day registration also allowed at polls)`
                    : `Must register at least ${v.registrationDeadlineDaysBeforeElection} days before Election Day`;
            return {
                toState: code,
                deadline: { daysBeforeElection: v.registrationDeadlineDaysBeforeElection, description: deadlineDesc },
                onlineRegistration: { available: v.onlineRegistration, url: 'https://vote.gov/ (federal portal redirects to state site)' },
                sameDayRegistration: v.sameDayRegistration,
                registrationMethods: v.methods,
                partyAffiliation: {
                    primaryIsClosed: v.partyRegistrationRequired,
                    note: v.partyRegistrationRequired
                        ? "Closed primary state — you must register with a party to vote in that party's primary."
                        : "Open primary state — you may vote in either party's primary without prior registration.",
                },
                whatYouNeed: [
                    "Driver's license or last 4 digits of SSN",
                    'Current residential address in the new state',
                    (v.partyRegistrationRequired && !v.sameDayRegistration) ? 'Party affiliation selection (where applicable)' : 'No party affiliation required to register',
                ],
                nextKeyDates: {
                    nextFederalElection: 'First Tuesday after the first Monday in November (every even year)',
                    generalRecommendation: 'Register as soon as you establish residency — most states let you update your registration online in minutes.',
                },
                stateNotes: v.notes ?? null,
            };
        },
    },
    {
        name: 'insurance_impact_analysis',
        description: 'How moving affects insurance across auto, home/renters, and health lines. Computes directional impact based on cost-of-living, property tax, and state insurance regulatory environment.',
        inputSchema: {
            fromLocationId: zod_1.z.string().describe('Origin location ID (e.g., "san-francisco-ca")'),
            toLocationId: zod_1.z.string().describe('Destination location ID (e.g., "austin-tx")'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (_svc, args, _userId) => {
            let locations = [];
            try {
                locations = (0, locations_loader_1.loadLocations)();
            }
            catch { /* dataset missing */ }
            const from = locations.find((l) => l.id === args.fromLocationId);
            const to = locations.find((l) => l.id === args.toLocationId);
            const toCol = to?.cost?.costOfLivingIndex ?? 100;
            const fromCol = from?.cost?.costOfLivingIndex ?? 100;
            const toPropTax = to?.cost?.propertyTaxRate ?? 0.01;
            const fromPropTax = from?.cost?.propertyTaxRate ?? 0.01;
            const toHome = to?.cost?.medianHomeValue ?? 0;
            const fromHome = from?.cost?.medianHomeValue ?? 0;
            const colRatio = fromCol ? toCol / fromCol : 1;
            const autoPercentChange = Math.round((colRatio - 1) * 100 * 0.6);
            const homeValueRatio = fromHome ? toHome / fromHome : 1;
            const homePercentChange = Math.round((homeValueRatio - 1) * 100 * 0.5);
            const propTaxDelta = (toPropTax - fromPropTax) * 100000;
            const rentersPercentChange = Math.round((toCol - fromCol));
            const sameState = from?.state === to?.state;
            return {
                from: from ? { id: from.id, name: from.name, state: from.state, costOfLivingIndex: from.cost.costOfLivingIndex, medianHomeValue: from.cost.medianHomeValue } : { id: args.fromLocationId, found: false },
                to: to ? { id: to.id, name: to.name, state: to.state, costOfLivingIndex: to.cost.costOfLivingIndex, medianHomeValue: to.cost.medianHomeValue } : { id: args.toLocationId, found: false },
                autoInsurance: {
                    estimatedChangePercent: autoPercentChange,
                    direction: autoPercentChange > 5 ? 'increase' : autoPercentChange < -5 ? 'decrease' : 'similar',
                    note: 'Auto premiums depend on ZIP code, driving record, and vehicle. Use this as a planning aid — get actual quotes before committing.',
                    actionItems: [
                        'Update garaging address on all auto policies',
                        "Cancel previous state's policy only after new policy is bound",
                        'Check for state-mandated minimum coverage changes',
                        'Ask about new-car / new-state discounts',
                    ],
                },
                homeOrRentersInsurance: {
                    homeEstimatedChangePercent: homePercentChange,
                    rentersEstimatedChangePercent: rentersPercentChange,
                    propertyTaxDeltaPerYear: Math.round(propTaxDelta),
                    direction: homePercentChange > 5 ? 'increase' : homePercentChange < -5 ? 'decrease' : 'similar',
                    note: 'Home insurance scales with dwelling value + local catastrophe risk. Property tax is separate and varies dramatically by state.',
                    actionItems: [
                        'Notify insurer 30 days before move',
                        'Re-evaluate dwelling coverage — rebuild cost differs by region',
                        "If renting, buy renters insurance ($15-30/mo)",
                        'If buying, shop title insurance through a state-licensed title company',
                    ],
                },
                healthInsurance: {
                    sameStateMove: sameState ? 'No marketplace change required. Notify current insurer of address change.' : 'Cross-state move — special enrollment period triggered. You have 60 days from move date to switch.',
                    enrollmentWindow: '60-day Special Enrollment Period (SEP) triggered by permanent move',
                    acaMarketplace: {
                        applicable: !sameState,
                        description: 'Cross-state moves require new marketplace application in destination state.',
                        url: 'https://www.healthcare.gov/',
                        note: 'If you had employer coverage, you have 30 days to elect COBRA from your prior employer.',
                    },
                    actionItems: sameState
                        ? ['Update address with current insurer', 'Confirm in-network providers at new address']
                        : ['Apply in destination state within 60 days', 'Compare employer plans vs ACA marketplace', 'Transfer prescriptions to in-network pharmacy near new home', 'Get new in-network primary care provider (PCP)'],
                },
                estimatedTotalAnnualImpact: {
                    autoUSD: Math.round(autoPercentChange * 15),
                    homeOrRentersUSD: Math.round(homePercentChange * 12 + propTaxDelta),
                    note: 'Order-of-magnitude estimate. Real numbers depend on coverage levels, deductibles, and carrier.',
                },
            };
        },
    },
    {
        name: 'address_change_checklist',
        description: 'Comprehensive universal address-change checklist — every entity to notify when you move.',
        inputSchema: {},
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (_svc, _args, _userId) => {
            const checklist = [
                { category: 'Government', priority: 'high', items: [
                        { entity: 'USPS', url: 'https://move.usps.com/', action: 'File Change of Address (online free, $1.10 in person)', deadlineDays: 0, automated: true },
                        { entity: 'IRS / Federal Tax', url: 'https://www.irs.gov/forms-pubs/about-form-8822', action: 'Update address on next return OR file Form 8822', deadlineDays: 0, automated: false },
                        { entity: 'Social Security Administration', url: 'https://www.ssa.gov/myaccount/', action: 'Update address online at ssa.gov/myaccount', deadlineDays: 0, automated: false },
                        { entity: 'Voter Registration', action: 'Register at new address', deadlineDays: 30, automated: false },
                        { entity: 'Department of Motor Vehicles', action: 'Update license + vehicle registration', deadlineDays: 30, automated: false },
                        { entity: 'VA (Veterans Affairs)', url: 'https://www.va.gov/change-address/', action: 'Update address if receiving benefits', deadlineDays: 0, automated: false },
                        { entity: 'Passport (US State Dept)', action: 'File Form DS-5520 if mail cannot reach you; otherwise no change needed', deadlineDays: 0, automated: false },
                        { entity: 'Selective Service', action: 'Update address within 10 days if male 18-25', deadlineDays: 10, automated: false },
                    ] },
                { category: 'Financial', priority: 'high', items: [
                        { entity: 'Banks (checking & savings)', action: 'Update address at each bank', deadlineDays: 14, automated: false },
                        { entity: 'Credit cards', action: 'Update billing address on every card', deadlineDays: 7, automated: false },
                        { entity: 'Investment accounts', action: 'Update brokerage, retirement, HSA', deadlineDays: 14, automated: false },
                        { entity: 'Mortgage / Home loan servicer', action: 'Update property insurance address + billing', deadlineDays: 7, automated: false },
                        { entity: 'Payroll / Employer', action: 'Update direct deposit + W-4 address', deadlineDays: 7, automated: false },
                        { entity: 'Student loan servicer', action: 'Update borrower contact address', deadlineDays: 14, automated: false },
                    ] },
                { category: 'Insurance', priority: 'high', items: [
                        { entity: 'Auto insurance', action: 'Update garaging address BEFORE move', deadlineDays: 0, automated: false },
                        { entity: 'Homeowners / Renters', action: 'Bind new policy; old policy ends at move', deadlineDays: 0, automated: false },
                        { entity: 'Health insurance', action: 'Update address; marketplace switch if cross-state', deadlineDays: 14, automated: false },
                        { entity: 'Life insurance', action: 'Update beneficiary + owner address', deadlineDays: 30, automated: false },
                        { entity: 'Umbrella / Liability', action: 'Update policy to reflect new property', deadlineDays: 30, automated: false },
                    ] },
                { category: 'Utilities & Services', priority: 'medium', items: [
                        { entity: 'Electric utility', action: 'Transfer service to new address', deadlineDays: 0, automated: true },
                        { entity: 'Gas utility', action: 'Schedule transfer + safety inspection if needed', deadlineDays: 0, automated: true },
                        { entity: 'Water / Sewer', action: 'Establish new account with local municipality', deadlineDays: 0, automated: false },
                        { entity: 'Trash / Recycling', action: 'Confirm pickup schedule + bin swap if required', deadlineDays: 7, automated: false },
                        { entity: 'Internet / Broadband', action: 'Schedule install (often 2-week lead time)', deadlineDays: 14, automated: false },
                        { entity: 'Cable / Streaming', action: 'Update service address or cancel', deadlineDays: 7, automated: false },
                        { entity: 'Mobile phone', action: 'Update billing address; check coverage', deadlineDays: 7, automated: false },
                        { entity: 'Landline (if any)', action: 'Port number or cancel service', deadlineDays: 7, automated: false },
                    ] },
                { category: 'Subscriptions & Memberships', priority: 'medium', items: [
                        { entity: 'Newspaper / Magazines', action: 'Update delivery address or cancel', deadlineDays: 7, automated: false },
                        { entity: 'Subscription boxes', action: 'Update shipping address (e.g., Birchbox, HelloFresh)', deadlineDays: 7, automated: false },
                        { entity: 'Gym / Fitness', action: 'Cancel, transfer, or freeze membership', deadlineDays: 14, automated: false },
                        { entity: 'Professional associations', action: 'Update chapter + mailing address', deadlineDays: 14, automated: false },
                        { entity: 'Warehouse clubs (Costco/Sam\'s)', action: 'Update card address; verify new location', deadlineDays: 14, automated: false },
                        { entity: 'Loyalty programs', action: 'Update preferred address on airline / hotel / retail', deadlineDays: 14, automated: false },
                        { entity: 'Amazon / Online retailers', action: 'Add new address as default; clear old saved entries', deadlineDays: 0, automated: false },
                        { entity: 'Meal kit services', action: 'Update delivery ZIP or cancel before billing cutoff', deadlineDays: 7, automated: false },
                    ] },
                { category: 'Personal & Medical', priority: 'medium', items: [
                        { entity: 'Primary care physician', action: 'Transfer records + find new in-network provider', deadlineDays: 30, automated: false },
                        { entity: 'Dentist', action: 'Transfer records + find new provider', deadlineDays: 30, automated: false },
                        { entity: 'Pharmacy', action: 'Transfer prescriptions to a chain near new address', deadlineDays: 14, automated: false },
                        { entity: 'Optometrist / Vision', action: 'Transfer glasses / contacts prescription records', deadlineDays: 30, automated: false },
                        { entity: 'Veterinarian', action: 'Transfer pet records + refill prescriptions', deadlineDays: 14, automated: false },
                        { entity: 'Therapist / Counselor', action: 'Find in-network provider OR continue telehealth', deadlineDays: 30, automated: false },
                    ] },
                { category: 'Legal & Miscellaneous', priority: 'low', items: [
                        { entity: 'Attorney / Legal counsel', action: 'Update contact address for active matters', deadlineDays: 14, automated: false },
                        { entity: 'Will / Estate executor', action: 'Notify executor of new address', deadlineDays: 30, automated: false },
                        { entity: 'Trust beneficiary records', action: 'Update beneficiary addresses', deadlineDays: 30, automated: false },
                        { entity: 'Divorce / Custody court', action: 'File address change with family court if required', deadlineDays: 14, automated: false },
                        { entity: 'Home security / Alarm', action: 'Update monitoring service address', deadlineDays: 7, automated: false },
                        { entity: 'Personal contacts', action: 'Send new address to family + friends', deadlineDays: 0, automated: false },
                        { entity: 'Charitable donations', action: 'Update recurring gift billing address', deadlineDays: 14, automated: false },
                        { entity: 'Cloud / SaaS accounts', action: 'Update backup address for Apple, Google, Microsoft, etc.', deadlineDays: 7, automated: false },
                        { entity: 'Domain registrar', action: 'Update WHOIS contact address', deadlineDays: 14, automated: false },
                    ] },
            ];
            const totalItems = checklist.reduce((n, c) => n + c.items.length, 0);
            return {
                overview: {
                    recommendedFirstStep: 'File a Change of Address with USPS — it forwards most first-class mail for 12 months.',
                    uspsUrl: 'https://move.usps.com/',
                    uspsFee: 0,
                    forwardingDurationMonths: 12,
                },
                checklist,
                summary: { totalItems },
            };
        },
    },
];
// ════════════════════════════════════════════════════════════════════════════
//  relocation_journey.ts  (7 tools — persistent workspace)
// ════════════════════════════════════════════════════════════════════════════
const journeyTools = [
    {
        name: 'get_relocation_journey',
        description: "Get the user's complete relocation journey — shortlisted cities, saved comparisons, move timeline, preferences, completed tasks, and current phase.",
        inputSchema: {},
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        scope: 'read',
        handler: (svc, _args, userId) => ({ journey: svc.journey.getJourney(Number(userId)) }),
    },
    {
        name: 'shortlist_location',
        description: "Add a location to the user's relocation shortlist.",
        inputSchema: {
            locationId: zod_1.z.string().describe("Location ID (e.g., 'austin-tx')"),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        scope: 'write',
        handler: (svc, args, userId) => ({ journey: svc.journey.shortlistLocation(Number(userId), args.locationId) }),
    },
    {
        name: 'eliminate_location',
        description: "Remove a location from the user's shortlist, with an optional reason that gets logged.",
        inputSchema: {
            locationId: zod_1.z.string().describe('Location ID to remove'),
            reason: zod_1.z.string().optional().describe('Why the user eliminated this location'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        scope: 'write',
        handler: (svc, args, userId) => ({ journey: svc.journey.eliminateLocation(Number(userId), args.locationId, args.reason) }),
    },
    {
        name: 'update_relocation_preferences',
        description: "Update the user's relocation preferences (budget, household size, employment type, demographics, climate preference, priorities).",
        inputSchema: {
            maxBudget: zod_1.z.number().optional().describe('Maximum housing budget in USD'),
            householdSize: zod_1.z.number().int().optional().describe('Number of people in household'),
            employment: zod_1.z.enum(['remote', 'hybrid', 'onsite', 'retired', 'student', 'looking']).optional(),
            hasChildren: zod_1.z.boolean().optional(),
            schoolAgeChildren: zod_1.z.number().int().optional(),
            climatePreference: zod_1.z.enum(['warm', 'mild', 'four_seasons', 'cold_tolerant']).optional(),
            priorities: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).optional().describe('Category → weight'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        scope: 'write',
        handler: (svc, args, userId) => ({ journey: svc.journey.updatePreferences(Number(userId), args) }),
    },
    {
        name: 'toggle_move_task',
        description: 'Mark a move timeline task as complete or incomplete. Toggles the current state.',
        inputSchema: {
            taskId: zod_1.z.string().describe('Task ID from the move timeline'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        scope: 'write',
        handler: (svc, args, userId) => ({ journey: svc.journey.toggleTask(Number(userId), args.taskId) }),
    },
    {
        name: 'save_comparison',
        description: 'Save a location comparison result to the user journey for future reference.',
        inputSchema: {
            comparison: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).describe('The comparison result object to save'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        scope: 'write',
        handler: (svc, args, userId) => ({ journey: svc.journey.saveComparison(Number(userId), args.comparison) }),
    },
    {
        name: 'set_relocation_phase',
        description: "Set the user's current phase in the relocation journey: discovery, housing, logistics, admin, or settlement.",
        inputSchema: {
            phase: zod_1.z.enum(['discovery', 'housing', 'logistics', 'admin', 'settlement']),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        scope: 'write',
        handler: (svc, args, userId) => ({ journey: svc.journey.setPhase(Number(userId), args.phase) }),
    },
];
// ════════════════════════════════════════════════════════════════════════════
//  Public API — single flat array, scope-tagged for the MCP adapter
// ════════════════════════════════════════════════════════════════════════════
exports.ALL_RELOCATION_TOOLS = [
    ...relocationTools,
    ...costTools,
    ...communityTools,
    ...logisticsTools,
    ...adminTools,
    ...journeyTools,
];
/**
 * Slice helpers — MCP tool files call these to register their own subset.
 * Kept as named functions (not config) so TypeScript can verify each file's
 * slice against its concrete handler signature.
 */
const coreTools = () => relocationTools;
exports.coreTools = coreTools;
const costToolDefs = () => costTools;
exports.costToolDefs = costToolDefs;
const communityToolDefs = () => communityTools;
exports.communityToolDefs = communityToolDefs;
const logisticsToolDefs = () => logisticsTools;
exports.logisticsToolDefs = logisticsToolDefs;
const adminToolDefs = () => adminTools;
exports.adminToolDefs = adminToolDefs;
const journeyToolDefs = () => journeyTools;
exports.journeyToolDefs = journeyToolDefs;
