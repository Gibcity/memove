// ponytail: this file exists once, used to generate fixtures; the fixtures
// themselves are the artifact that ships. Ponytail mode: hand-curated profiles
// at the top so geographic sanity stays asserted; algorithmic sweep at the
// bottom so fixture count grows beyond what a human will hand-write.
//
// The generator (`generate-fixtures.mjs`) reads both halves; the resulting
// `ranking-cases.json` is what `eval.mjs` actually gates on.
//
// To grow fixtures: append to HAND_CURATED for human-named profiles, or
// tweak the SWEEP knobs at the bottom. Re-run `node scripts/eval/generate-fixtures.mjs`.

export const HAND_CURATED = [
  { id: 'budget-retiree',         label: 'Budget retiree — cost dominant, low climate/safety weight',
    weights: { cost: 10, climate: 1, safety: 3, healthcare: 5, jobs: 0, outdoors: 2 },
    assertStates: ['TX', 'IA', 'OK', 'KS', 'MS', 'AL', 'AR'] },
  { id: 'tech-young-pro',         label: 'Young tech professional — broadband/tax (jobs) heavy',
    weights: { cost: 4, climate: 2, safety: 3, healthcare: 2, jobs: 10, outdoors: 2 },
    assertStates: ['WY', 'SD', 'TX', 'NV', 'TN', 'FL'] },
  { id: 'family-school-kids',     label: 'Family w/ school-age kids — balanced, healthcare lifted',
    weights: { cost: 4, climate: 3, safety: 5, healthcare: 6, jobs: 4, outdoors: 3 },
    assertStates: ['TX', 'WY', 'SD', 'NE', 'MN', 'IA'] },
  { id: 'outdoor-enthusiast',     label: 'Outdoor enthusiast — sunshine + low precip max',
    weights: { cost: 3, climate: 2, safety: 3, healthcare: 2, jobs: 1, outdoors: 10 },
    assertStates: ['TX', 'NM', 'AZ', 'CA', 'NV', 'UT', 'CO'] },
  { id: 'climate-mild-seeker',    label: 'Climate-mild seeker — low extremes only',
    weights: { cost: 3, climate: 10, safety: 3, healthcare: 3, jobs: 2, outdoors: 4 },
    assertStates: ['WY', 'TX', 'CO', 'NM', 'OR', 'CA'] },
  { id: 'safety-first',           label: 'Safety-first — minimize violent crime',
    weights: { cost: 3, climate: 2, safety: 10, healthcare: 3, jobs: 3, outdoors: 2 },
    assertStates: ['TX', 'WY', 'SD', 'NE', 'MN', 'IA'] },
  { id: 'remote-worker',          label: 'Remote worker — broadband + cost, no job weight',
    weights: { cost: 6, climate: 4, safety: 4, healthcare: 4, jobs: 0, outdoors: 4 },
    assertStates: ['TX', 'WY', 'NM', 'AZ', 'SD'] },
  { id: 'healthcare-senior',      label: 'Healthcare-prioritizing senior — hospitals/access',
    weights: { cost: 5, climate: 4, safety: 5, healthcare: 10, jobs: 1, outdoors: 3 },
    assertStates: ['TX', 'WY', 'NE', 'SD', 'IA', 'MN'] },
  { id: 'default-balanced',       label: 'Default engine weights (5/4/3/3/3/3)',
    weights: { cost: 5, climate: 4, safety: 3, healthcare: 3, jobs: 3, outdoors: 3 },
    assertStates: ['TX', 'WY', 'SD', 'NE'] },
  { id: 'sun-seeker-cheap',       label: 'Sunshine + cheap — outdoors + cost dominant',
    weights: { cost: 8, climate: 1, safety: 2, healthcare: 2, jobs: 1, outdoors: 8 },
    assertStates: ['TX', 'NM', 'AZ', 'NV', 'CA'] },
  { id: 'no-hurricane',           label: 'Hurricane-averse — climate weight + risk filter',
    weights: { cost: 4, climate: 10, safety: 4, healthcare: 3, jobs: 3, outdoors: 3 },
    maxRiskHurricane: 30,
    assertStates: ['TX', 'WY', 'CO', 'NM', 'OR'] },
  { id: 'no-tornado',             label: 'Tornado-averse — climate weight + risk filter',
    weights: { cost: 4, climate: 10, safety: 4, healthcare: 3, jobs: 3, outdoors: 3 },
    maxRiskTornado: 20,
    assertStates: ['WY', 'CO', 'CA', 'OR', 'WA', 'NM'] },
  { id: 'no-wildfire',            label: 'Wildfire-averse — west-coast exclusion',
    weights: { cost: 4, climate: 10, safety: 4, healthcare: 3, jobs: 3, outdoors: 3 },
    maxRiskWildfire: 25,
    assertStates: ['WY', 'TX', 'CO', 'NE', 'IA', 'MN'] },
  { id: 'metro-only',             label: 'Cheap California — excludeStates CA/AK/HI',
    weights: { cost: 5, climate: 3, safety: 3, healthcare: 3, jobs: 3, outdoors: 3 },
    excludeStates: ['CA', 'AK', 'HI'],
    assertStates: ['TX', 'WY', 'SD', 'NE', 'IA'] },
  { id: 'cold-free',              label: 'No deep cold — maxColdDays 30',
    weights: { cost: 4, climate: 8, safety: 4, healthcare: 3, jobs: 3, outdoors: 4 },
    maxColdDays: 30,
    assertStates: ['TX', 'NM', 'AZ', 'CA', 'FL', 'GA'] },
];

