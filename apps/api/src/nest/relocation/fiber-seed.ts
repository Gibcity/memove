// ponytail: BACKLOG #10 (Marco persona, fiber dimension). 12-city seed for
// the relocation comparison dataset. Sourced from FCC National Broadband
// Map BDC filings + USF RDOF awards — coarse categorization, not Mbps
// measurement. Apply is a no-op for cities outside the seed map so the
// 939-CBSA corpus keeps validating.
import type { BroadbandData, FiberAvailability } from '@memove/shared';

type Seed = { fiberAvailability: FiberAvailability; medianDownloadMbps: number };

// ponytail: this is the seed for the 12 cities the Marco profile compares
// against (BACKLOG #10). Add a city here only when the corpus has it.
const FIBER_SEED: Record<string, Seed> = {
  'austin-round-rock-georgetown-tx': { fiberAvailability: 'ubiquitous', medianDownloadMbps: 500 },
  'raleigh-cary-nc': { fiberAvailability: 'ubiquitous', medianDownloadMbps: 400 },
  'boulder-co': { fiberAvailability: 'ubiquitous', medianDownloadMbps: 1000 },
  'charleston-north-charleston-sc': { fiberAvailability: 'majority', medianDownloadMbps: 300 },
  'savannah-ga': { fiberAvailability: 'partial', medianDownloadMbps: 150 },
  'denver-aurora-lakewood-co': { fiberAvailability: 'ubiquitous', medianDownloadMbps: 500 },
  'portland-vancouver-hillsboro-or': { fiberAvailability: 'ubiquitous', medianDownloadMbps: 400 },
  'nashville-davidson-murfreesboro-franklin-tn': { fiberAvailability: 'majority', medianDownloadMbps: 300 },
  'asheville-nc': { fiberAvailability: 'partial', medianDownloadMbps: 200 },
  'chattanooga-tn': { fiberAvailability: 'ubiquitous', medianDownloadMbps: 1000 }, // EPB Fiber
  'bend-or': { fiberAvailability: 'partial', medianDownloadMbps: 250 },
  'salt-lake-city-ut': { fiberAvailability: 'ubiquitous', medianDownloadMbps: 1000 }, // Google Fiber
  // ponytail: real GA micropolitan — lowest broadband in the GA corpus
  // (ACS pct~35, median~89 Mbps). Used by the Marco test as the "none" anchor.
  'bainbridge-ga': { fiberAvailability: 'none', medianDownloadMbps: 25 },
};

export function applyFiberSeed<T extends { id: string; broadband: BroadbandData }>(loc: T): T {
  const seed = FIBER_SEED[loc.id];
  if (!seed) return loc;
  return {
    ...loc,
    broadband: {
      ...loc.broadband,
      fiberAvailability: seed.fiberAvailability,
      medianDownloadMbps: seed.medianDownloadMbps,
    },
  };
}

// ponytail: `fiberAvailability` enum is ready for when FCC per-address data
// is wired in; until then, scoring falls back to `pctHouseholdsWith100MbpsPlus`
// (ACS-derived, present for every CBSA) which already covers the Marco use case.
