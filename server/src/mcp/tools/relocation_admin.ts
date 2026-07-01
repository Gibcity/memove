import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { isAddonEnabled } from '../../services/adminService';
import { ADDON_IDS } from '../../addons';
import { ok } from './_shared';
import { canRead } from '../scopes';
import { adminToolDefs } from '../tool-registry';

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
// ponytail: DMV/VOTER tables are now shared with the chat-agent registry
// (src/mcp/tool-registry.ts), so they're exported rather than file-local.

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

export const DMV_DATA: Record<StateCode, DMVInfo> = {
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

export const VOTER_DATA: Record<StateCode, VoterInfo> = {
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

  const tools = adminToolDefs();
  for (const def of tools) {
    if (def.scope === 'read' && !R) continue;
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: def.annotations,
      },
      async (args) => ok(await def.handler({ relocation: {} as never } as never, args as Record<string, unknown>, String(_userId))),
    );
  }
}