// ponytail: programmatic sweep — produces weight-vector permutations across
// the six scoring axes. Goal: grow fixture count to 100+ (T17) without
// hand-writing each case. State-assertions fall back to the historical
// geographic winners (TX/WY/SD) so the gate keeps checking sanity without
// locking every case to a brittle per-profile state list.
const METRIC_KEYS = ['cost', 'climate', 'safety', 'healthcare', 'jobs', 'outdoors'];
const SWEEP_AXES = [
  { axis: 'cost',        values: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] },
  { axis: 'climate',     values: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] },
  { axis: 'safety',      values: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] },
  { axis: 'healthcare',  values: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] },
  { axis: 'jobs',        values: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] },
  { axis: 'outdoors',    values: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] },
];
const DEFAULT_BALANCED = { cost: 5, climate: 4, safety: 3, healthcare: 3, jobs: 3, outdoors: 3 };

function* sweep(axis, values) {
  for (const v of values) {
    const weights = { ...DEFAULT_BALANCED, [axis]: v };
    yield {
      id: `sweep-${axis}-${v}`,
      label: `Sweep — ${axis} weight=${v}, others default`,
      weights,
      assertStates: ['TX', 'WY', 'SD', 'NE'],
    };
  }
}

const FILTER_VARIANTS = [
  { id: 'flt-low-tornado',  maxRiskTornado: 15,   assertStates: ['WY', 'CO', 'CA', 'OR', 'NM', 'WA'] },
  { id: 'flt-low-hurricane', maxRiskHurricane: 10, assertStates: ['WY', 'TX', 'CO', 'NM', 'CA', 'OR'] },
  { id: 'flt-low-wildfire', maxRiskWildfire: 10,  assertStates: ['WY', 'TX', 'NE', 'IA', 'MN', 'SD'] },
  { id: 'flt-low-earthquake', maxRiskEarthquake: 5, assertStates: ['TX', 'FL', 'NC', 'GA', 'IL', 'OH'] },
  { id: 'flt-no-cold',      maxColdDays: 20,      assertStates: ['TX', 'NM', 'AZ', 'CA', 'FL', 'GA'] },
  { id: 'flt-no-heat',      maxHotDays: 30,       assertStates: ['WY', 'MN', 'MT', 'ND', 'ME', 'WA'] },
  { id: 'flt-rural',        minPopulation: 50000, assertStates: ['TX', 'WY', 'SD', 'NE', 'IA', 'KS'] },
  { id: 'flt-metro',        minPopulation: 1000000, assertStates: ['CA', 'TX', 'FL', 'NY', 'IL', 'PA'] },
  { id: 'flt-cheap-housing', maxHomeValue: 250000, assertStates: ['TX', 'IA', 'OK', 'AR', 'MS', 'AL', 'KS'] },
  { id: 'flt-cheap-rent',   maxRent: 1000,        assertStates: ['TX', 'IA', 'OK', 'AR', 'MS', 'AL', 'KS'] },
  { id: 'flt-no-states',    excludeStates: ['CA', 'NY', 'NJ', 'HI', 'AK'], assertStates: ['TX', 'WY', 'SD', 'NE', 'IA'] },
  { id: 'flt-only-states',  states: ['TX', 'WY', 'SD', 'NE', 'OK', 'KS'], assertStates: ['TX', 'WY', 'SD'] },
];

