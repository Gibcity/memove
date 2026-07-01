"use strict";
// Self-check: viewport aggregation (bounds containment + missing-aware mean).
// Run: npx tsx server/src/nest/relocation/viewport-stats.selfcheck.ts
//
// Validates against the live corpus that aggregateViewportStats:
//   - counts only metros whose centroid is inside the bounds
//   - averages each metric over in-view metros, skipping missing values
//     (the same isMissing convention the scorer uses)
Object.defineProperty(exports, "__esModule", { value: true });
const relocation_service_1 = require("./relocation.service");
const svc = new relocation_service_1.RelocationService();
const all = svc.getAllLocations();
let passed = 0;
let failed = 0;
function check(desc, cond) {
    if (cond)
        passed++;
    else {
        failed++;
        console.error(`FAIL: ${desc}`);
    }
}
// Continental-US box: should contain essentially the whole corpus.
const conus = { north: 50, south: 24, east: -66, west: -125 };
const res = svc.aggregateViewportStats(conus);
const expectedInView = all.filter((l) => l.lat <= 50 && l.lat >= 24 && l.lng <= -66 && l.lng >= -125).length;
check(`count matches manual filter (${res.count} === ${expectedInView})`, res.count === expectedInView);
check('CONUS contains most of corpus', res.count > all.length * 0.8);
// Independent mean of medianHomeValue over in-view metros, skipping 0/missing.
const inView = all.filter((l) => l.lat <= 50 && l.lat >= 24 && l.lng <= -66 && l.lng >= -125);
const vals = inView.map((l) => l.cost.medianHomeValue).filter((v) => Number.isFinite(v) && v !== 0);
const expectedMean = vals.reduce((a, b) => a + b, 0) / vals.length;
check(`medianHomeValue avg matches (${res.averages['medianHomeValue']} ≈ ${expectedMean})`, Math.abs((res.averages['medianHomeValue'] ?? 0) - expectedMean) < 1e-6);
// Empty viewport (mid-ocean) → zero count, no averages, bounds echoed back.
const empty = svc.aggregateViewportStats({ north: 5, south: 0, east: -30, west: -40 });
check('empty viewport count === 0', empty.count === 0);
check('empty viewport has no averages', Object.keys(empty.averages).length === 0);
check('bounds echoed back', empty.bounds.north === 5 && empty.bounds.west === -40);
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0)
    process.exit(1);
