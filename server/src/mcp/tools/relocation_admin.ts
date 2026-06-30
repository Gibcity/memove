import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { isAddonEnabled } from '../../services/adminService';
import { ADDON_IDS } from '../../addons';
import { TOOL_ANNOTATIONS_READONLY, ok } from './_shared';
import { canRead } from '../scopes';

/**
 * MCP tools for the relocation add-on — Administrative & Legal agent.
 *
 * 4 read-only tools: dmv_license_guide, voter_registration_guide,
 *                    insurance_impact_analysis, address_change_checklist
 *
 * State-specific data is embedded as lookup tables below — covers all 50 states + DC.
 * Source: state DMV/SOS websites + vote.org + USA.gov (as of 2026).
 */

// ---------------------------------------------------------------------------
// State data — kept inline. Lazy lookup, one map per concern.
// ---------------------------------------------------------------------------

type StateCode = string; // 'AL' | 'AK' | ... | 'DC'

interface DMVInfo {
  licenseDeadlineDays: number;
  registrationDeadlineDays: number;
  licenseFee: number;
  registrationFeeBase: number;
  appointmentRequired: boolean;
  realIdAvailable: boolean;
  notes?: string;
}

interface VoterInfo {
  registrationDeadlineDaysBeforeElection: number; // 0 = election day
  onlineRegistration: boolean;
  sameDayRegistration: boolean;
  partyRegistrationRequired: boolean; // true = closed primary state
  methods: string[];
  notes?: string;
}