function generateSweep() {
  const out = [];
  for (const { axis, values } of SWEEP_AXES) {
    for (const p of sweep(axis, values)) out.push(p);
  }
  return out;
}

function generateFilterVariants() {
  return FILTER_VARIANTS.map((v) => ({
    id: v.id,
    label: `Filter variant — ${v.id}`,
    weights: DEFAULT_BALANCED,
    ...v,
  }));
}

// ponytail: a few combined (axis-emphasis + filter) cases to exercise the
// full filter×weight space; these are the cheapest way to catch regressions
// where a weight shift defeats a hard filter, e.g. cost=10 should still
// respect maxColdDays.
function generateCombos() {
  const combos = [
    { id: 'combo-cost-no-cold',     weights: { ...DEFAULT_BALANCED, cost: 10 }, maxColdDays: 25, assertStates: ['TX', 'NM', 'AZ', 'CA', 'FL'] },
    { id: 'combo-jobs-low-tornado', weights: { ...DEFAULT_BALANCED, jobs: 10 }, maxRiskTornado: 15, assertStates: ['WY', 'SD', 'CA', 'WA', 'CO'] },
    { id: 'combo-outdoors-no-wildfire', weights: { ...DEFAULT_BALANCED, outdoors: 10 }, maxRiskWildfire: 15, assertStates: ['TX', 'FL', 'NC', 'GA', 'SC'] },
    { id: 'combo-safety-cheap',     weights: { ...DEFAULT_BALANCED, safety: 10, cost: 7 }, assertStates: ['TX', 'WY', 'SD', 'NE', 'IA'] },
    { id: 'combo-healthcare-metro', weights: { ...DEFAULT_BALANCED, healthcare: 10 }, minPopulation: 500000, assertStates: ['CA', 'TX', 'NY', 'FL', 'IL', 'PA'] },
    { id: 'combo-climate-no-states', weights: { ...DEFAULT_BALANCED, climate: 10 }, excludeStates: ['CA', 'FL', 'LA', 'TX'], assertStates: ['WY', 'CO', 'OR', 'NM'] },
    { id: 'combo-cost-only-states', weights: { ...DEFAULT_BALANCED, cost: 10 }, states: ['TX', 'OK', 'KS', 'AR', 'MS', 'AL', 'IA', 'NE'], assertStates: ['TX', 'IA', 'OK', 'AR'] },
    { id: 'combo-safety-metro',    weights: { ...DEFAULT_BALANCED, safety: 10 }, minPopulation: 1000000, assertStates: ['CA', 'TX', 'NY', 'IL', 'PA'] },
    { id: 'combo-jobs-cheap-housing', weights: { ...DEFAULT_BALANCED, jobs: 9, cost: 7 }, maxHomeValue: 300000, assertStates: ['TX', 'NV', 'TN', 'FL', 'AZ'] },
    { id: 'combo-outdoors-no-cold', weights: { ...DEFAULT_BALANCED, outdoors: 10 }, maxColdDays: 15, assertStates: ['TX', 'FL', 'CA', 'AZ', 'NM'] },
  ];
  return combos.map((c) => ({ ...c, label: `Combo — ${c.id}` }));
}

export const PROFILES = [
  ...HAND_CURATED,
  ...generateSweep(),
  ...generateFilterVariants(),
  ...generateCombos(),
];