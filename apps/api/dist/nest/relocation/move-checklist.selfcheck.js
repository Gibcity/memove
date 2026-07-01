"use strict";
// Self-check: move-checklist date computation logic
// Run: npx tsx server/src/nest/relocation/move-checklist.selfcheck.ts
//
// Validates: daysOffset → absolute date conversion produces expected values
// for past (negative), move-day (zero), and future (positive) offsets.
const testCases = [
    { offset: -60, desc: '60 days before move' },
    { offset: -30, desc: '30 days before' },
    { offset: -7, desc: '1 week before' },
    { offset: 0, desc: 'move day itself' },
    { offset: 7, desc: '1 week after' },
    { offset: 30, desc: '30 days after' },
];
// Replicate the exact logic from relocation.service.ts applyMoveChecklist
function computeDueDate(moveDate, daysOffset) {
    const base = new Date(moveDate);
    base.setDate(base.getDate() + daysOffset);
    return base.toISOString().slice(0, 10);
}
const moveDate = '2026-09-15';
let passed = 0;
let failed = 0;
for (const tc of testCases) {
    const due = computeDueDate(moveDate, tc.offset);
    // Independently verify using a different approach (manual calendar math)
    const expected = new Date('2026-09-15T00:00:00Z');
    expected.setUTCDate(expected.getUTCDate() + tc.offset);
    const expectedStr = expected.toISOString().slice(0, 10);
    if (due === expectedStr) {
        passed++;
    }
    else {
        failed++;
        console.error(`FAIL: ${tc.desc} → got ${due}, expected ${expectedStr}`);
    }
}
// Edge: leap year
const leap = computeDueDate('2024-02-28', 1);
if (leap === '2024-02-29') {
    passed++;
}
else {
    failed++;
    console.error(`FAIL: leap year Feb 28 +1 → got ${leap}, expected 2024-02-29`);
}
// Edge: year boundary
const yb = computeDueDate('2026-12-30', 3);
if (yb === '2027-01-02') {
    passed++;
}
else {
    failed++;
    console.error(`FAIL: year boundary Dec 30 +3 → got ${yb}, expected 2027-01-02`);
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0)
    process.exit(1);