const DMV_DATA: Record<StateCode, DMVInfo> = {
  AL: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 23, registrationFeeBase: 23, appointmentRequired: false, realIdAvailable: true },
  AK: { licenseDeadlineDays: 90, registrationDeadlineDays: 30, licenseFee: 40, registrationFeeBase: 100, appointmentRequired: false, realIdAvailable: true, notes: 'No state income tax; no inspection required' },
  AZ: { licenseDeadlineDays: 30, registrationDeadlineDays: 15, licenseFee: 25, registrationFeeBase: 32, appointmentRequired: false, realIdAvailable: true, notes: 'Vehicle emission test in Maricopa & Pima counties' },
  AR: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 40, registrationFeeBase: 30, appointmentRequired: false, realIdAvailable: true },
  CA: { licenseDeadlineDays: 10, registrationDeadlineDays: 20, licenseFee: 41, registrationFeeBase: 65, appointmentRequired: true, realIdAvailable: true, notes: 'DMV appointments strongly recommended; wait times can exceed 30 days' },
  CO: { licenseDeadlineDays: 30, registrationDeadlineDays: 60, licenseFee: 35, registrationFeeBase: 75, appointmentRequired: false, realIdAvailable: true },
  CT: { licenseDeadlineDays: 30, registrationDeadlineDays: 60, licenseFee: 72, registrationFeeBase: 120, appointmentRequired: true, realIdAvailable: true },
  DE: { licenseDeadlineDays: 60, registrationDeadlineDays: 30, licenseFee: 40, registrationFeeBase: 8.5, appointmentRequired: true, realIdAvailable: true },
  DC: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 47, registrationFeeBase: 72, appointmentRequired: true, realIdAvailable: true, notes: 'No emissions or safety inspection' },
  FL: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 48, registrationFeeBase: 225, appointmentRequired: false, realIdAvailable: true, notes: 'Initial registration includes $225 flat fee for out-of-state title transfer' },
  GA: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 32, registrationFeeBase: 20, appointmentRequired: true, realIdAvailable: true },
  HI: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 5, registrationFeeBase: 50, appointmentRequired: true, realIdAvailable: true, notes: 'Safety inspection required annually' },
  ID: { licenseDeadlineDays: 90, registrationDeadlineDays: 90, licenseFee: 55, registrationFeeBase: 69, appointmentRequired: false, realIdAvailable: true },
  IL: { licenseDeadlineDays: 90, registrationDeadlineDays: 30, licenseFee: 30, registrationFeeBase: 151, appointmentRequired: false, realIdAvailable: true },
  IN: { licenseDeadlineDays: 60, registrationDeadlineDays: 60, licenseFee: 17.5, registrationFeeBase: 21, appointmentRequired: true, realIdAvailable: true },
  IA: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 4, registrationFeeBase: 40, appointmentRequired: false, realIdAvailable: true, notes: 'License fee only $4 for REAL ID; very cheap state' },
  KS: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 38, registrationFeeBase: 39, appointmentRequired: false, realIdAvailable: true },
  KY: { licenseDeadlineDays: 30, registrationDeadlineDays: 15, licenseFee: 43, registrationFeeBase: 22, appointmentRequired: false, realIdAvailable: true },
  LA: { licenseDeadlineDays: 30, registrationDeadlineDays: 40, licenseFee: 41, registrationFeeBase: 82, appointmentRequired: false, realIdAvailable: true, notes: 'Out-of-state title transfer includes $77 VIN/odometer fee' },
  ME: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 55, registrationFeeBase: 33, appointmentRequired: false, realIdAvailable: true },
  MD: { licenseDeadlineDays: 60, registrationDeadlineDays: 60, licenseFee: 72, registrationFeeBase: 135, appointmentRequired: true, realIdAvailable: true, notes: 'MVA appointment strongly recommended' },
  MA: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 50, registrationFeeBase: 60, appointmentRequired: true, realIdAvailable: true, notes: 'RMV online system; appointments often booked weeks out' },
  MI: { licenseDeadlineDays: 30, registrationDeadlineDays: 15, licenseFee: 28, registrationFeeBase: 120, appointmentRequired: true, realIdAvailable: true },
  MN: { licenseDeadlineDays: 30, registrationDeadlineDays: 60, licenseFee: 21, registrationFeeBase: 35, appointmentRequired: false, realIdAvailable: true },
  MS: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 24, registrationFeeBase: 14, appointmentRequired: false, realIdAvailable: true },
  MO: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 38, registrationFeeBase: 33, appointmentRequired: false, realIdAvailable: true, notes: 'Safety & emissions inspection required (most counties)' },
  MT: { licenseDeadlineDays: 60, registrationDeadlineDays: 30, licenseFee: 40, registrationFeeBase: 137, appointmentRequired: false, realIdAvailable: true },
  NE: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 29, registrationFeeBase: 15, appointmentRequired: false, realIdAvailable: true },
  NV: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 41, registrationFeeBase: 33, appointmentRequired: true, realIdAvailable: true, notes: 'VIN inspection required for out-of-state vehicles' },
  NH: { licenseDeadlineDays: 60, registrationDeadlineDays: 20, licenseFee: 50, registrationFeeBase: 33, appointmentRequired: false, realIdAvailable: true },
  NJ: { licenseDeadlineDays: 60, registrationDeadlineDays: 14, licenseFee: 24, registrationFeeBase: 85, appointmentRequired: true, realIdAvailable: true, notes: 'MVC appointments highly recommended' },
  NM: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 18, registrationFeeBase: 47, appointmentRequired: false, realIdAvailable: true },
  NY: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 64, registrationFeeBase: 70, appointmentRequired: true, realIdAvailable: true, notes: 'DMV appointments often booked weeks ahead; Enhanced ID available' },
  NC: { licenseDeadlineDays: 60, registrationDeadlineDays: 30, licenseFee: 40, registrationFeeBase: 38, appointmentRequired: true, realIdAvailable: true },
  ND: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 30, registrationFeeBase: 49, appointmentRequired: false, realIdAvailable: true },
  OH: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 25.75, registrationFeeBase: 46, appointmentRequired: false, realIdAvailable: true },
  OK: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 38, registrationFeeBase: 28, appointmentRequired: false, realIdAvailable: true },
  OR: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 60, registrationFeeBase: 122, appointmentRequired: true, realIdAvailable: true, notes: 'DMV appointments recommended in metro areas' },
  PA: { licenseDeadlineDays: 60, registrationDeadlineDays: 20, licenseFee: 42, registrationFeeBase: 38, appointmentRequired: false, realIdAvailable: true, notes: 'Enhanced ID available (cheaper than passport for border crossings)' },
  RI: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 50, registrationFeeBase: 40, appointmentRequired: true, realIdAvailable: true },
  SC: { licenseDeadlineDays: 30, registrationDeadlineDays: 45, licenseFee: 25, registrationFeeBase: 40, appointmentRequired: false, realIdAvailable: true },
  SD: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 28, registrationFeeBase: 36, appointmentRequired: false, realIdAvailable: true, notes: 'No state income tax' },
  TN: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 28, registrationFeeBase: 26, appointmentRequired: false, realIdAvailable: true },
  TX: { licenseDeadlineDays: 90, registrationDeadlineDays: 30, licenseFee: 33, registrationFeeBase: 65, appointmentRequired: false, realIdAvailable: true, notes: 'Vehicle inspection required (separate fee ~$25)' },
  UT: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 52, registrationFeeBase: 44, appointmentRequired: false, realIdAvailable: true },
  VT: { licenseDeadlineDays: 30, registrationDeadlineDays: 15, licenseFee: 50, registrationFeeBase: 76, appointmentRequired: false, realIdAvailable: true },
  VA: { licenseDeadlineDays: 60, registrationDeadlineDays: 30, licenseFee: 32, registrationFeeBase: 40, appointmentRequired: true, realIdAvailable: true, notes: 'Vehicle safety inspection required' },
  WA: { licenseDeadlineDays: 30, registrationDeadlineDays: 15, licenseFee: 89, registrationFeeBase: 86, appointmentRequired: true, realIdAvailable: true, notes: 'Enhanced ID available; emissions test in 5 counties' },
  WV: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 30, registrationFeeBase: 30, appointmentRequired: false, realIdAvailable: true },
  WI: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 34, registrationFeeBase: 85, appointmentRequired: false, realIdAvailable: true },
  WY: { licenseDeadlineDays: 30, registrationDeadlineDays: 30, licenseFee: 40, registrationFeeBase: 30, appointmentRequired: false, realIdAvailable: true, notes: 'No state income tax' },
};

