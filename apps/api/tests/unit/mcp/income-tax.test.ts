/**
 * Self-check for the fiscal_health_compare / tax_impact_calculator state-tax
 * regression (BACKLOG #8): the old code applied stateIncomeTaxRate (top
 * marginal) to FULL income, producing ~$4,608 in phantom state tax for a
 * retiree in SC/PA/MS/GA. After the fix, SS-exempt states return $0 state
 * tax and no-income-tax states still return $0.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock locations.loader so the handler resolves our fixture rows regardless
// of the real JSONL on disk.
vi.mock('../../../src/nest/relocation/locations.loader', () => ({
  loadLocations: () => [
    {
      id: 'austin-tx',
      name: 'Austin, TX',
      state: 'TX',
      cost: { costOfLivingIndex: 110, medianHomeValue: 400_000, medianRent: 1500, stateIncomeTaxRate: 0, propertyTaxRate: 0.018 },
    },
    {
      id: 'greenville-sc',
      name: 'Greenville, SC',
      state: 'SC',
      cost: { costOfLivingIndex: 100, medianHomeValue: 280_000, medianRent: 1200, stateIncomeTaxRate: 0.064, propertyTaxRate: 0.006, socialSecurityExempt: true },
    },
    {
      id: 'allentown-pa',
      name: 'Allentown, PA',
      state: 'PA',
      cost: { costOfLivingIndex: 105, medianHomeValue: 250_000, medianRent: 1300, stateIncomeTaxRate: 0.0307, propertyTaxRate: 0.018, socialSecurityExempt: true },
    },
    {
      id: 'los-angeles-ca',
      name: 'Los Angeles, CA',
      state: 'CA',
      cost: { costOfLivingIndex: 165, medianHomeValue: 800_000, medianRent: 2800, stateIncomeTaxRate: 0.133, propertyTaxRate: 0.009 },
    },
  ],
}));

vi.mock('../../../src/db/database', () => ({
  db: {},
  closeDb: () => {},
}));
vi.mock('../../../src/config', () => ({
  JWT_SECRET: 'test',
  updateJwtSecret: () => {},
}));

import { costToolDefs } from '../../../src/mcp/tool-registry';

function callTaxImpact(fromId: string, toId: string, income: number) {
  const tool = costToolDefs().find((t) => t.name === 'tax_impact_calculator')!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tool.handler({} as any, { fromLocationId: fromId, toLocationId: toId, annualIncome: income }, 'user-1') as any;
}

function callCompareCol(locationIds: string[], householdIncome: number) {
  const tool = costToolDefs().find((t) => t.name === 'compare_cost_of_living')!;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tool.handler({} as any, { locationIds, householdIncome }, 'user-1') as any;
}

describe('tax_impact_calculator — SS-exempt fix (BACKLOG #8)', () => {
  it('returns $0 state tax for a no-income-tax state (TX)', () => {
    const r = callTaxImpact('los-angeles-ca', 'austin-tx', 60_000);
    expect(r.incomeTax.to.state).toBe(0);
    // 12% fed flat on full income remains.
    expect(r.incomeTax.to.federal).toBeCloseTo(7_200);
  });

  it('returns $0 state tax for an SS-exempt state (SC) on retiree-scale income', () => {
    const r = callTaxImpact('los-angeles-ca', 'greenville-sc', 38_400);
    expect(r.incomeTax.to.state).toBe(0);
    // Before the fix this was ~$2,458 (38400 * 0.064).
    expect(r.incomeTax.to.total).toBeCloseTo(4_608); // fed flat only
  });

  it('returns $0 state tax for an SS-exempt state (PA)', () => {
    const r = callTaxImpact('austin-tx', 'allentown-pa', 50_000);
    expect(r.incomeTax.to.state).toBe(0);
  });

  it('still returns non-zero state tax for a full-tax state (CA)', () => {
    const r = callTaxImpact('austin-tx', 'los-angeles-ca', 100_000);
    expect(r.incomeTax.to.state).toBeGreaterThan(0);
    expect(r.incomeTax.to.state).toBeCloseTo(13_300); // 100k * 0.133
  });

  it('compare_cost_of_living zero-taxes SC when socialSecurityExempt', () => {
    const r = callCompareCol(['austin-tx', 'greenville-sc'], 38_400);
    const sc = r.locations['greenville-sc'];
    expect(sc.taxes.annualIncomeTaxEstimate).toBeCloseTo(4_608); // fed flat only
    expect(sc.taxes.annualIncomeTaxEstimate).toBeLessThan(7_500); // sanity: below the old buggy value
  });
});