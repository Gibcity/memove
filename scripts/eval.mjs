#!/usr/bin/env node
// ponytail: §10.6 ranking gate. Loads fixtures, runs each through the real
// scoring service, checks three things per case:
//   (1) ordering overlap — actual top-K contains at least K * overlap
//       fraction of the expected IDs (defaults to 0.6, loosens when data
//       shifts but still catches a reversed ranking).
//   (2) minTopScore — actual top-1 score >= asserted floor.
//   (3) top5Contains — actual top-5 includes at least one asserted state
//       (sanity check on geographic sanity of the ranking).
// Exit 0 iff every case passes. Default threshold 1.0 (all must pass);
// override with EVAL_PASS_THRESHOLD env var for staged rollout.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const memoveRoot = resolve(here, '..');
const repoRoot = resolve(memoveRoot, '..');
const require = createRequire(import.meta.url);
const svcMod = require(resolve(memoveRoot, 'server/dist/nest/relocation/relocation.service.js'));
const inst = new svcMod.RelocationService();

const fixturePath = resolve(here, 'eval/fixtures/ranking-cases.json');
const data = JSON.parse(readFileSync(fixturePath, 'utf-8'));
const threshold = Number(process.env.EVAL_PASS_THRESHOLD ?? '1.0');
const overlapFraction = Number(process.env.EVAL_OVERLAP ?? '0.6');

const lines = [];
function log(s = '') { lines.push(s); console.log(s); }

log(`§10.6 ranking eval — ${data.fixtures.length} cases, threshold=${threshold}, overlap=${overlapFraction}`);
log('');

let passed = 0;
const failures = [];

for (const fx of data.fixtures) {
  const filters = { weights: fx.weights, topK: 5, ...fx.filters };
  const r = inst.scoreLocations(filters);
  const actual = r.topMatches;
  const expectedIds = fx.expectedTop5.map((m) => m.id);
  const actualIds = actual.map((m) => m.id);

  // (1) Ordering overlap — Jaccard-like on top-K IDs.
  const expectedSet = new Set(expectedIds);
  const intersect = actualIds.filter((id) => expectedSet.has(id)).length;
  const overlap = intersect / Math.max(expectedIds.length, 1);
  const overlapOk = overlap >= overlapFraction;

  // (2) minTopScore
  const minTopScore = fx.assertions?.minTopScore ?? 0;
  const actualTopScore = actual[0]?.matchScore ?? 0;
  const scoreOk = actualTopScore >= minTopScore;

  // (3) top5Contains — at least one asserted state present in actual top-5
  const containsStates = fx.assertions?.top5Contains ?? [];
  const actualStates = new Set(actual.map((m) => m.state));
  const containHit = containsStates.find((s) => actualStates.has(s));
  const containOk = !containsStates.length || !!containHit;

  const caseOk = overlapOk && scoreOk && containOk;
  if (caseOk) passed += 1;
  else failures.push(fx.id);

  const sym = caseOk ? '✓' : '✗';
  log(`${sym} ${fx.id.padEnd(22)} score=${actualTopScore} (min=${minTopScore}) overlap=${(overlap * 100).toFixed(0)}% contains=${containHit ?? '∅'}`);
  if (!caseOk) {
    log(`    expected: ${expectedIds.join(', ')}`);
    log(`    actual:   ${actualIds.join(', ')}`);
  }
}

const total = data.fixtures.length;
const ratio = passed / total;
log('');
log(`result: ${passed}/${total} pass (${(ratio * 100).toFixed(0)}%)`);
if (failures.length) {
  log(`failures: ${failures.join(', ')}`);
}
process.exit(ratio >= threshold ? 0 : 1);