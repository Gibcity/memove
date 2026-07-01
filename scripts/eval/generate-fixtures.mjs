#!/usr/bin/env node
// ponytail: throwaway fixture generator. Runs once per scoring change to
// re-derive the expected top-5 IDs from real data. Lives next to the eval
// script so the workflow is reproducible but the artifact (fixtures/*.json)
// is what ships in git.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { PROFILES } from './profiles.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const trekRoot = resolve(here, '..');
const require = createRequire(import.meta.url);
const svcMod = require(resolve(trekRoot, 'server/dist/nest/relocation/relocation.service.js'));
const inst = new svcMod.RelocationService();

const fixtures = [];
for (const p of PROFILES) {
  const filters = { weights: p.weights, topK: 5 };
  for (const k of ['maxRiskHurricane', 'maxRiskTornado', 'maxRiskWildfire', 'minPopulation', 'maxColdDays', 'excludeStates', 'states']) {
    if (p[k] !== undefined) filters[k] = p[k];
  }
  const r = inst.scoreLocations(filters);
  const top = r.topMatches.map((m) => ({
    id: m.id, name: m.name, state: m.state, score: m.matchScore,
  }));
  // ponytail: assertions are intentionally loose — minTopScore = actual top-1
  // score (so the eval fails if scoring collapses) and top5Contains requires
  // at least one expected state to appear in the actual top-5. Neither
  // ties us to a brittle exact ordering across data refreshes.
  fixtures.push({
    id: p.id,
    label: p.label,
    weights: p.weights,
    filters: Object.fromEntries(Object.entries(filters).filter(([k]) => k !== 'weights' && k !== 'topK')),
    expectedTop5: top,
    assertions: {
      minTopScore: top[0]?.score ?? 0,
      top5Contains: p.assertStates ?? [],
    },
  });
}

const out = resolve(here, 'fixtures/ranking-cases.json');
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), fixtures }, null, 2));
console.log(`wrote ${fixtures.length} fixtures → ${out}`);