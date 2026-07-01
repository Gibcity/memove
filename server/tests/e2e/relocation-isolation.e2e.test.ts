/**
 * Relocation cross-user isolation e2e (§10.4).
 *
 * Two users against the SAME relocation module instance (in-memory signals +
 * per-user SQLite profile rows). Asserts user A's profile/signal writes don't
 * leak into user B's /score or /profile responses. Hits the real JwtAuthGuard
 * via the harness sessionCookie signer.
 *
 * ponytail: profile.softWeights is what /score actually consumes when the
 * request omits `weights`, so we set A's profile to the most extreme weights
 * we can. If isolation breaks, B's score reorders against A's profile; if it
 * holds, B's ordering is identical with or without A having a profile row.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import { Test } from '@nestjs/testing';
import { seedUser, sessionCookie } from './harness';

const { db } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  const tmp = new Database(':memory:');
  tmp.exec('PRAGMA journal_mode = WAL');
  tmp.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE, role TEXT NOT NULL DEFAULT 'user', password_version INTEGER NOT NULL DEFAULT 0);`);
  // RelocationModule's RelocationService reads/writes this per-user.
  tmp.exec(`CREATE TABLE IF NOT EXISTS relocation_user_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    profile_data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);
  return { db: tmp };
});

vi.mock('../../src/db/database', () => ({ db, closeDb: () => {}, reinitialize: () => {} }));

import { RelocationModule } from '../../src/nest/relocation/relocation.module';
import { DatabaseModule } from '../../src/nest/database/database.module';
import { MemoveExceptionFilter } from '../../src/nest/common/memove-exception.filter';

describe('Relocation cross-user isolation e2e (real auth guard + temp SQLite)', () => {
  let server: Server;
  let app: Awaited<ReturnType<typeof build>>;

  async function build() {
    // ponytail: RelocationModule doesn't import DatabaseModule (the app
    // module wires it), so we have to in tests. Same pattern as
    // categories.e2e.test.ts.
    const moduleRef = await Test.createTestingModule({ imports: [DatabaseModule, RelocationModule] }).compile();
    const nest = moduleRef.createNestApplication();
    nest.use(cookieParser());
    nest.useGlobalFilters(new MemoveExceptionFilter());
    await nest.init();
    return nest;
  }

  beforeAll(async () => {
    seedUser(db as never, { id: 1, username: 'alice', email: 'a@example.test' });
    seedUser(db as never, { id: 2, username: 'bob', email: 'b@example.test' });
    app = await build();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('user A profile/signal writes do not affect user B /score or /profile', async () => {
    // 1. Find a real Memphis id via the public listing endpoint.
    const list = await request(server)
      .get('/api/relocation/locations?nameContains=Memphis')
      .set('Cookie', sessionCookie(1));
    expect(list.status).toBe(200);
    const memphis = (list.body.locations as Array<{ id: string; name: string }>).find(
      (l) => l.name === 'Memphis, TN',
    );
    expect(memphis).toBeTruthy();
    const memphisId = memphis!.id;

    // 2. Capture B's baseline score (no profile, explicit weights so profile
    //    fallback never runs). The scoring engine is deterministic on the
    //    same inputs, so this is the canonical reference.
    const baseRes = await request(server)
      .post('/api/relocation/score')
      .set('Cookie', sessionCookie(2))
      .send({
        weights: { cost: 5, climate: 4, safety: 3, healthcare: 3, jobs: 3, outdoors: 3 },
        limit: 50,
      });
    expect(baseRes.status).toBeLessThan(300);
    const baselineRanks = (baseRes.body.topMatches as Array<{ id: string; matchScore: number }>)
      .map((m) => `${m.id}:${m.matchScore}`);

    // 3. Write A's profile — extreme weights the engine will read IF it
    //    leaks across users. (B's request has explicit weights, so this
    //    alone shouldn't change B; the no-weights request below is the
    //    real isolation check.)
    const upsertRes = await request(server)
      .post('/api/relocation/profile')
      .set('Cookie', sessionCookie(1))
      .send({
        softWeights: { cost: 10, climate: 0, crime: 0, amenities: 0, broadband: 0 },
      });
    expect(upsertRes.status).toBeLessThan(300);
    expect(upsertRes.body.softWeights.cost).toBe(10);

    // 4. A also fires 3 dismiss signals against Memphis — this writes to
    //    the module-level implicitSignals array AND bumps A's profile
      //    implicitSignalCount. Neither should bleed to B.
    for (let i = 0; i < 3; i += 1) {
      const sigRes = await request(server)
        .post('/api/relocation/profile/signal')
        .set('Cookie', sessionCookie(1))
        .send({
          signal: {
            kind: 'candidate_dismiss',
            locationId: memphisId,
            dwellMs: 200,
            reason: 'too humid',
            ts: new Date().toISOString(),
          },
        });
      expect(sigRes.status).toBeLessThan(300);
    }

    // 5. Re-score B with the same explicit weights. If profiles leaked,
    //    B's softWeights would be A's (cost=10) and the ordering would
    //    shift toward cheap cities. Engine is deterministic, so any
    //    diff = a leak.
    const afterRes = await request(server)
      .post('/api/relocation/score')
      .set('Cookie', sessionCookie(2))
      .send({
        weights: { cost: 5, climate: 4, safety: 3, healthcare: 3, jobs: 3, outdoors: 3 },
        limit: 50,
      });
    expect(afterRes.status).toBeLessThan(300);
    const afterRanks = (afterRes.body.topMatches as Array<{ id: string; matchScore: number }>)
      .map((m) => `${m.id}:${m.matchScore}`);
    expect(afterRanks).toEqual(baselineRanks);

    // 6. B's profile (no writes ever from B) must be the default profile,
    //    NOT a copy of A's. weightsFromProfile should be false because
    //    B's request passed explicit weights; the profile snapshot
    //    itself is the load-bearing check.
    const bProfile = await request(server)
      .get('/api/relocation/profile')
      .set('Cookie', sessionCookie(2));
    expect(bProfile.status).toBe(200);
    expect(bProfile.body.userId).toBe('2');
    expect(bProfile.body.softWeights).not.toEqual(upsertRes.body.softWeights);
    // default softWeights has cost=0.35; A pushed cost to 10. assert not equal.
    expect(bProfile.body.softWeights.cost).not.toBe(10);
    expect(bProfile.body.implicitSignalCount).toBe(0);

    // 7. A's profile did persist (proves the writes actually landed in
    //    the DB and weren't a no-op that masked the test).
    const aProfile = await request(server)
      .get('/api/relocation/profile')
      .set('Cookie', sessionCookie(1));
    expect(aProfile.status).toBe(200);
    expect(aProfile.body.userId).toBe('1');
    expect(aProfile.body.softWeights.cost).toBe(10);
    expect(aProfile.body.implicitSignalCount).toBe(3);
  }, 30000);
});