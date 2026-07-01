// ponytail: single source for the CBSA corpus (939 metros).
// All four former call sites (relocation.service, career.service,
// relocation_cost, relocation_admin) now route through here so we
// parse the JSON once per process and share one cache.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Location } from '@memove/shared';

let cache: Location[] | null = null;

export function loadLocations(): Location[] {
  if (!cache) {
    cache = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../../../../data/processed/relocation/locations.json'),
        'utf8',
      ),
    );
  }
  return cache;
}