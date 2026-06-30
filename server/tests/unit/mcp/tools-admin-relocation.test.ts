/**
 * Smoke tests for relocation_admin MCP tools:
 * dmv_license_guide, voter_registration_guide,
 * insurance_impact_analysis, address_change_checklist.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('../../../src/websocket', () => ({ broadcast: vi.fn() }));

const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return {
    testDb: db,
    dbMock: { db, closeDb: () => {}, reinitialize: () => {}, getPlaceWithTags: () => null, isOwner: () => true, canAccessTrip: () => true },
  };
});

vi.mock('../../../src/db/database', () => dbMock);
vi.mock('../../../src/config', () => ({
  JWT_SECRET: 'test-jwt-secret-for-trek-testing-only',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
}));

import { createTables } from '../../../src/db/schema';
import { createMcpHarness, parseToolResult, type McpHarness } from '../../helpers/mcp-harness';

beforeAll(() => createTables(testDb));
afterAll(() => testDb.close());

async function withHarness(userId: number, fn: (h: McpHarness) => Promise<void>): Promise<void> {
  const h = await createMcpHarness({ userId, withResources: false });
  try { await fn(h); } finally { await h.cleanup(); }
}

describe('relocation_admin tools', () => {
  it('registers dmv_license_guide, voter_registration_guide, insurance_impact_analysis, address_change_checklist', async () => {
    await withHarness(1, async (h) => {
      for (const name of ['dmv_license_guide', 'voter_registration_guide', 'address_change_checklist']) {
        const res = await h.client.callTool({ name, arguments: { toState: 'TX' } });
        expect(res.isError).not.toBe(true);
      }
      const ins = await h.client.callTool({
        name: 'insurance_impact_analysis',
        arguments: { fromLocationId: 'san-francisco-ca', toLocationId: 'austin-tx' },
      });
      expect(ins.isError).not.toBe(true);
    });
  });

  it('dmv_license_guide returns TX deadlines, fees, REAL ID', async () => {
    await withHarness(1, async (h) => {
      const res = await h.client.callTool({ name: 'dmv_license_guide', arguments: { toState: 'TX' } });
      const out = parseToolResult(res) as Record<string, unknown>;
      expect(out.toState).toBe('TX');
      const dl = out.driverLicense as Record<string, unknown> & { deadlineDays: number; feeUSD: number; requiredDocuments: string[]; realId: { available: boolean } };
      expect(dl.deadlineDays).toBe(90);
      expect(dl.feeUSD).toBe(33);
      expect(dl.realId.available).toBe(true);
      expect(Array.isArray(dl.requiredDocuments)).toBe(true);
      const vr = out.vehicleRegistration as { deadlineDays: number; titleTransfer: { required: string[] } };
      expect(vr.deadlineDays).toBe(30);
      expect(vr.titleTransfer.required.length).toBeGreaterThan(0);
    });
  });

  it('dmv_license_guide reports error + available list for unknown state', async () => {
    await withHarness(1, async (h) => {
      const res = await h.client.callTool({ name: 'dmv_license_guide', arguments: { toState: 'ZZ' } });
      const out = parseToolResult(res) as { error: string; availableStates: string[] };
      expect(out.error).toBe('Unknown state code');
      expect(out.availableStates).toContain('TX');
      expect(out.availableStates).toContain('CA');
      expect(out.availableStates).toContain('DC');
    });
  });

  it('voter_registration_guide returns CA online + closed primary + election deadline', async () => {
    await withHarness(1, async (h) => {
      const res = await h.client.callTool({ name: 'voter_registration_guide', arguments: { toState: 'CA' } });
      const out = parseToolResult(res) as {
        toState: string;
        onlineRegistration: { available: boolean };
        deadline: { daysBeforeElection: number };
        partyAffiliation: { primaryIsClosed: boolean };
        registrationMethods: string[];
      };
      expect(out.toState).toBe('CA');
      expect(out.onlineRegistration.available).toBe(true);
      expect(out.deadline.daysBeforeElection).toBe(15);
      expect(out.partyAffiliation.primaryIsClosed).toBe(true);
      expect(out.registrationMethods).toContain('online');
    });
  });

  it('insurance_impact_analysis degrades gracefully when location IDs not found', async () => {
    await withHarness(1, async (h) => {
      const res = await h.client.callTool({
        name: 'insurance_impact_analysis',
        arguments: { fromLocationId: 'nowhere-xx', toLocationId: 'elsewhere-yy' },
      });
      const out = parseToolResult(res) as {
        from: { found: boolean };
        to: { found: boolean };
        autoInsurance: unknown;
        homeOrRentersInsurance: unknown;
        healthInsurance: unknown;
      };
      expect(out.from.found).toBe(false);
      expect(out.to.found).toBe(false);
      expect(out.autoInsurance).toBeDefined();
      expect(out.homeOrRentersInsurance).toBeDefined();
      expect(out.healthInsurance).toBeDefined();
    });
  });

  it('address_change_checklist returns 7 categorized buckets + USPS info', async () => {
    await withHarness(1, async (h) => {
      const res = await h.client.callTool({ name: 'address_change_checklist', arguments: {} });
      const out = parseToolResult(res) as {
        checklist: Array<{ category: string; items: Array<{ entity: string; url?: string }> }>;
        summary: { totalItems: number };
      };
      const cats = out.checklist.map((c) => c.category);
      for (const want of ['Government', 'Financial', 'Insurance', 'Utilities & Services', 'Subscriptions & Memberships', 'Personal & Medical', 'Legal & Miscellaneous']) {
        expect(cats).toContain(want);
      }
      const gov = out.checklist.find((c) => c.category === 'Government')!;
      const usps = gov.items.find((i) => i.entity === 'USPS')!;
      expect(usps.url).toContain('usps');
      expect(out.summary.totalItems).toBe(50);
    });
  });
});