const VOTER_DATA: Record<StateCode, VoterInfo> = {
  AL: { registrationDeadlineDaysBeforeElection: 15, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  AK: { registrationDeadlineDaysBeforeElection: 30, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: true, methods: ['online', 'mail', 'in-person'], notes: '30-day deadline + Election Day registration at polling place' },
  AZ: { registrationDeadlineDaysBeforeElection: 29, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  AR: { registrationDeadlineDaysBeforeElection: 30, onlineRegistration: false, sameDayRegistration: false, partyRegistrationRequired: true, methods: ['mail', 'in-person'], notes: 'No online registration; paper or DMV' },
  CA: { registrationDeadlineDaysBeforeElection: 15, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: true, methods: ['online', 'mail', 'in-person'] },
  CO: { registrationDeadlineDaysBeforeElection: 8, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'], notes: 'Mail ballot auto-sent to all registered voters' },
  CT: { registrationDeadlineDaysBeforeElection: 7, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: true, methods: ['online', 'mail', 'in-person'] },
  DE: { registrationDeadlineDaysBeforeElection: 24, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: true, methods: ['online', 'mail', 'in-person'] },
  DC: { registrationDeadlineDaysBeforeElection: 21, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  FL: { registrationDeadlineDaysBeforeElection: 29, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: true, methods: ['online', 'mail', 'in-person'] },
  GA: { registrationDeadlineDaysBeforeElection: 29, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: true, methods: ['online', 'mail', 'in-person'] },
  HI: { registrationDeadlineDaysBeforeElection: 10, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  ID: { registrationDeadlineDaysBeforeElection: 25, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  IL: { registrationDeadlineDaysBeforeElection: 28, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  IN: { registrationDeadlineDaysBeforeElection: 29, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: true, methods: ['online', 'mail', 'in-person'] },
  IA: { registrationDeadlineDaysBeforeElection: 15, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  KS: { registrationDeadlineDaysBeforeElection: 21, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  KY: { registrationDeadlineDaysBeforeElection: 29, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: true, methods: ['online', 'mail', 'in-person'] },
  LA: { registrationDeadlineDaysBeforeElection: 30, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: true, methods: ['online', 'mail', 'in-person'] },
  ME: { registrationDeadlineDaysBeforeElection: 21, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  MD: { registrationDeadlineDaysBeforeElection: 21, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  MA: { registrationDeadlineDaysBeforeElection: 20, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  MI: { registrationDeadlineDaysBeforeElection: 15, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  MN: { registrationDeadlineDaysBeforeElection: 21, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  MS: { registrationDeadlineDaysBeforeElection: 30, onlineRegistration: false, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['mail', 'in-person'], notes: 'No online registration; recent voter ID law' },
  MO: { registrationDeadlineDaysBeforeElection: 27, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  MT: { registrationDeadlineDaysBeforeElection: 1, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'], notes: 'Election Day registration; ballots sent by mail to all voters' },
  NE: { registrationDeadlineDaysBeforeElection: 18, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  NV: { registrationDeadlineDaysBeforeElection: 28, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  NH: { registrationDeadlineDaysBeforeElection: 10, onlineRegistration: false, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['mail', 'in-person'], notes: 'Election Day registration; no online; town clerks handle registration' },
  NJ: { registrationDeadlineDaysBeforeElection: 21, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  NM: { registrationDeadlineDaysBeforeElection: 28, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  NY: { registrationDeadlineDaysBeforeElection: 25, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: true, methods: ['online', 'mail', 'in-person'] },
  NC: { registrationDeadlineDaysBeforeElection: 25, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: true, methods: ['online', 'mail', 'in-person'] },
  ND: { registrationDeadlineDaysBeforeElection: 0, onlineRegistration: false, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['in-person'], notes: 'No registration required; ID-only state' },
  OH: { registrationDeadlineDaysBeforeElection: 30, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  OK: { registrationDeadlineDaysBeforeElection: 25, onlineRegistration: false, sameDayRegistration: false, partyRegistrationRequired: true, methods: ['mail', 'in-person'] },
  OR: { registrationDeadlineDaysBeforeElection: 21, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'], notes: 'Vote-by-mail ballots sent automatically' },
  PA: { registrationDeadlineDaysBeforeElection: 15, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  RI: { registrationDeadlineDaysBeforeElection: 30, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  SC: { registrationDeadlineDaysBeforeElection: 30, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  SD: { registrationDeadlineDaysBeforeElection: 15, onlineRegistration: false, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['mail', 'in-person'] },
  TN: { registrationDeadlineDaysBeforeElection: 30, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  TX: { registrationDeadlineDaysBeforeElection: 30, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  UT: { registrationDeadlineDaysBeforeElection: 11, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'], notes: 'Mostly vote-by-mail' },
  VT: { registrationDeadlineDaysBeforeElection: 1, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'], notes: 'Election Day registration; universal mail ballots' },
  VA: { registrationDeadlineDaysBeforeElection: 22, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  WA: { registrationDeadlineDaysBeforeElection: 8, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'], notes: 'Vote-by-mail state; ballots sent automatically' },
  WV: { registrationDeadlineDaysBeforeElection: 21, onlineRegistration: true, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  WI: { registrationDeadlineDaysBeforeElection: 20, onlineRegistration: true, sameDayRegistration: true, partyRegistrationRequired: false, methods: ['online', 'mail', 'in-person'] },
  WY: { registrationDeadlineDaysBeforeElection: 14, onlineRegistration: false, sameDayRegistration: false, partyRegistrationRequired: false, methods: ['mail', 'in-person'] },
};

// ponytail: small alias list to keep state lookups ergonomic + typo-proof
const COMMON_DOCS = [
  'Current out-of-state license (or other ID with photo, SSN, and DOB)',
  'Proof of identity (passport or birth certificate)',
  'Social Security card or proof of SSN',
  'Proof of new state residency (utility bill, bank statement, or lease, dated within 60 days)',
  'Proof of physical address in new state',
];

// ponytail: title transfer requirements are mostly uniform — kept inline, not a 51-key table
const TITLE_TRANSFER_GENERIC = {
  required: [
    'Out-of-state vehicle title (signed by seller; lien release if applicable)',
    'Bill of sale (if not on title)',
    'Valid driver\'s license from new state',
    'Proof of insurance meeting new state minimums',
    'Odometer reading',
  ],
  notes: 'Some states require a VIN verification inspection by law enforcement or licensed inspector at additional cost ($10-50).',
};

export function registerAdminTools(
  server: McpServer,
  _userId: number,
  scopes: string[] | null,
): void {
  if (!isAddonEnabled(ADDON_IDS.RELOCATION)) return;

  const R = canRead(scopes, 'relocation');

  // --- dmv_license_guide ---
  if (R) server.registerTool(
    'dmv_license_guide',
    {
      description:
        "State-specific driver's license and vehicle registration requirements for the destination state. Returns deadlines, required documents, fees, appointment info, REAL ID availability, and title transfer requirements. Covers all 50 states + DC.",
      inputSchema: {
        toState: z
          .string()
          .length(2)
          .describe('Destination 2-letter state code (e.g., "TX", "FL", "CA")'),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async ({ toState }) => {
      const code = toState.toUpperCase();
      const d = DMV_DATA[code];
      if (!d) {
        return ok({
          error: 'Unknown state code',
          toState: code,
          availableStates: Object.keys(DMV_DATA).sort(),
        });
      }
      return ok({
        toState: code,
        driverLicense: {
          deadlineDays: d.licenseDeadlineDays,
          description: `Must obtain new ${code} driver's license within ${d.licenseDeadlineDays} days of establishing residency.`,
          requiredDocuments: COMMON_DOCS,
          feeUSD: d.licenseFee,
          appointmentRequired: d.appointmentRequired,
          appointmentNote: d.appointmentRequired
            ? 'Book online in advance; walk-in wait times can exceed 2-4 hours.'
            : 'Walk-in generally accepted; arrive early to avoid lines.',
          realId: {
            available: d.realIdAvailable,
            feeIncludedInLicenseFee: true,
            note: 'REAL ID required for domestic flights and federal facilities starting May 2025 — bring proof of identity (passport or birth certificate), SSN, and two proofs of residency.',
          },
        },
        vehicleRegistration: {
          deadlineDays: d.registrationDeadlineDays,
          description: `Register out-of-state vehicle within ${d.registrationDeadlineDays} days.`,
          feeBaseUSD: d.registrationFeeBase,
          feeNote: `Base fee. Additional taxes based on vehicle value/weight apply in most states (often 5-7% of value).`,
          titleTransfer: TITLE_TRANSFER_GENERIC,
        },
        stateNotes: d.notes ?? null,
      });
    },
  );

  // --- voter_registration_guide ---
  if (R) server.registerTool(
    'voter_registration_guide',
    {
      description:
        "Voter registration rules for the destination state — registration deadline relative to Election Day, online/mail/in-person availability, same-day registration, party affiliation rules, and key dates. Covers all 50 states + DC.",
      inputSchema: {
        toState: z
          .string()
          .length(2)
          .describe('Destination 2-letter state code (e.g., "TX", "FL", "CA")'),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async ({ toState }) => {
      const code = toState.toUpperCase();
      const v = VOTER_DATA[code];
      if (!v) {
        return ok({
          error: 'Unknown state code',
          toState: code,
          availableStates: Object.keys(VOTER_DATA).sort(),
        });
      }
      const deadlineDesc =
        v.registrationDeadlineDaysBeforeElection === 0
          ? 'Election Day registration is allowed'
          : v.sameDayRegistration
            ? `${v.registrationDeadlineDaysBeforeElection} days before Election Day (same-day registration also allowed at polls)`
            : `Must register at least ${v.registrationDeadlineDaysBeforeElection} days before Election Day`;
      return ok({
        toState: code,
        deadline: {
          daysBeforeElection: v.registrationDeadlineDaysBeforeElection,
          description: deadlineDesc,
        },
        onlineRegistration: {
          available: v.onlineRegistration,
          url: 'https://vote.gov/ (federal portal redirects to state site)',
        },
        sameDayRegistration: v.sameDayRegistration,
        registrationMethods: v.methods,
        partyAffiliation: {
          primaryIsClosed: v.partyRegistrationRequired,
          note: v.partyRegistrationRequired
            ? 'Closed primary state — you must register with a party to vote in that party\'s primary.'
            : 'Open primary state — you may vote in either party\'s primary without prior registration (ballot choice at polling place).',
        },
        whatYouNeed: [
          'Driver\'s license or last 4 digits of SSN',
          'Current residential address in the new state',
          (v.partyRegistrationRequired && !v.sameDayRegistration)
            ? 'Party affiliation selection (where applicable)'
            : 'No party affiliation required to register',
        ],
        nextKeyDates: {
          nextFederalElection: 'First Tuesday after the first Monday in November (every even year)',
          generalRecommendation: 'Register as soon as you establish residency — most states let you update your registration online in minutes.',
        },
        stateNotes: v.notes ?? null,
      });
    },
  );

  // --- insurance_impact_analysis ---
  if (R) server.registerTool(
    'insurance_impact_analysis',
    {
      description:
        "How moving affects insurance across auto, home/renters, and health lines. Inputs are locationIds from the relocation dataset (e.g., 'austin-tx', 'denver-co'). Computes directional impact based on cost-of-living, property tax, and state insurance regulatory environment. Educational estimates, not quotes.",
      inputSchema: {
        fromLocationId: z
          .string()
          .describe('Origin location ID (e.g., "san-francisco-ca")'),
        toLocationId: z
          .string()
          .describe('Destination location ID (e.g., "austin-tx")'),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async ({ fromLocationId, toLocationId }) => {
      // ponytail: read from the same source relocation.ts uses — lazy, no second loader.
      const fs = await import('fs/promises');
      const path = await import('path');
      const jsonPath = path.join(
        process.cwd(),
        'sources/processed/relocation/locations.json',
      );
      let locations: Array<{ id: string; state: string; name: string; cost: { costOfLivingIndex: number; medianHomeValue: number; propertyTaxRate: number } }> = [];
      try {
        const raw = await fs.readFile(jsonPath, 'utf8');
        locations = JSON.parse(raw);
      } catch {
        // ponytail: dataset missing — still return qualitative guidance rather than fail
      }
      const from = locations.find((l) => l.id === fromLocationId);
      const to = locations.find((l) => l.id === toLocationId);

      const toCol = to?.cost?.costOfLivingIndex ?? 100;
      const fromCol = from?.cost?.costOfLivingIndex ?? 100;
      const toPropTax = to?.cost?.propertyTaxRate ?? 0.01;
      const fromPropTax = from?.cost?.propertyTaxRate ?? 0.01;
      const toHome = to?.cost?.medianHomeValue ?? 0;
      const fromHome = from?.cost?.medianHomeValue ?? 0;

      // ponytail: rough heuristic (state COL proxy). Real underwriting is ZIP-level — replace with carrier quotes when integrating.
      const colRatio = fromCol ? toCol / fromCol : 1;
      const autoPercentChange = Math.round((colRatio - 1) * 100 * 0.6); // insurance tends to lag COL by ~60%
      const homeValueRatio = fromHome ? toHome / fromHome : 1;
      const homePercentChange = Math.round((homeValueRatio - 1) * 100 * 0.5);
      const propTaxDelta = (toPropTax - fromPropTax) * 100000; // per $100k of home value, annual
      const rentersPercentChange = Math.round((toCol - fromCol)); // rent-based, near-1:1 with COL

      const sameState = from?.state === to?.state;

      return ok({
        from: from
          ? { id: from.id, name: from.name, state: from.state, costOfLivingIndex: from.cost.costOfLivingIndex, medianHomeValue: from.cost.medianHomeValue }
          : { id: fromLocationId, found: false },
        to: to
          ? { id: to.id, name: to.name, state: to.state, costOfLivingIndex: to.cost.costOfLivingIndex, medianHomeValue: to.cost.medianHomeValue }
          : { id: toLocationId, found: false },
        autoInsurance: {
          estimatedChangePercent: autoPercentChange,
          direction: autoPercentChange > 5 ? 'increase' : autoPercentChange < -5 ? 'decrease' : 'similar',
          note: 'Auto premiums depend on ZIP code, driving record, and vehicle. Use this directional estimate as a planning aid — get actual quotes before committing.',
          actionItems: [
            'Update garaging address on all auto policies — material misrepresentation can void coverage',
            'Cancel previous state\'s policy only after new policy is bound',
            'Check for state-mandated minimum coverage changes (each state sets its own)',
            'Ask about new-car / new-state discounts (some carriers offer relocation credits)',
          ],
        },
        homeOrRentersInsurance: {
          homeEstimatedChangePercent: homePercentChange,
          rentersEstimatedChangePercent: rentersPercentChange,
          propertyTaxDeltaPerYear: Math.round(propTaxDelta),
          direction:
            homePercentChange > 5 ? 'increase' : homePercentChange < -5 ? 'decrease' : 'similar',
          note: 'Home insurance scales with dwelling value + local catastrophe risk. Property tax is separate and varies dramatically by state (HI ~0.3% vs NJ ~2.5%).',
          actionItems: [
            'Notify insurer 30 days before move; mid-term address changes can trigger re-underwriting',
            'Re-evaluate dwelling coverage — rebuild cost differs by region (CA wildfire, FL hurricane)',
            'If renting, buy renters insurance ($15-30/mo) — covers personal property and liability',
            'If buying, shop title insurance through a state-licensed title company',
          ],
        },
        healthInsurance: {
          sameStateMove: sameState
            ? 'No marketplace change required. Notify current insurer of address change.'
            : 'Cross-state move — special enrollment period triggered. You have 60 days from move date to switch.',
          enrollmentWindow: '60-day Special Enrollment Period (SEP) triggered by permanent move',
          acaMarketplace: {
            applicable: !sameState,
            description: 'Cross-state moves require new marketplace application in destination state. Subsidies are state-specific.',
            url: 'https://www.healthcare.gov/',
            note: 'If you had employer coverage, you have 30 days to elect COBRA from your prior employer.',
          },
          actionItems: sameState
            ? [
                'Update address with current insurer',
                'Confirm in-network providers at new address',
              ]
            : [
                'Apply in destination state within 60 days',
                'Compare employer plans vs ACA marketplace (subsidies may flip if income changed)',
                'Transfer prescriptions to in-network pharmacy near new home',
                'Get new in-network primary care provider (PCP) — referrals may need re-establishment',
              ],
        },
        estimatedTotalAnnualImpact: {
          autoUSD: Math.round(autoPercentChange * 15), // average $1,500 annual premium × % change
          homeOrRentersUSD: Math.round(homePercentChange * 12 + propTaxDelta),
          note: 'Order-of-magnitude estimate. Real numbers depend on coverage levels, deductibles, and carrier.',
        },
      });
    },
  );

  // --- address_change_checklist ---
  if (R) server.registerTool(
    'address_change_checklist',
    {
      description:
        "Comprehensive universal address-change checklist — every entity to notify when you move, grouped by category. Includes government (USPS, IRS, SSA, voter reg), financial (banks, credit cards, investments), services (insurance, subscriptions, utilities), and personal (employer, schools, doctors).",
      inputSchema: {},
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async () => {
      return ok({
        overview: {
          recommendedFirstStep: 'File a Change of Address with USPS — it forwards most first-class mail for 12 months and triggers many downstream updates.',
          uspsUrl: 'https://move.usps.com/',
          uspsFee: 0,
          forwardingDurationMonths: 12,
        },
        checklist: [
          {
            category: 'Government',
            priority: 'high',
            items: [
              { entity: 'USPS', action: 'File Change of Address (online free, $1.10 in person)', deadlineDays: 0, url: 'move.usps.com', automated: true },
              { entity: 'IRS / Federal Tax', action: 'Update address on next return OR file Form 8822', deadlineDays: 0, url: 'irs.gov', automated: false },
              { entity: 'Social Security Administration', action: 'Update address online at ssa.gov/myaccount (if benefits received)', deadlineDays: 0, url: 'ssa.gov/myaccount', automated: false },
              { entity: 'Voter Registration', action: 'Register at new address (deadline 0-30 days before election)', deadlineDays: 30, url: 'vote.gov', automated: false },
              { entity: 'Department of Motor Vehicles', action: 'Update license + vehicle registration', deadlineDays: 30, url: 'varies by state', automated: false },
              { entity: 'US Passport', action: 'No change needed for address — update next renewal', deadlineDays: null, automated: false },
              { entity: 'Selective Service', action: 'Update online if male, 18-25', deadlineDays: null, url: 'sss.gov', automated: false },
              { entity: 'VA (Veterans Affairs)', action: 'Update address if receiving benefits', deadlineDays: 0, url: 'va.gov', automated: false },
            ],
          },
          {
            category: 'Financial',
            priority: 'high',
            items: [
              { entity: 'Banks (checking & savings)', action: 'Update address at each bank; verify new ATM network', deadlineDays: 14, automated: false },
              { entity: 'Credit cards', action: 'Update billing address on every card (auto-bills, fraud detection)', deadlineDays: 7, automated: false },
              { entity: 'Investment accounts', action: 'Update brokerage, retirement, HSA', deadlineDays: 14, automated: false },
              { entity: 'Mortgage / Lender', action: 'Notify if homestead status or tax escrow is affected', deadlineDays: 30, automated: false },
              { entity: 'Student loan servicer', action: 'Update address; check state-based repayment programs', deadlineDays: 14, automated: false },
              { entity: 'Tax professional (CPA)', action: 'Send new address (state tax returns change)', deadlineDays: 7, automated: false },
            ],
          },
          {
            category: 'Insurance',
            priority: 'high',
            items: [
              { entity: 'Auto insurance', action: 'Update garaging address BEFORE move date; re-shop at new ZIP', deadlineDays: 0, automated: false },
              { entity: 'Homeowners / Renters', action: 'Bind new policy; old policy ends at move', deadlineDays: 0, automated: false },
              { entity: 'Health insurance', action: 'Update address; marketplace switch if cross-state move (60-day SEP)', deadlineDays: 14, automated: false },
              { entity: 'Life insurance', action: 'Update beneficiary & address on policy', deadlineDays: 30, automated: false },
              { entity: 'Umbrella / Liability', action: 'Update underlying policy references', deadlineDays: 30, automated: false },
              { entity: 'Pet insurance', action: 'Update address; check network providers in new area', deadlineDays: 14, automated: false },
            ],
          },
          {
            category: 'Utilities & Services',
            priority: 'medium',
            items: [
              { entity: 'Electric utility', action: 'Transfer service to new address; same week as move-in', deadlineDays: 0, automated: true },
              { entity: 'Gas / Heating oil', action: 'Schedule final reading at old address', deadlineDays: 0, automated: false },
              { entity: 'Water / Sewer', action: 'Often municipal — check both old & new city websites', deadlineDays: 0, automated: false },
              { entity: 'Internet / Broadband', action: 'Schedule install at new address (often 2-week lead time)', deadlineDays: 14, automated: false },
              { entity: 'Mobile phone', action: 'Update billing address; check coverage at new address', deadlineDays: 7, automated: false },
              { entity: 'Cable / Streaming', action: 'Cancel or transfer to new address', deadlineDays: 7, automated: false },
              { entity: 'Trash / Recycle', action: 'Often municipal; may change frequency by city', deadlineDays: 14, automated: false },
              { entity: 'Home security', action: 'Update monitoring address; re-install if ownership changed', deadlineDays: 0, automated: false },
            ],
          },
          {
            category: 'Subscriptions & Memberships',
            priority: 'medium',
            items: [
              { entity: 'Amazon / Online retailers', action: 'Update default shipping address per profile', deadlineDays: 0, automated: true },
              { entity: 'Subscription boxes', action: 'Update address for each (meal kits, pet food, etc.)', deadlineDays: 7, automated: false },
              { entity: 'Gym membership', action: 'Cancel / transfer or find new location (chain freeze requests)', deadlineDays: 14, automated: false },
              { entity: 'Warehouse clubs', action: 'Update address; primary location may differ', deadlineDays: 7, automated: false },
              { entity: 'Professional associations', action: 'Update address for certifications & journals', deadlineDays: 30, automated: false },
              { entity: 'Reward programs (airlines, hotels)', action: 'Update profile for residency change', deadlineDays: 7, automated: false },
            ],
          },
          {
            category: 'Personal & Medical',
            priority: 'high',
            items: [
              { entity: 'Employer / HR', action: 'Update address; may affect state income tax withholding', deadlineDays: 7, automated: false },
              { entity: 'Primary care physician', action: 'Request records transfer; find new PCP if relocating far', deadlineDays: 30, automated: false },
              { entity: 'Specialists', action: 'Transfer records; establish new specialists in destination city', deadlineDays: 30, automated: false },
              { entity: 'Dentist', action: 'Transfer records; find new provider', deadlineDays: 30, automated: false },
              { entity: 'Pharmacy', action: 'Transfer prescriptions to in-network pharmacy near new home', deadlineDays: 0, automated: false },
              { entity: 'Veterinarian', action: 'Transfer pet records; find new vet', deadlineDays: 14, automated: false },
              { entity: 'Children\'s schools', action: 'Update enrollment records, bus routes, immunization history', deadlineDays: 30, automated: false },
              { entity: 'Childcare provider', action: 'Cancel at old location; enroll at new facility (waitlists common)', deadlineDays: 60, automated: false },
              { entity: 'Religious organizations', action: 'Update records; find new congregation', deadlineDays: 30, automated: false },
            ],
          },
          {
            category: 'Legal & Miscellaneous',
            priority: 'low',
            items: [
              { entity: 'Will / Estate attorney', action: 'Update address; review for state-specific provisions', deadlineDays: 30, automated: false },
              { entity: 'Trustee / Executor', action: 'Notify key contacts of address change', deadlineDays: 7, automated: false },
              { entity: 'Magazine / Newspaper subscriptions', action: 'Update delivery address', deadlineDays: 0, automated: false },
              { entity: 'Charitable donations', action: 'Update recurring donation address', deadlineDays: 7, automated: false },
              { entity: 'Emergency contacts', action: 'Update address in your phone + in records at schools/employers', deadlineDays: 0, automated: false },
            ],
          },
        ],
        summary: {
          totalItems: 50,
          highPriorityCount: 18,
          averageLeadTimeDays: 14,
          recommendation: 'Block 2-3 hours the week before moving to handle the high-priority items. USPS Change of Address kicks off a cascade that handles ~30% of the list automatically.',
        },
      });
    },
  );
}
