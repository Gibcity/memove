"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelocationService = void 0;
const common_1 = require("@nestjs/common");
const todoService_1 = require("../../services/todoService");
const move_checklist_templates_1 = require("./move-checklist-templates");
const database_service_1 = require("../database/database.service");
const relocationCache_1 = require("../../services/relocationCache");
const locations_loader_1 = require("./locations.loader");
const relocation_journey_service_1 = require("./relocation-journey.service");
// ── Data loading ──────────────────────────────────────────────────────────────
let _statsCache = null;
// ── Field paths for normalization ─────────────────────────────────────────────
const FIELD_PATHS = {
    medianHomeValue: 'cost.medianHomeValue',
    medianRent: 'cost.medianRent',
    costOfLivingIndex: 'cost.costOfLivingIndex',
    propertyTaxRate: 'cost.propertyTaxRate',
    stateIncomeTaxRate: 'cost.stateIncomeTaxRate',
    taxCompetitivenessScore: 'fiscal.taxCompetitivenessScore',
    tornadoRiskScore: 'climate.tornadoRiskScore',
    hurricaneRiskScore: 'climate.hurricaneRiskScore',
    floodRiskScore: 'climate.floodRiskScore',
    earthquakeRiskScore: 'climate.earthquakeRiskScore',
    wildfireRiskScore: 'climate.wildfireRiskScore',
    daysMaxGt90FAnnual: 'climate.daysMaxGt90FAnnual',
    daysMinLt32FAnnual: 'climate.daysMinLt32FAnnual',
    sunshineHoursAnnual: 'climate.sunshineHoursAnnual',
    annualPrecipitationInches: 'climate.annualPrecipitationInches',
    healthcareAccessScore: 'healthcare.healthcareAccessScore',
    hospitalCountWithin10mi: 'healthcare.hospitalCountWithin10mi',
    violentCrimeRatePer100k: 'crime.violentCrimeRatePer100k',
    pctHouseholdsWith100MbpsPlus: 'broadband.pctHouseholdsWith100MbpsPlus',
    medianDownloadMbps: 'broadband.medianDownloadMbps',
};
function getNested(obj, path) {
    const keys = path.split('.');
    let val = obj;
    for (const key of keys) {
        if (typeof val === 'object' && val !== null && key in val) {
            val = val[key];
        }
        else {
            return 0;
        }
    }
    const num = Number(val);
    return Number.isFinite(num) ? num : 0;
}
// ── Normalization stats ───────────────────────────────────────────────────────
// ponytail: FEMA NRI risk scores are 0-100 and a 0 is data (not "not in
// zone"), while density/count/broadband fields use 0 as a missing-data
// sentinel. Hard-coding the policy here per-field because the JSON
// payload has no separate "hasData" flag and adding one is out of scope.
const NRI_RISK_FIELDS = new Set([
    'tornadoRiskScore',
    'hurricaneRiskScore',
    'floodRiskScore',
    'earthquakeRiskScore',
    'wildfireRiskScore',
    'daysMaxGt90FAnnual',
    'daysMinLt32FAnnual',
]);
function isMissing(field, v) {
    if (!Number.isFinite(v) || Number.isNaN(v))
        return true;
    if (v === 0) {
        // 0 is meaningful only for NRI risk scores; for everything else the
        // corpus convention is 0 = "no data captured".
        return !NRI_RISK_FIELDS.has(field);
    }
    return false;
}
function computeNormalizationStats(locations) {
    // ponytail: also stores mean/std so NRI risk scores can be z-score
    // normalized. Their raw 0-100 scale is already comparable across
    // metros (FEMA publishes against a national baseline), so min-max
    // against corpus min/max mis-ranks moderate-risk metros against
    // maxed-out hurricane counties. Cost fields (ratio-scaled) keep
    // min-max, which is the right call there.
    const stats = new Map();
    for (const [field, fpath] of Object.entries(FIELD_PATHS)) {
        // ponytail: 'Unknown' fiscalTier — 93.5% of the corpus — leaks into
        // taxCompetitivenessScore normalization and silently de-ranks
        // metropolitan counties. Skip those rows entirely.
        const vals = [];
        for (const loc of locations) {
            if (loc.fiscal?.fiscalTier === 'Unknown')
                continue;
            const v = getNested(loc, fpath);
            if (isMissing(field, v))
                continue;
            vals.push(v);
        }
        if (vals.length === 0) {
            stats.set(field, { min: 0, max: 1, mean: 0, std: 0, n: 0 });
            continue;
        }
        let sum = 0;
        for (const x of vals)
            sum += x;
        const mean = sum / vals.length;
        let varSum = 0;
        for (const x of vals)
            varSum += (x - mean) * (x - mean);
        const std = Math.sqrt(varSum / vals.length);
        stats.set(field, {
            min: Math.min(...vals),
            max: Math.max(...vals),
            mean,
            std,
            n: vals.length,
        });
    }
    return stats;
}
function getStats() {
    if (_statsCache === null) {
        _statsCache = computeNormalizationStats((0, locations_loader_1.loadLocations)());
    }
    return _statsCache;
}
// ── Normalization helper ──────────────────────────────────────────────────────
// ponytail: z-score option for NRI; min-max kept as default for cost fields.
// Z-score is bounded to [-3, 3] and mapped to [0, 100] so the scale matches
// the rest of the subscores.
function normalize(value, rmin, rmax, n, invertOrZ = false, invert = false) {
    if (n === 0)
        return 0;
    if (typeof invertOrZ === 'object') {
        if (!Number.isFinite(value) || invertOrZ.std === 0)
            return 50;
        const z = (value - invertOrZ.mean) / invertOrZ.std;
        const clipped = Math.max(-3, Math.min(3, z));
        const pct = (clipped + 3) / 6;
        return Math.round((invert ? 1 - pct : pct) * 100);
    }
    if (!Number.isFinite(value) || rmax === rmin)
        return 0;
    const norm = (value - rmin) / (rmax - rmin);
    return Math.round((invert ? 1 - norm : norm) * 100);
}
// ── Default weights ───────────────────────────────────────────────────────────
const DEFAULT_WEIGHTS = {
    cost: 5,
    climate: 4,
    safety: 3,
    healthcare: 3,
    jobs: 3,
    outdoors: 3,
};
// Apply ScoreRequest-style range filters (dot-path → {min,max}) to a location.
// Excludes when the resolved value is finite and falls outside [min,max].
function applyRangeFilters(loc, filters) {
    if (!filters)
        return { included: true };
    for (const [path, range] of Object.entries(filters)) {
        const raw = getNested(loc, path);
        if (!Number.isFinite(raw) || raw === 0)
            continue; // missing data → don't exclude
        const { min, max } = range;
        if (min !== undefined && raw < min)
            return { included: false, reason: `${path}=${raw} < min=${min}` };
        if (max !== undefined && raw > max)
            return { included: false, reason: `${path}=${raw} > max=${max}` };
    }
    return { included: true };
}
// ── Scoring engine ────────────────────────────────────────────────────────────
function scoreLocation(loc, weights, stats, filters) {
    const failReasons = [];
    // Hard filters
    if (filters['states'] && !filters['states'].includes(loc.state)) {
        failReasons.push(`State ${loc.state} not in allowlist`);
    }
    if (filters['excludeStates'] && filters['excludeStates'].includes(loc.state)) {
        failReasons.push(`State ${loc.state} excluded`);
    }
    const cost = loc.cost;
    const climate = loc.climate;
    if (filters['maxHomeValue'] && cost.medianHomeValue > filters['maxHomeValue']) {
        failReasons.push(`Home value $${cost.medianHomeValue.toLocaleString()} > $${filters['maxHomeValue'].toLocaleString()}`);
    }
    if (filters['maxRent'] && cost.medianRent > filters['maxRent']) {
        failReasons.push(`Rent $${cost.medianRent.toLocaleString()} > $${filters['maxRent'].toLocaleString()}`);
    }
    for (const [fk, fl] of [
        ['maxRiskTornado', 'tornadoRiskScore'],
        ['maxRiskHurricane', 'hurricaneRiskScore'],
        ['maxRiskEarthquake', 'earthquakeRiskScore'],
        ['maxRiskWildfire', 'wildfireRiskScore'],
    ]) {
        if (filters[fk] && climate[fl] > filters[fk]) {
            failReasons.push(`${fl} ${climate[fl].toFixed(1)} > ${filters[fk]}`);
        }
    }
    if (filters['maxHotDays'] && climate.daysMaxGt90FAnnual > filters['maxHotDays']) {
        failReasons.push(`Hot days ${climate.daysMaxGt90FAnnual} > ${filters['maxHotDays']}`);
    }
    if (filters['maxColdDays'] && climate.daysMinLt32FAnnual > filters['maxColdDays']) {
        failReasons.push(`Cold days ${climate.daysMinLt32FAnnual} > ${filters['maxColdDays']}`);
    }
    if (filters['minPopulation'] && loc.population < filters['minPopulation']) {
        failReasons.push(`Population ${loc.population.toLocaleString()} < ${filters['minPopulation'].toLocaleString()}`);
    }
    function norm(field, value, invert = false) {
        const r = stats.get(field);
        return normalize(value, r.min, r.max, r.n, false, invert);
    }
    // Cost subscore
    const homeScore = norm('medianHomeValue', cost.medianHomeValue, true);
    const rentScore = norm('medianRent', cost.medianRent, true);
    const colScore = (stats.get('costOfLivingIndex')?.n ?? 0) > 0
        ? norm('costOfLivingIndex', cost.costOfLivingIndex, true)
        : 0;
    const fiscal = loc.fiscal;
    const taxScore = norm('taxCompetitivenessScore', fiscal.taxCompetitivenessScore);
    const costParts = [
        [homeScore, 0.35],
        [rentScore, 0.25],
    ];
    if (colScore > 0) {
        costParts.push([colScore, 0.2]);
    }
    else {
        costParts.push([taxScore, 0.2]);
    }
    // ponytail: removed unconditional costParts.push([taxScore, 0.2]) — this was a
    // double-weighting bug. When colScore > 0, taxScore was pushed again below,
    // giving tax a 0.4 weight instead of 0.2. When colScore === 0, taxScore was
    // pushed twice (0.2 + 0.2 = 0.4). Now taxScore only appears once.
    const wsum = costParts.reduce((s, [, w]) => s + w, 0);
    const costSub = wsum ? Math.round(costParts.reduce((s, [sc, w]) => s + sc * w, 0) / wsum) : 0;
    // Climate/risk subscore
    // ponytail: NRI risk fields (incl. the days-above/below thresholds which
    // share the same per-corpus variability pattern) use z-score
    // normalization rather than min-max. Their 0-100/0-365 scales are
    // already comparable across metros, so the corpus min/max would
    // distort a moderate-risk metro into the wrong end of the range.
    const NRI_FIELDS = new Set([
        'earthquakeRiskScore',
        'tornadoRiskScore',
        'hurricaneRiskScore',
        'floodRiskScore',
        'wildfireRiskScore',
    ]);
    const riskScores = [];
    for (const rk of NRI_FIELDS) {
        const v = climate[rk] ?? 0;
        const r = stats.get(rk);
        if (r && r.n > 0 && Number.isFinite(v)) {
            riskScores.push(normalize(v, 0, 0, r.n, { mean: r.mean, std: r.std }, true));
        }
        else {
            riskScores.push(100);
        }
    }
    const climateSub = riskScores.length > 0 ? Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length) : 50;
    // Safety subscore
    const crime = loc.crime;
    const vc = crime.violentCrimeRatePer100k;
    let safetySub;
    if (vc > 0 && (stats.get('violentCrimeRatePer100k')?.n ?? 0) > 0) {
        safetySub = norm('violentCrimeRatePer100k', vc, true);
    }
    else {
        safetySub = 50;
    }
    // Healthcare subscore
    const hc = loc.healthcare;
    let healthcareSub;
    if (hc.hospitalCountWithin10mi > 0 || hc.healthcareAccessScore > 0) {
        const hcAccess = hc.healthcareAccessScore > 0 ? norm('healthcareAccessScore', hc.healthcareAccessScore) : 50;
        const hcCount = hc.hospitalCountWithin10mi > 0 ? norm('hospitalCountWithin10mi', hc.hospitalCountWithin10mi) : 0;
        healthcareSub = Math.round((hcAccess + hcCount) / 2);
    }
    else {
        healthcareSub = 50;
    }
    // Jobs subscore
    const bb = loc.broadband;
    const bbScore = bb.pctHouseholdsWith100MbpsPlus > 0
        ? norm('pctHouseholdsWith100MbpsPlus', bb.pctHouseholdsWith100MbpsPlus)
        : 0;
    const jobsSub = bbScore > 0 ? Math.round(0.6 * taxScore + 0.4 * bbScore) : taxScore;
    // Outdoors subscore
    const sun = climate.sunshineHoursAnnual;
    const precip = climate.annualPrecipitationInches;
    let outdoorsSub;
    if (sun > 0 || precip > 0) {
        const sunScore = sun > 0 ? norm('sunshineHoursAnnual', sun) : 50;
        const precipScore = precip > 0 ? norm('annualPrecipitationInches', precip, true) : 50;
        outdoorsSub = Math.round((sunScore + precipScore) / 2);
    }
    else {
        outdoorsSub = 50;
    }
    const subscores = {
        cost: costSub,
        climate: climateSub,
        safety: safetySub,
        healthcare: healthcareSub,
        jobs: jobsSub,
        outdoors: outdoorsSub,
    };
    // Weighted final
    const wKeys = ['cost', 'climate', 'safety', 'healthcare', 'jobs', 'outdoors'];
    const wSum = wKeys.reduce((s, k) => s + (weights[k] ?? 0), 0);
    const nw = {};
    for (const k of wKeys) {
        nw[k] = wSum > 0 ? (weights[k] ?? 0) / wSum : 0;
    }
    const matchScore = Math.round(nw['cost'] * costSub +
        nw['climate'] * climateSub +
        nw['safety'] * safetySub +
        nw['healthcare'] * healthcareSub +
        nw['jobs'] * jobsSub +
        nw['outdoors'] * outdoorsSub);
    // Trace
    const trace = [];
    if (matchScore > 0) {
        trace.push(`Cost: ${costSub}/100 (home $${cost.medianHomeValue.toLocaleString()}, rent $${cost.medianRent.toLocaleString()})`);
        trace.push(`Risk: ${climateSub}/100 (tornado ${climate.tornadoRiskScore.toFixed(1)}, wildfire ${climate.wildfireRiskScore.toFixed(1)})`);
        trace.push(`Safety: ${safetySub}/100 (violent crime ${vc.toFixed(1)}/100k)`);
        trace.push(`Healthcare: ${healthcareSub}/100 (hospitals ${hc.hospitalCountWithin10mi})`);
        trace.push(`Jobs: ${jobsSub}/100 (tax score ${taxScore})`);
    }
    // Data gaps
    const gaps = [];
    for (const [field, fpath] of Object.entries(FIELD_PATHS)) {
        if (getNested(loc, fpath) === 0) {
            gaps.push(field);
        }
    }
    return {
        location: loc,
        matchScore,
        subscores,
        passed: failReasons.length === 0,
        failReasons,
        trace,
        dataGaps: gaps,
    };
}
// ── In-memory user profiles ──────────────────────────────────────────────────
function getDefaultProfile(userId) {
    return {
        userId,
        statedPriorities: [],
        revealedEmbeddingRef: '',
        hardFilters: [],
        softWeights: {
            cost: 0.35,
            climate: 0.25,
            crime: 0.2,
            amenities: 0.1,
            broadband: 0.1,
        },
        nonNegotiablesDiscovered: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        elicitationRoundsCompleted: 0,
        implicitSignalCount: 0,
        dismissCounts: {}, // ponytail: F17 — per-location dismiss counter
    };
}
// ── Elicitation questions ────────────────────────────────────────────────────
//
// Three lightweight questions per RESEARCH.md §1 (cold-start: <5 min to
// first useful feed).  Each follows the ElicitationQuestion shape from
// @memove/shared/relocation/relocation.schema.ts.
const ELICITATION_QUESTIONS = [
    {
        id: 'q1-cost-priority',
        prompt: 'How important is the cost of living in your relocation decision?',
        options: [
            {
                value: 'cost_high',
                label: 'Very important — I want to minimize costs',
            },
            {
                value: 'cost_medium',
                label: 'Somewhat important — I’ll consider value for money',
            },
            {
                value: 'cost_low',
                label: 'Not important — quality of life matters more than cost',
            },
        ],
        skippable: true,
    },
    {
        id: 'q2-climate-preference',
        prompt: 'What climate best suits you?',
        options: [
            {
                value: 'warm',
                label: 'Warm year-round — I love heat and sun',
            },
            {
                value: 'four_seasons',
                label: 'Four seasons — I want all of them',
            },
            {
                value: 'mild',
                label: 'Cool / mild — I prefer moderate temperatures',
            },
            {
                value: 'cold_tolerant',
                label: 'Cold-tolerant — I don’t mind snow and winter',
            },
        ],
        skippable: true,
    },
    {
        id: 'q3-dealbreaker',
        prompt: 'What’s a non-negotiable for your new home?',
        options: [
            {
                value: 'low_taxes',
                label: 'Low taxes / comparatively affordable',
            },
            {
                value: 'safety',
                label: 'Safe neighborhoods with low crime',
            },
            // ponytail: schools and healthcare were one option — parents and
            // patients have orthogonal needs, so split. Distinct values mean
            // downstream weight mapping can target each independently.
            {
                value: 'schools',
                label: 'Good public schools',
            },
            {
                value: 'healthcare_access',
                label: 'Strong healthcare access',
            },
            {
                value: 'jobs_internet',
                label: 'Strong job market and fast internet',
            },
            {
                value: 'nature',
                label: 'Access to nature and outdoor activities',
            },
        ],
        skippable: true,
    },
];
// ── In-memory elicitation sessions & signals ─────────────────────────────────
const elicitationSessions = new Map();
const elicitationAnswers = new Map(); // sessionId → answers
const implicitSignals = [];
// ponytail: F17 — once the user has dismissed the same location this many
// times, surface a HardFilterProposal (a "hide this city?" prompt) instead of
// silently dropping another dismiss on the floor.
const HARD_FILTER_DISMISS_THRESHOLD = 3;
// ponytail: ImplicitSignal carries no userId (see shared
// relocation.schema.ts) so the process-global array cannot be reliably
// attributed per-user. DSR uses profile.implicitSignalCount for export
// and zeroes it on delete; the raw array is intentionally untouched so
// other users' signals never leak.
let _sessionCounter = 0;
function newSessionId() {
    _sessionCounter += 1;
    return `elicit-${Date.now()}-${_sessionCounter}`;
}
// ── Service ──────────────────────────────────────────────────────────────────
let RelocationService = class RelocationService {
    db;
    journey;
    // ── Data access ──
    // ponytail: `journey` is optional so MCP tool sites that `new
    // RelocationService(createDbAdapter(db))` directly keep compiling
    // (mirrors the inverse pattern in RelocationJourneyService). Nest
    // injection provides it; bundle() falls back to a raw row read when
    // missing.
    constructor(db, journey) {
        this.db = db;
        this.journey = journey;
    }
    // ponytail: SQLite-backed read-through cache for scoreLocations. Lives
    // on the service so it shares the singleton DB connection; built lazily
    // because the class is also instantiated manually outside Nest.
    _cache = null;
    get cache() {
        if (!this._cache)
            this._cache = new relocationCache_1.RelocationCache(this.db);
        return this._cache;
    }
    getAllLocations() {
        return (0, locations_loader_1.loadLocations)();
    }
    getLocationById(id) {
        return (0, locations_loader_1.loadLocations)().find((l) => l.id === id);
    }
    // ponytail: simple in-bounds check; US-only corpus never crosses the antimeridian,
    // so a plain west <= lng <= east covers every real viewport (matches the shared
    // viewportBoundsSchema comment).
    aggregateViewportStats(bounds) {
        const locations = (0, locations_loader_1.loadLocations)().filter((l) => l.lat <= bounds.north &&
            l.lat >= bounds.south &&
            l.lng <= bounds.east &&
            l.lng >= bounds.west);
        const averages = {};
        for (const [field, fpath] of Object.entries(FIELD_PATHS)) {
            let sum = 0;
            let n = 0;
            for (const loc of locations) {
                const v = getNested(loc, fpath);
                if (isMissing(field, v))
                    continue;
                sum += v;
                n += 1;
            }
            if (n > 0)
                averages[field] = Math.round((sum / n) * 100) / 100;
        }
        return { count: locations.length, bounds, averages };
    }
    searchLocations(filters) {
        const locations = (0, locations_loader_1.loadLocations)();
        // ponytail: default to 1000 (corpus is 939 metros) so callers that omit
        // `limit` get the full list. The FE explicitly passes ?limit=1000; this
        // raise protects MCP/CLI/OpenAPI consumers that don't.
        const limit = filters.limit ?? 1000;
        const results = [];
        for (const loc of locations) {
            const cost = loc.cost;
            const climate = loc.climate;
            const crime = loc.crime;
            if (filters.states && !filters.states.includes(loc.state))
                continue;
            if (filters.excludeStates && filters.excludeStates.includes(loc.state))
                continue;
            if (filters.maxHomeValue && cost.medianHomeValue > filters.maxHomeValue)
                continue;
            if (filters.maxRent && cost.medianRent > filters.maxRent)
                continue;
            if (filters.maxViolentCrime && crime.violentCrimeRatePer100k > filters.maxViolentCrime)
                continue;
            if (filters.maxRiskTornado && climate.tornadoRiskScore > filters.maxRiskTornado)
                continue;
            if (filters.maxRiskHurricane && climate.hurricaneRiskScore > filters.maxRiskHurricane)
                continue;
            if (filters.maxRiskEarthquake && climate.earthquakeRiskScore > filters.maxRiskEarthquake)
                continue;
            if (filters.maxRiskWildfire && climate.wildfireRiskScore > filters.maxRiskWildfire)
                continue;
            if (filters.maxHotDays && climate.daysMaxGt90FAnnual > filters.maxHotDays)
                continue;
            if (filters.maxColdDays && climate.daysMinLt32FAnnual > filters.maxColdDays)
                continue;
            if (filters.minPopulation) {
                // ponytail: if population is missing, do NOT silently pass — minPopulation
                // is a floor, and a location we can't evaluate against the floor shouldn't
                // qualify. undefined < N is false in JS, which is the silent-pass bug this
                // guard fixes.
                if (loc.population === undefined || loc.population < filters.minPopulation)
                    continue;
            }
            if (filters.nameContains &&
                !loc.name.toLowerCase().includes(filters.nameContains.toLowerCase()))
                continue;
            results.push({
                id: loc.id,
                name: loc.name,
                state: loc.state,
                lat: loc.lat,
                lng: loc.lng,
                population: loc.population,
                cost: {
                    costOfLivingIndex: cost.costOfLivingIndex,
                    medianHomeValue: cost.medianHomeValue,
                    medianRent: cost.medianRent,
                    stateIncomeTaxRate: cost.stateIncomeTaxRate,
                    propertyTaxRate: cost.propertyTaxRate,
                },
                crime: {
                    violentCrimeRatePer100k: crime.violentCrimeRatePer100k,
                    propertyCrimeRatePer100k: crime.propertyCrimeRatePer100k,
                    yearOverYearTrend: crime.yearOverYearTrend,
                },
                climate: {
                    tornadoRiskScore: climate.tornadoRiskScore,
                    wildfireRiskScore: climate.wildfireRiskScore,
                    earthquakeRiskScore: climate.earthquakeRiskScore,
                    hurricaneRiskScore: climate.hurricaneRiskScore,
                    daysMaxGt90FAnnual: climate.daysMaxGt90FAnnual,
                    daysMinLt32FAnnual: climate.daysMinLt32FAnnual,
                    sunshineHoursAnnual: climate.sunshineHoursAnnual,
                },
                fiscal: {
                    fiscalTier: loc.fiscal.fiscalTier,
                    taxCompetitivenessScore: loc.fiscal.taxCompetitivenessScore,
                    statePensionFundedRatio: loc.fiscal.statePensionFundedRatio,
                },
                // ponytail: include education.publicSchoolRatingAvg in the list
                // payload so parents can scan schools across the corpus without
                // hitting detail. studentTeacherRatio is intentionally omitted —
                // it's a `0:1` placeholder for every CBSA (NCES CCD not pulled);
                // surfacing bad data is worse than missing data.
                education: loc.education?.publicSchoolRatingAvg != null
                    ? { publicSchoolRatingAvg: loc.education.publicSchoolRatingAvg }
                    : undefined,
            });
            if (results.length >= limit)
                break;
        }
        return { total: results.length, locations: results };
    }
    // ── Scoring ──
    scoreLocations(filters, userId) {
        const locations = (0, locations_loader_1.loadLocations)();
        const stats = getStats();
        // ponytail: source weights in this priority — (1) caller-supplied
        // filters.weights, (2) profile.softWeights when the request has a
        // userId, (3) DEFAULT_WEIGHTS. The profile keys (cost, climate, crime,
        // amenities, broadband) don't match engine keys 1:1, so map them.
        // Outdoors has no profile equivalent → falls back to DEFAULT_WEIGHTS.outdoors.
        let weights;
        let weightsFromProfile = false;
        if (filters.weights) {
            weights = filters.weights;
        }
        else if (userId) {
            const profileWeights = this.getUserProfile(userId).softWeights;
            if (profileWeights && Object.keys(profileWeights).length > 0) {
                weights = {
                    cost: profileWeights.cost ?? DEFAULT_WEIGHTS.cost,
                    climate: profileWeights.climate ?? DEFAULT_WEIGHTS.climate,
                    safety: profileWeights.crime ?? DEFAULT_WEIGHTS.safety,
                    healthcare: profileWeights.amenities ?? DEFAULT_WEIGHTS.healthcare,
                    jobs: profileWeights.broadband ?? DEFAULT_WEIGHTS.jobs,
                    outdoors: DEFAULT_WEIGHTS.outdoors,
                };
                weightsFromProfile = true;
            }
            else {
                weights = DEFAULT_WEIGHTS;
            }
        }
        else {
            weights = DEFAULT_WEIGHTS;
        }
        // ponytail: prefer shared-schema's `topK`, fall back to legacy `limit`,
        // then service default. Keeps FE contract and back-compat callers working.
        const limit = filters.topK ?? filters.limit ?? 20;
        // ponytail: F17 dismissal set feeds both the cache key and the score
        // pass — hoisted up-front so they agree.
        const dismissedIds = new Set();
        if (userId) {
            const hf = this.getUserProfile(userId).hardFilters ?? [];
            for (const f of hf) {
                if (f.field === 'locationId' && f.operator === 'notIn' && Array.isArray(f.value)) {
                    for (const id of f.value)
                        dismissedIds.add(String(id));
                }
            }
        }
        const cleanFilters = {};
        if (filters.states)
            cleanFilters['states'] = filters.states;
        if (filters.excludeStates)
            cleanFilters['excludeStates'] = filters.excludeStates;
        if (filters.maxHomeValue)
            cleanFilters['maxHomeValue'] = filters.maxHomeValue;
        if (filters.maxRent)
            cleanFilters['maxRent'] = filters.maxRent;
        if (filters.maxRiskTornado)
            cleanFilters['maxRiskTornado'] = filters.maxRiskTornado;
        if (filters.maxRiskHurricane)
            cleanFilters['maxRiskHurricane'] = filters.maxRiskHurricane;
        if (filters.maxRiskEarthquake)
            cleanFilters['maxRiskEarthquake'] = filters.maxRiskEarthquake;
        if (filters.maxRiskWildfire)
            cleanFilters['maxRiskWildfire'] = filters.maxRiskWildfire;
        if (filters.maxHotDays)
            cleanFilters['maxHotDays'] = filters.maxHotDays;
        if (filters.maxColdDays)
            cleanFilters['maxColdDays'] = filters.maxColdDays;
        if (filters.minPopulation)
            cleanFilters['minPopulation'] = filters.minPopulation;
        // ponytail: read-through cache, TTL 5m. weights + cleanFilters +
        // range filters + dismissed + limit + userId fully describe the score;
        // mutating any one naturally rolls a different key.
        const cacheKey = `score:${relocationCache_1.RelocationCache.hashKey({
            weights,
            cleanFilters,
            rangeFilters: filters.filters ?? {},
            limit,
            userId: userId ?? '',
            dismissed: Array.from(dismissedIds).sort(),
        })}`;
        const cached = this.cache.get(cacheKey);
        if (cached)
            return cached;
        const scored = locations
            .filter((loc) => !dismissedIds.has(loc.id))
            .filter((loc) => applyRangeFilters(loc, filters.filters).included)
            .map((loc) => scoreLocation(loc, weights, stats, cleanFilters))
            .sort((a, b) => b.matchScore - a.matchScore);
        const passed = scored.filter((s) => s.passed);
        const topPassed = passed.slice(0, limit);
        const result = {
            totalScored: scored.length,
            passedFilters: passed.length,
            returned: topPassed.length,
            weights,
            weightsFromProfile,
            topMatches: topPassed.map((s, i) => ({
                rank: i + 1,
                id: s.location.id,
                name: s.location.name,
                state: s.location.state,
                matchScore: s.matchScore,
                subscores: s.subscores,
                trace: s.trace,
                dataGaps: s.dataGaps.slice(0, 5),
                keyMetrics: {
                    medianHomeValue: s.location.cost.medianHomeValue,
                    medianRent: s.location.cost.medianRent,
                    costOfLivingIndex: s.location.cost.costOfLivingIndex,
                    violentCrimeRatePer100k: s.location.crime.violentCrimeRatePer100k,
                    tornadoRiskScore: s.location.climate.tornadoRiskScore,
                    daysMaxGt90FAnnual: s.location.climate.daysMaxGt90FAnnual,
                    healthcareAccessScore: s.location.healthcare.healthcareAccessScore,
                },
            })),
        };
        // ponytail: 5-minute TTL — covers the iterative score-browse loop
        // without serving stale scores when the corpus or user weights change.
        this.cache.set(cacheKey, result, 300);
        return result;
    }
    // ── Explain ──
    explainScore(locationId, weights) {
        const loc = this.findLocation(locationId);
        if (!loc) {
            return { error: `Location '${locationId}' not found. Use search_locations to find valid IDs.` };
        }
        const stats = getStats();
        const w = weights ?? DEFAULT_WEIGHTS;
        const scored = scoreLocation(loc, w, stats, {});
        return {
            location: { id: loc.id, name: loc.name, state: loc.state },
            matchScore: scored.matchScore,
            subscores: scored.subscores,
            explanation: scored.trace,
            dataGaps: {
                count: scored.dataGaps.length,
                fields: scored.dataGaps,
                note: `${scored.dataGaps.length} of 20 metrics have no data (0.0 sentinel). Scores use neutral 50 for missing categories.`,
            },
            weightsUsed: w,
            allMetrics: {
                cost: loc.cost,
                climate: loc.climate,
                crime: loc.crime,
                healthcare: loc.healthcare,
                broadband: loc.broadband,
                fiscal: loc.fiscal,
                amenities: loc.amenities,
                blended: loc.blended,
            },
        };
    }
    // ── Compare ──
    compareLocations(locationIds, weights) {
        const w = weights ?? DEFAULT_WEIGHTS;
        const stats = getStats();
        const results = [];
        for (const locId of locationIds) {
            const loc = this.findLocation(locId);
            if (loc) {
                results.push(scoreLocation(loc, w, stats, {}));
            }
        }
        if (results.length < 2) {
            return { error: 'Need at least 2 valid location IDs. Use search_locations to find IDs.' };
        }
        const winner = results.reduce((a, b) => (a.matchScore > b.matchScore ? a : b));
        return {
            locations: results,
            winner: winner.location.name,
        };
    }
    // ── Fiscal health ──
    fiscalHealth(locationId) {
        const loc = this.findLocation(locationId);
        if (!loc) {
            return { error: `Location '${locationId}' not found.` };
        }
        const fiscal = loc.fiscal;
        const cost = loc.cost;
        // Fiscal health assessment
        // ponytail: switched to Equable Institute five-tier brackets and
        // graduated pension/tax adjustments. The previous two-bucket
        // (<0.6 / >0.9) approach collapsed CT (0.663), HI (0.583), PA (0.616)
        // into the same -10 penalty as NJ (0.512), KY (0.475) — distinct
        // fiscal profiles with distinct user-relevant risk profiles.
        let healthScore = 50;
        let riskLevel = 'Moderate';
        let outlook = 'Stable';
        if (fiscal.fiscalTier === 'Resilient') {
            healthScore = 80;
            riskLevel = 'Low';
            outlook = 'Taxes likely to remain stable or decrease';
        }
        else if (fiscal.fiscalTier === 'Distressed') {
            healthScore = 20;
            riskLevel = 'High';
            outlook = 'High risk of tax increases or service cuts';
        }
        else if (fiscal.fiscalTier === 'Fragile') {
            healthScore = 40;
            riskLevel = 'Elevated';
            outlook = 'Moderate risk of tax increases in next 5-10 years';
        }
        // Equable five-tier pension ratios: <0.6 Distressed, 0.6-0.7 Fragile,
        // 0.7-0.8 Moderate, 0.8-0.9 Healthy, >0.9 Strong.
        const pensionRatio = fiscal.statePensionFundedRatio;
        if (pensionRatio >= 0.9)
            healthScore += 10;
        else if (pensionRatio >= 0.8)
            healthScore += 5;
        // 0.7-0.8 leaves the baseline neutral
        else if (pensionRatio >= 0.6)
            healthScore -= 5;
        else
            healthScore -= 10;
        const taxScore = fiscal.taxCompetitivenessScore;
        if (taxScore > 80)
            healthScore += 5;
        else if (taxScore < 40)
            healthScore -= 5;
        healthScore = Math.max(0, Math.min(100, healthScore));
        const estimated10yrTaxIncrease = riskLevel === 'High' ? '15-25%' : riskLevel === 'Elevated' ? '5-15%' : '0-5%';
        return {
            location: { id: loc.id, name: loc.name, state: loc.state },
            fiscalProfile: {
                fiscalTier: fiscal.fiscalTier,
                healthScore,
                riskLevel,
                outlook,
                estimated10yrTaxIncrease,
                statePensionFundedRatio: fiscal.statePensionFundedRatio,
                taxCompetitivenessScore: fiscal.taxCompetitivenessScore,
                stateIncomeTaxRate: cost.stateIncomeTaxRate,
                propertyTaxRate: cost.propertyTaxRate,
            },
        };
    }
    // ── User profiles ──
    // ponytail: JSON blob storage — profile is small, read-once-per-session,
    // no column-per-field needed; full upsert via ON CONFLICT replaces a
    // read-modify-write pair with one statement.
    getUserProfile(userId) {
        const row = this.db.get('SELECT profile_data FROM relocation_user_profile WHERE user_id = ?', userId);
        if (!row)
            return getDefaultProfile(userId);
        try {
            return JSON.parse(row.profile_data);
        }
        catch {
            // ponytail: corrupt JSON → fall back to default rather than 500ing the
            // whole profile endpoint. Caller can upsert to overwrite.
            return getDefaultProfile(userId);
        }
    }
    upsertUserProfile(userId, updates) {
        const existing = this.getUserProfile(userId);
        const updated = {
            ...existing,
            ...updates,
            userId,
            updatedAt: new Date().toISOString(),
        };
        this.db.run(`INSERT INTO relocation_user_profile (user_id, profile_data) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         profile_data = excluded.profile_data,
         updated_at = CURRENT_TIMESTAMP`, userId, JSON.stringify(updated));
        return updated;
    }
    // ── Elicitation ──
    /**
     * POST /api/relocation/profile/elicitation/start
     *
     * Begin a new elicitation round.  Returns the first question and a
     * sessionId used for subsequent respond calls.
     */
    startElicitation(userId) {
        const sessionId = newSessionId();
        const firstQuestion = ELICITATION_QUESTIONS[0];
        const session = {
            sessionId,
            userId,
            currentQuestion: firstQuestion,
            roundsCompleted: 0,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        elicitationSessions.set(sessionId, session);
        elicitationAnswers.set(sessionId, []);
        return { sessionId, firstQuestion };
    }
    /**
     * POST /api/relocation/profile/elicitation/respond
     *
     * Record an answer to the current question.  Returns either the next
     * question or signals completion with a profileSnapshot.
     */
    respondToElicitation(userId, sessionId, answer) {
        const session = elicitationSessions.get(sessionId);
        if (!session) {
            // Graceful fallback: create a fresh session so the frontend
            // doesn't crash on an expired/stale sessionId.
            const fresh = this.startElicitation(userId);
            return {
                nextQuestion: fresh.firstQuestion,
                done: false,
                profileSnapshot: this.getUserProfile(userId),
            };
        }
        if (session.status !== 'active') {
            return {
                nextQuestion: null,
                done: true,
                profileSnapshot: this.getUserProfile(userId),
            };
        }
        // Record answer
        const answers = elicitationAnswers.get(sessionId) ?? [];
        answers.push(answer);
        elicitationAnswers.set(sessionId, answers);
        const round = answers.length; // 1-based after push
        // Map answer to profile update
        this._applyElicitationAnswer(userId, round, answer);
        // Determine next question or completion
        const nextIndex = round; // 0-based index for next question
        const done = nextIndex >= ELICITATION_QUESTIONS.length;
        const nextQuestion = done
            ? null
            : ELICITATION_QUESTIONS[nextIndex];
        // Update session
        const updatedSession = {
            ...session,
            currentQuestion: nextQuestion,
            roundsCompleted: round,
            status: done ? 'complete' : 'active',
            updatedAt: new Date().toISOString(),
        };
        elicitationSessions.set(sessionId, updatedSession);
        // Update profile lifecycle counters
        const profile = this.getUserProfile(userId);
        if (done) {
            this.upsertUserProfile(userId, {
                elicitationRoundsCompleted: profile.elicitationRoundsCompleted + 1,
            });
        }
        return {
            nextQuestion,
            done,
            profileSnapshot: this.getUserProfile(userId),
        };
    }
    // ── Implicit signals ──
    /**
     * POST /api/relocation/profile/signal
     *
     * Record a behavioral signal (pan, dismiss, save, dwell, etc.) and
     * update the user profile.  This is the core of the TikTok-style
     * learning loop per RESEARCH.md §1.
     *
     * F17: candidate_dismiss signals bump a per-user, per-location counter
     * on the profile.  When the counter reaches HARD_FILTER_DISMISS_THRESHOLD,
     * the response carries a `hardFilterProposal` so the client can offer
     * to add a hard filter for that location.
     */
    submitImplicitSignal(userId, signal) {
        implicitSignals.push(signal);
        const profile = this.getUserProfile(userId);
        const updates = {
            implicitSignalCount: profile.implicitSignalCount + 1,
        };
        let hardFilterProposal;
        if (signal.kind === 'candidate_dismiss') {
            // ponytail: per-user, per-location Map lives in the profile JSON blob —
            // one read-modify-write upsert, no separate in-memory state to leak
            // across users on restart.
            const counts = { ...(profile.dismissCounts ?? {}) };
            const next = (counts[signal.locationId] ?? 0) + 1;
            counts[signal.locationId] = next;
            updates.dismissCounts = counts;
            if (next === HARD_FILTER_DISMISS_THRESHOLD) {
                const loc = this.getLocationById(signal.locationId);
                if (loc) {
                    hardFilterProposal = {
                        locationId: loc.id,
                        locationName: loc.name,
                        dismissCount: next,
                    };
                }
            }
        }
        const updatedProfile = this.upsertUserProfile(userId, updates);
        return hardFilterProposal
            ? { profileSnapshot: updatedProfile, hardFilterProposal }
            : { profileSnapshot: updatedProfile };
    }
    // ── Elicitation internals ──────────────────────────────────────────────
    /**
     * Translate an elicitation answer into a profile update.
     *
     * Per RESEARCH.md §2: stated preferences are a _weak prior_ — they
     * seed softWeights but revealed signals carry more weight.  This
     * method only nudges the default weights; the full embedding model
     * (Qdrant) will override them as implicit signals accumulate.
     */
    _applyElicitationAnswer(userId, round, answer) {
        const profile = this.getUserProfile(userId);
        const weights = { ...profile.softWeights };
        switch (round) {
            case 1: { // Q1 — cost priority
                if (answer === 'cost_high') {
                    weights.cost = 0.5;
                    weights.climate = 0.15;
                    weights.crime = 0.1;
                    weights.amenities = 0.125;
                    weights.broadband = 0.125;
                }
                else if (answer === 'cost_medium') {
                    // keep defaults (already set)
                }
                else if (answer === 'cost_low') {
                    weights.cost = 0.15;
                    weights.climate = 0.3;
                    weights.crime = 0.2;
                    weights.amenities = 0.175;
                    weights.broadband = 0.175;
                }
                break;
            }
            case 2: { // Q2 — climate preference
                if (answer === 'warm') {
                    // Favor warm/dry: push up climate, push down cold-tolerant concerns
                    weights.climate = (weights.climate ?? 0.25) + 0.1;
                    weights.cost = (weights.cost ?? 0.35) - 0.05;
                }
                else if (answer === 'cold_tolerant') {
                    weights.climate = (weights.climate ?? 0.25) - 0.05;
                    weights.cost = (weights.cost ?? 0.35) + 0.05;
                }
                // 'four_seasons', 'mild' — leave weights as-is
                break;
            }
            case 3: { // Q3 — deal-breaker
                const stated = [];
                if (answer === 'low_taxes') {
                    stated.push({ metric: 'cost', rank: 1, weight: 0.4 });
                    weights.cost = 0.45;
                }
                else if (answer === 'safety') {
                    stated.push({ metric: 'crime', rank: 1, weight: 0.4 });
                    weights.crime = 0.35;
                }
                else if (answer === 'schools') {
                    // ponytail: schools/healthcare were one option (schools_healthcare).
                    // Split the Q3 branch the same way the options were split so the
                    // new values actually map to weights — otherwise the answer
                    // silently no-ops.
                    stated.push({ metric: 'amenities', rank: 1, weight: 0.4 });
                    weights.amenities = 0.3;
                }
                else if (answer === 'healthcare_access') {
                    stated.push({ metric: 'amenities', rank: 1, weight: 0.4 });
                    weights.amenities = 0.3;
                }
                else if (answer === 'jobs_internet') {
                    stated.push({ metric: 'broadband', rank: 1, weight: 0.4 });
                    weights.broadband = 0.3;
                }
                else if (answer === 'nature') {
                    stated.push({ metric: 'amenities', rank: 1, weight: 0.3 });
                    weights.amenities = 0.25;
                }
                if (stated.length > 0) {
                    this.upsertUserProfile(userId, { statedPriorities: stated });
                }
                break;
            }
        }
        // Normalize weights to sum to 1.0
        const wKeys = Object.keys(weights);
        const wSum = wKeys.reduce((s, k) => s + (weights[k] ?? 0), 0);
        if (wSum > 0) {
            for (const k of wKeys) {
                weights[k] = Math.round(((weights[k] ?? 0) / wSum) * 1000) / 1000;
            }
        }
        this.upsertUserProfile(userId, { softWeights: weights });
    }
    // ── Move Checklist ──
    /**
     * Generate and apply a personalized move checklist to a trip's todo list.
     * Reads templates, filters by user profile (demographic, state, first-timer),
     * computes absolute dates from moveDate + daysOffset, and bulk-inserts via
     * todoService.createItem.
     *
     * Idempotent: checks for an existing 'move-checklist' category marker before
     * inserting, so calling twice on the same trip doesn't duplicate tasks.
     */
    applyMoveChecklist(userId, tripId, moveDate) {
        const profile = this.getUserProfile(userId);
        const ctx = profile.moveContext;
        // Map schema fields (isFirstMove/demographic singular) to selector fields
        // (firstTimeMover/demographics[]). Without this, the selector silently
        // returns the baseline only and personalization is broken.
        const tasks = (0, move_checklist_templates_1.selectChecklistTasks)({
            firstTimeMover: ctx?.isFirstMove,
            demographics: ctx?.demographic ? [ctx.demographic] : undefined,
            destinationState: ctx?.destinationState,
            hasPets: ctx?.hasPets,
        });
        // Idempotency: skip if already applied
        const existing = (0, todoService_1.listItems)(tripId).filter((t) => t.category === 'move-checklist');
        if (existing.length > 0) {
            return { applied: 0, skipped: true, reason: 'already-applied', existing: existing.length };
        }
        const base = new Date(moveDate);
        if (isNaN(base.getTime())) {
            return { applied: 0, skipped: false, error: 'Invalid move date' };
        }
        const added = [];
        for (const task of tasks) {
            const due = new Date(base);
            // ponytail: UTC arithmetic — setDate in local TZ shifts across DST.
            due.setUTCDate(due.getUTCDate() + task.daysOffset);
            const item = (0, todoService_1.createItem)(tripId, {
                name: task.name,
                category: 'move-checklist',
                due_date: due.toISOString().slice(0, 10),
                description: task.description,
                priority: task.priority,
            });
            added.push(item);
        }
        return { applied: added.length, skipped: false, tasks: added };
    }
    // ── Helpers ──
    findLocation(query) {
        const locations = (0, locations_loader_1.loadLocations)();
        // Exact match
        const exact = locations.find((l) => l.id === query);
        if (exact)
            return exact;
        // Fuzzy match
        const q = query.toLowerCase();
        const parts = q.split('-');
        const city = parts[0];
        const state = parts.length > 1 ? parts[parts.length - 1] : '';
        for (const l of locations) {
            const lid = l.id.toLowerCase();
            const name = l.name.toLowerCase();
            if (lid.startsWith(city) && (!state || lid.endsWith('-' + state))) {
                return l;
            }
            if (name.split(',')[0].trim().toLowerCase().includes(city) &&
                (!state || l.state.toLowerCase() === state)) {
                return l;
            }
        }
        return undefined;
    }
    // ── Offline bundle ────────────────────────────────────────────────────
    // ponytail: aggregates every relocation-scoped record for offline caching
    // (legacy /api/relocation/bundle). Mirrors TripsService#bundle(): no new
    // logic, just the existing per-domain reads stitched into one payload so
    // the FE can render the entire workspace without the network.
    bundle(userId) {
        const uid = Number(userId);
        const candidates = this.searchLocations({ limit: 1000 });
        const scores = this.scoreLocations({ topK: 1000 }, userId);
        // ponytail: move-checklist tasks live on the user's relocation trip's
        // todo list (see applyMoveChecklist). One row per user — look it up by
        // kind. No trip → empty list; the FE renders "no checklist yet".
        const trip = this.db.get(`SELECT id FROM trips WHERE user_id = ? AND kind = 'relocation' LIMIT 1`, uid);
        const checklist = trip
            ? (0, todoService_1.listItems)(String(trip.id)).filter((t) => t.category === 'move-checklist')
            : [];
        // ponytail: `journey` is optional so MCP-direct instantiations keep
        // compiling. In Nest it is always injected (RelocationModule lists it
        // as a provider); the ?-chain only fires if someone wires it without
        // the dep — bundle() callers will get null journey in that case.
        return {
            exportedAt: new Date().toISOString(),
            userId,
            profile: this.getUserProfile(userId),
            candidates: candidates.locations,
            scores: scores.topMatches,
            weightsUsed: scores.weights,
            journey: this.journey?.getJourney(uid) ?? null,
            checklist,
        };
    }
    // ── DSR (GDPR/CCPA) ─────────────────────────────────────────────────
    // ponytail: gather every relocation-scoped row for the user; serialise
    // verbatim. Elicitation sessions are in-memory and swept by userId match.
    /** Collect every relocation-scoped record for export. */
    exportUserData(userId) {
        const sessions = [];
        for (const s of elicitationSessions.values()) {
            if (s.userId === userId)
                sessions.push(s);
        }
        return { profile: this.getUserProfile(userId), elicitationSessions: sessions };
    }
    /** Purge all relocation-scoped records for the user. */
    deleteUserData(userId) {
        const res = this.db.run('DELETE FROM relocation_user_profile WHERE user_id = ?', userId);
        let sessionsCleared = 0;
        for (const [sessionId, session] of elicitationSessions) {
            if (session.userId === userId) {
                elicitationSessions.delete(sessionId);
                elicitationAnswers.delete(sessionId);
                sessionsCleared += 1;
            }
        }
        return {
            profileDeleted: res.changes > 0,
            elicitationSessionsCleared: sessionsCleared,
        };
    }
};
exports.RelocationService = RelocationService;
exports.RelocationService = RelocationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        relocation_journey_service_1.RelocationJourneyService])
], RelocationService);
