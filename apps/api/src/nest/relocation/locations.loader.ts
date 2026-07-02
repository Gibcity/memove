// ponytail: single source for the CBSA corpus (939 metros).
// All four former call sites (relocation.service, career.service,
// relocation_cost, relocation_admin) now route through here so we
// parse the JSON once per process and share one cache.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Location } from '@memove/shared';
import { applyFiberSeed } from './fiber-seed';

let cache: Location[] | null = null;

export function loadLocations(): Location[] {
  if (!cache) {
    const raw = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../../../data/processed/relocation/locations.json'),
        'utf8',
      ),
    ) as Location[];
    // ponytail: BACKLOG #10 — seed fiber enum + Mbps for the 12-city comparison
    // dataset. Apply here so the scoring engine and `getLocationById` see the
    // same data without each call site having to remember.
    cache = raw.map(applyFiberSeed);
  }
  return cache ?? [];
}