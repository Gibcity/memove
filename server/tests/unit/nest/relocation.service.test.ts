import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RelocationService } from '../../../src/nest/relocation/relocation.service';
import type { DatabaseService } from '../../../src/nest/database/database.service';
import { loadLocations } from '../../../src/nest/relocation/locations.loader';

function makeDb(overrides: Partial<DatabaseService> = {}): DatabaseService {
  return { get: vi.fn(), run: vi.fn(), ...overrides } as unknown as DatabaseService;
}

describe('RelocationService.scoreLocations (F17 — locationId hardFilter exclusion)', () => {
  beforeEach(() => {
    // Reset in-memory user profiles map by re-importing; tests use unique userIds.
  });

  it('excludes a location whose id appears in the user profile hardFilters notIn list', () => {
    const locations = loadLocations();
    expect(locations.length).toBeGreaterThan(1);
    const dismissed = locations[0];
    const kept = locations[1];

    // Profile carries F17's dismiss-then-promote hardFilter.
    const profile = {
      userId: 'u-f17-test',
      statedPriorities: [],
      revealedEmbeddingRef: '',
      hardFilters: [
        {
          field: 'locationId',
          operator: 'notIn' as const,
          value: [dismissed.id],
          source: 'revealed' as const,
          confidence: 1,
          discoveredAt: new Date().toISOString(),
        },
      ],
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
    };

    const db = makeDb({
      // getUserProfile reads the profile JSON row.
      get: vi.fn().mockReturnValue({ profile_data: JSON.stringify(profile) }),
    });
    const svc = new RelocationService(db);

    const out = svc.scoreLocations({}, 'u-f17-test');

    const ids = out.topMatches.map((m) => m.id);
    expect(ids).not.toContain(dismissed.id);
    // Sanity: some other location still appears (we didn't drop everything).
    expect(ids.length).toBeGreaterThan(0);
    // The kept location is allowed (no filter, so its presence is up to score
    // ranking). Don't require it specifically — just check the guard removed
    // the dismissed one and didn't crash on the rest.
    void kept;
  });

  it('leaves results untouched when the user has no locationId hardFilter', () => {
    const locations = loadLocations();
    const allIds = new Set(locations.map((l) => l.id));

    const profile = {
      userId: 'u-nofilter',
      statedPriorities: [],
      revealedEmbeddingRef: '',
      hardFilters: [], // none
      softWeights: {},
      nonNegotiablesDiscovered: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      elicitationRoundsCompleted: 0,
      implicitSignalCount: 0,
    };

    const db = makeDb({
      get: vi.fn().mockReturnValue({ profile_data: JSON.stringify(profile) }),
    });
    const svc = new RelocationService(db);

    const out = svc.scoreLocations({}, 'u-nofilter');
    // Without the filter, topMatches is a (scored) slice of the full corpus —
    // it must NOT be empty.
    expect(out.topMatches.length).toBeGreaterThan(0);
    for (const m of out.topMatches) {
      expect(allIds.has(m.id)).toBe(true);
    }
  });

  it('ignores hardFilters with other field/operator shapes (defensive)', () => {
    // A non-locationId notIn filter (e.g. a metric exclusion) must NOT remove
    // locations — the guard only matches F17's exact shape.
    const locations = loadLocations();
    const dismissed = locations[0];

    const profile = {
      userId: 'u-mismatch',
      statedPriorities: [],
      revealedEmbeddingRef: '',
      hardFilters: [
        {
          field: 'cost.medianHomeValue', // metric, not locationId
          operator: 'notIn' as const,
          value: [dismissed.id],
          source: 'revealed' as const,
          confidence: 1,
          discoveredAt: new Date().toISOString(),
        },
      ],
      softWeights: {},
      nonNegotiablesDiscovered: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      elicitationRoundsCompleted: 0,
      implicitSignalCount: 0,
    };

    const db = makeDb({
      get: vi.fn().mockReturnValue({ profile_data: JSON.stringify(profile) }),
    });
    const svc = new RelocationService(db);

    const out = svc.scoreLocations({}, 'u-mismatch');
    // The location IS still in the scored pool because the guard only matches
    // field === 'locationId'.
    const all = loadLocations();
    void all;
    // We can't assert the dismissed id appears (scoring/ranking decides that),
    // but we can assert the scoring didn't short-circuit to zero results.
    expect(out.totalScored).toBe(loadLocations().length);
  });
});
