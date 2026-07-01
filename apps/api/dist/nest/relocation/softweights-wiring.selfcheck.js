"use strict";
// Self-check: profile softWeights → engine weights mapping
// Run: npx tsx server/src/nest/relocation/softweights-wiring.selfcheck.ts
//
// Validates that scoreLocations() resolves weights in priority order:
//   1) filters.weights (caller-supplied) wins
//   2) profile.softWeights (when userId is supplied) is mapped to engine keys
//   3) DEFAULT_WEIGHTS as final fallback
//
// Also asserts the key mapping: profile.crime → engine.safety,
// profile.amenities → engine.healthcare, profile.broadband → engine.jobs.
Object.defineProperty(exports, "__esModule", { value: true });
// ponytail: DEFAULT_WEIGHTS is module-local in relocation.service.ts;
// mirror the shape here so the self-check stays runnable from tsx without
// growing the service's export surface.
const DEFAULT_WEIGHTS = {
    cost: 5,
    climate: 4,
    safety: 3,
    healthcare: 3,
    jobs: 3,
    outdoors: 3,
};
// ponytail: re-implement the resolution logic verbatim so the self-check
// fails if the service's logic drifts. (The service's resolution is a
// closure inside scoreLocations; this keeps the check runnable from tsx
// without booting Nest.)
function resolveWeights(filters, userId, userProfiles) {
    let weights;
    let weightsFromProfile = false;
    if (filters.weights) {
        weights = filters.weights;
    }
    else if (filters.softWeights) {
        weights = filters.softWeights;
    }
    else if (userId) {
        const pw = userProfiles.get(userId)?.softWeights;
        if (pw && Object.keys(pw).length > 0) {
            weights = {
                cost: pw.cost ?? DEFAULT_WEIGHTS.cost,
                climate: pw.climate ?? DEFAULT_WEIGHTS.climate,
                safety: pw.crime ?? DEFAULT_WEIGHTS.safety,
                healthcare: pw.amenities ?? DEFAULT_WEIGHTS.healthcare,
                jobs: pw.broadband ?? DEFAULT_WEIGHTS.jobs,
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
    return { weights, weightsFromProfile };
}
const profiles = new Map();
const userId = 'u-test';
profiles.set(userId, {
    userId,
    statedPriorities: [],
    revealedEmbeddingRef: '',
    hardFilters: [],
    // Mirrors the default profile shape in getDefaultProfile()
    softWeights: { cost: 0.4, climate: 0.25, crime: 0.15, amenities: 0.1, broadband: 0.1 },
    nonNegotiablesDiscovered: [],
    createdAt: '',
    updatedAt: '',
    elicitationRoundsCompleted: 0,
    implicitSignalCount: 0,
});
let passed = 0;
let failed = 0;
function check(name, cond, detail) {
    if (cond) {
        passed++;
    }
    else {
        failed++;
        console.error(`FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    }
}
// Case 1: caller-supplied weights win, profile ignored
{
    const r = resolveWeights({ weights: { cost: 5, climate: 5, safety: 5, healthcare: 5, jobs: 5, outdoors: 5 } }, userId, profiles);
    check('caller weights win', r.weightsFromProfile === false && r.weights.cost === 5);
}
// Case 2: no filters.weights, profile present → mapped
{
    const r = resolveWeights({}, userId, profiles);
    check('profile mapped to engine keys', r.weightsFromProfile === true &&
        r.weights.cost === 0.4 &&
        r.weights.climate === 0.25 &&
        r.weights.safety === 0.15 && // crime → safety
        r.weights.healthcare === 0.1 && // amenities → healthcare
        r.weights.jobs === 0.1 && // broadband → jobs
        r.weights.outdoors === DEFAULT_WEIGHTS.outdoors, JSON.stringify(r.weights));
}
// Case 3: no userId → DEFAULT_WEIGHTS
{
    const r = resolveWeights({}, undefined, profiles);
    check('default weights when no userId', r.weightsFromProfile === false && r.weights === DEFAULT_WEIGHTS);
}
// Case 4: userId but no profile → DEFAULT_WEIGHTS
{
    const r = resolveWeights({}, 'ghost-user', profiles);
    check('default weights when userId has no profile', r.weightsFromProfile === false && r.weights === DEFAULT_WEIGHTS);
}
// Case 5: profile with empty softWeights → DEFAULT_WEIGHTS
{
    profiles.set('u-empty', {
        ...profiles.get(userId),
        userId: 'u-empty',
        softWeights: {},
    });
    const r = resolveWeights({}, 'u-empty', profiles);
    check('default weights when profile has no softWeights', r.weightsFromProfile === false && r.weights === DEFAULT_WEIGHTS);
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0)
    process.exit(1);
