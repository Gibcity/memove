/**
 * Move checklist templates — first-time mover baseline + family & state variants.
 *
 * Each task carries `daysOffset` relative to move day (0). Negative = before, positive = after.
 * Apply-time code computes due_date = moveDate + daysOffset.
 */

export interface ChecklistTask {
  id: string;
  name: string;
  category: string;
  daysOffset: number;
  description?: string;
  priority: number;
  appliesTo?: {
    demographics?: string[];
    firstTimeOnly?: boolean;
    destinationStates?: string[];
    hasPets?: boolean;
  };
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  description: string;
  tasks: ChecklistTask[];
}

const PRIORITY_NORMAL = 0;
const PRIORITY_HIGH = 1;
const PRIORITY_URGENT = 2;

// ── 1. First-timer baseline ────────────────────────────────────────────────

export const firstTimerBaseline: ChecklistTemplate = {
  id: 'first-timer-baseline',
  name: 'First-Time Mover Baseline',
  description:
    'Core tasks every first-time mover needs, from neighborhood research through post-move settlement.',
  tasks: [
    // Housing
    { id: 'research-neighborhoods', name: 'Research target neighborhoods (schools, crime, commute)', category: 'Housing', daysOffset: -60, priority: PRIORITY_NORMAL, description: 'First-timers often pick a place without knowing the area. Drive through at different times of day.' },
    { id: 'compare-apartments', name: 'Compare 3+ rental properties', category: 'Housing', daysOffset: -50, priority: PRIORITY_NORMAL, description: 'Don\'t sign the first one you see. Compare sqft, fees, lease terms.' },
    { id: 'rental-application-docs', name: 'Prepare rental application documents', category: 'Housing', daysOffset: -45, priority: PRIORITY_HIGH, description: 'Pay stubs, ID, references, bank statements. Landlords want these ready before you tour.' },
    { id: 'sign-lease', name: 'Sign lease and pay deposits', category: 'Housing', daysOffset: -30, priority: PRIORITY_HIGH, description: 'Read every clause — first-timers miss pet, guest, and move-out fees.' },
    { id: 'document-pre-existing-damage', name: 'Document pre-existing damage at move-in', category: 'Housing', daysOffset: 0, priority: PRIORITY_HIGH, description: 'Photo/video everything. Protects your deposit when you move out.' },
    { id: 'schedule-move-in-inspection', name: 'Complete landlord move-in inspection', category: 'Housing', daysOffset: 0, priority: PRIORITY_NORMAL },
    { id: 'setup-renters-insurance', name: 'Set up renter\'s insurance', category: 'Housing', daysOffset: -7, priority: PRIORITY_NORMAL, description: 'Often required by lease. Cheap and protects your stuff.' },

    // Financial
    { id: 'budget-upfront-costs', name: 'Budget upfront costs (first + last + security + movers)', category: 'Financial', daysOffset: -60, priority: PRIORITY_HIGH, description: 'First-timers are shocked by the lump sum. Typical move-in cost = 3x rent plus movers.' },
    { id: 'estimate-monthly-costs', name: 'Estimate new monthly costs (rent, utilities, transit)', category: 'Financial', daysOffset: -60, priority: PRIORITY_NORMAL },
    { id: 'check-credit-report', name: 'Check credit report and fix errors', category: 'Financial', daysOffset: -45, priority: PRIORITY_NORMAL, description: 'Surprises here tank rental applications.' },
    { id: 'setup-emergency-fund', name: 'Set aside a move-day emergency fund', category: 'Financial', daysOffset: -30, priority: PRIORITY_NORMAL, description: 'Buffer for unexpected costs (overtime movers, broken item, last-minute hotel).' },
    { id: 'review-tax-implications', name: 'Review state/city tax implications', category: 'Financial', daysOffset: -30, priority: PRIORITY_NORMAL, description: 'Some states have no income tax (TX, FL); others tax you the day you arrive.' },
    { id: 'notify-current-bank', name: 'Notify current bank of address change', category: 'Financial', daysOffset: -14, priority: PRIORITY_NORMAL, description: 'Prevents fraud holds on cards at the worst moment.' },
    { id: 'update-direct-deposit', name: 'Update direct deposit with new bank (if switching)', category: 'Financial', daysOffset: -7, priority: PRIORITY_HIGH, description: 'Time this so old account doesn\'t bounce the first paycheck at the new job.' },

    // Administrative
    { id: 'research-license-deadline', name: 'Research new state driver\'s license deadline', category: 'Administrative', daysOffset: -30, priority: PRIORITY_NORMAL, description: 'Most states require a new license within 10–30 days of becoming a resident.' },
    { id: 'gather-id-documents', name: 'Gather ID documents (passport, SSN, birth cert, proofs)', category: 'Administrative', daysOffset: -30, priority: PRIORITY_NORMAL, description: 'You\'ll need these for license, bank, and voter registration. First-timers scramble at the DMV without them.' },
    { id: 'request-medical-records', name: 'Request copies of medical and dental records', category: 'Administrative', daysOffset: -30, priority: PRIORITY_NORMAL, description: 'Providers take 1–3 weeks. Request before you forget the old provider\'s contact info.' },
    { id: 'register-to-vote', name: 'Register to vote in new state/county', category: 'Administrative', daysOffset: -20, priority: PRIORITY_NORMAL, description: 'Often needs to happen before the next election; deadlines vary.' },
    { id: 'update-passport-address', name: 'Update address on passport (if applicable)', category: 'Administrative', daysOffset: -14, priority: PRIORITY_NORMAL, description: 'Optional replacement card is cheap; skip if your travel is stable.' },
    { id: 'forward-mail', name: 'Set up USPS mail forwarding', category: 'Administrative', daysOffset: -7, priority: PRIORITY_NORMAL, description: 'Free at usps.com. Catches stragglers for 12 months.' },
    { id: 'request-school-transcripts', name: 'Request school/degree transcripts (if changing jobs)', category: 'Administrative', daysOffset: -30, priority: PRIORITY_NORMAL, appliesTo: { demographics: ['young_professional', 'graduate_student'] } },

    // Logistics
    { id: 'research-movers', name: 'Research moving companies and read reviews', category: 'Logistics', daysOffset: -60, priority: PRIORITY_NORMAL, description: 'First-timers overpay because they book late. Get 3 quotes.' },
    { id: 'declutter', name: 'Declutter and plan what to sell/donate', category: 'Logistics', daysOffset: -30, priority: PRIORITY_NORMAL, description: 'Moving is cheaper and faster with less stuff.' },
    { id: 'book-movers', name: 'Book movers or reserve truck', category: 'Logistics', daysOffset: -45, priority: PRIORITY_HIGH, description: 'Peak season (May–Sep) books out 4+ weeks. Off-peak is cheaper.' },
    { id: 'order-boxes', name: 'Order moving boxes and supplies', category: 'Logistics', daysOffset: -21, priority: PRIORITY_NORMAL },
    { id: 'pack-room-by-room', name: 'Pack room by room (non-essentials)', category: 'Logistics', daysOffset: -14, priority: PRIORITY_NORMAL },
    { id: 'reserve-elevator', name: 'Reserve building elevator for move day', category: 'Logistics', daysOffset: -7, priority: PRIORITY_NORMAL, description: 'Apartments often require advance booking; some charge a fee.' },
    { id: 'pack-essentials-box', name: 'Pack "first night" essentials box', category: 'Logistics', daysOffset: -3, priority: PRIORITY_HIGH, description: 'Toiletries, chargers, sheets, snacks, documents. You will not find anything the first night.' },
    { id: 'label-rooms', name: 'Label boxes by room and priority', category: 'Logistics', daysOffset: -1, priority: PRIORITY_NORMAL },

    // Utilities
    { id: 'schedule-electric', name: 'Schedule electric service to start on move-in day', category: 'Utilities', daysOffset: -14, priority: PRIORITY_NORMAL, description: 'Each utility is a separate signup. Don\'t forget trash.' },
    { id: 'schedule-gas', name: 'Schedule gas service to start on move-in day', category: 'Utilities', daysOffset: -14, priority: PRIORITY_NORMAL, appliesTo: { demographics: ['family_with_kids', 'cold_climate_destination'] } },
    { id: 'schedule-internet', name: 'Schedule internet install', category: 'Utilities', daysOffset: -14, priority: PRIORITY_HIGH, description: 'Install slots fill up, especially in apartments. ISPs often need 1–2 weeks lead time.' },
    { id: 'schedule-water', name: 'Schedule water/trash service', category: 'Utilities', daysOffset: -7, priority: PRIORITY_NORMAL, description: 'Often included in rent — confirm with landlord before signing up.' },
    { id: 'schedule-trash', name: 'Confirm trash/recycling pickup schedule', category: 'Utilities', daysOffset: -3, priority: PRIORITY_NORMAL },

    // Settlement
    { id: 'research-healthcare', name: 'Research healthcare providers accepting new insurance', category: 'Settlement', daysOffset: -21, priority: PRIORITY_NORMAL, description: 'First-timers don\'t realize their existing doctor is out-of-network.' },
    { id: 'transfer-prescriptions', name: 'Transfer prescriptions to new pharmacy', category: 'Settlement', daysOffset: -14, priority: PRIORITY_HIGH, description: 'Refill before you move, then transfer. Avoids gaps on controlled substances.' },
    { id: 'find-dentist', name: 'Find a local dentist', category: 'Settlement', daysOffset: -21, priority: PRIORITY_NORMAL },
    { id: 'find-vet', name: 'Find a local vet', category: 'Settlement', daysOffset: -21, priority: PRIORITY_NORMAL, appliesTo: { hasPets: true } },
    { id: 'locate-hospital', name: 'Locate nearest hospital and urgent care', category: 'Settlement', daysOffset: -7, priority: PRIORITY_NORMAL, description: 'You don\'t want to Google this in an emergency.' },

    // Post-move
    { id: 'unpack-essentials', name: 'Unpack essentials box and set up beds', category: 'Post-move', daysOffset: 1, priority: PRIORITY_HIGH },
    { id: 'review-lease-moveout', name: 'Review lease move-out conditions', category: 'Post-move', daysOffset: 1, priority: PRIORITY_NORMAL, description: 'Read this once while it\'s fresh — easy to forget.' },
    { id: 'emergency-locate-utilities', name: 'Locate water shutoff and breaker panel', category: 'Post-move', daysOffset: 1, priority: PRIORITY_NORMAL, description: 'Before you need them in an emergency.' },
    { id: 'introduce-yourself-neighbors', name: 'Introduce yourself to neighbors', category: 'Post-move', daysOffset: 3, priority: PRIORITY_NORMAL, description: 'Easier to ask favors later (parcel, noise, etc.) after a hello.' },
    { id: 'update-address-all-accounts', name: 'Update mailing address on all accounts and subscriptions', category: 'Post-move', daysOffset: 3, priority: PRIORITY_NORMAL, description: 'Banks, credit cards, Amazon, insurance, employer. There are always more than you think.' },
    { id: 'explore-neighborhood', name: 'Explore neighborhood: grocery, pharmacy, gym, parks', category: 'Post-move', daysOffset: 7, priority: PRIORITY_NORMAL },
    { id: 'register-vehicle', name: 'Register vehicle and update title in new state', category: 'Post-move', daysOffset: 10, priority: PRIORITY_HIGH, description: 'Most states allow 30 days but sooner is safer.' },
  ],
};

// ── 2. Family with kids ───────────────────────────────────────────────────

export const familyWithKids: ChecklistTemplate = {
  id: 'family-with-kids',
  name: 'Family with Kids — Extra Tasks',
  description:
    'Additional tasks when relocating with children. Apply alongside the baseline.',
  tasks: [
    { id: 'research-school-districts', name: 'Research school districts and ratings', category: 'Administrative', daysOffset: -60, priority: PRIORITY_HIGH, description: 'First-timers with kids often forget this is the #1 driver of where to live.', appliesTo: { demographics: ['family_with_kids'] } },
    { id: 'contact-school-enrollment', name: 'Contact target school about enrollment process', category: 'Administrative', daysOffset: -45, priority: PRIORITY_HIGH, appliesTo: { demographics: ['family_with_kids'] } },
    { id: 'arrange-immunization-records', name: 'Get immunization records and physicals', category: 'Administrative', daysOffset: -30, priority: PRIORITY_HIGH, description: 'Schools won\'t enroll kids without these.', appliesTo: { demographics: ['family_with_kids'] } },
    { id: 'gather-school-records', name: 'Request school records transfer', category: 'Administrative', daysOffset: -30, priority: PRIORITY_NORMAL, appliesTo: { demographics: ['family_with_kids'] } },
    { id: 'research-childcare', name: 'Research childcare/daycare options', category: 'Settlement', daysOffset: -30, priority: PRIORITY_HIGH, description: 'Waitlists are 6–12 months in many metros.', appliesTo: { demographics: ['family_with_kids'] } },
    { id: 'schedule-pediatrician-transfer', name: 'Schedule first visit with new pediatrician', category: 'Settlement', daysOffset: -21, priority: PRIORITY_NORMAL, appliesTo: { demographics: ['family_with_kids'] } },
    { id: 'find-pediatric-dentist', name: 'Find a pediatric dentist', category: 'Settlement', daysOffset: -14, priority: PRIORITY_NORMAL, appliesTo: { demographics: ['family_with_kids'] } },
    { id: 'register-school-bus', name: 'Register for school bus / transit', category: 'Post-move', daysOffset: -7, priority: PRIORITY_NORMAL, appliesTo: { demographics: ['family_with_kids'] } },
    { id: 'enroll-children', name: 'Complete school enrollment and orientation', category: 'Post-move', daysOffset: 10, priority: PRIORITY_HIGH, appliesTo: { demographics: ['family_with_kids'] } },
    { id: 'research-youth-activities', name: 'Research youth sports, scouts, after-school programs', category: 'Settlement', daysOffset: 14, priority: PRIORITY_NORMAL, appliesTo: { demographics: ['family_with_kids'] } },
  ],
};

// ── 3. Texas-specific ─────────────────────────────────────────────────────

export const stateTexas: ChecklistTemplate = {
  id: 'state-tx',
  name: 'Texas — State-Specific Tasks',
  description:
    'Texas has no state income tax but specific vehicle and property tax rules. Apply on top of the baseline when moving to TX.',
  tasks: [
    { id: 'tx-no-state-income-tax', name: 'Review: Texas has no state income tax', category: 'Financial', daysOffset: -30, priority: PRIORITY_NORMAL, description: 'Favorable for high earners. Sales and property taxes offset some of it — run the numbers.' },
    { id: 'tx-property-tax-county', name: 'Check property tax rate for your target county', category: 'Financial', daysOffset: -30, priority: PRIORITY_NORMAL, description: 'TX property taxes vary 2x by county. Big factor in owning-vs-renting math.' },
    { id: 'tx-get-drivers-license', name: 'Get Texas driver\'s license within 90 days', category: 'Administrative', daysOffset: -14, priority: PRIORITY_HIGH, description: 'TX allows 90 days — longer than most states — but don\'t push it.' },
    { id: 'tx-vehicle-inspection', name: 'Get vehicle inspected within 7 days of registration', category: 'Administrative', daysOffset: 7, priority: PRIORITY_URGENT, description: 'Annual state inspection required. Must be done within 7 days of registering a vehicle you bring into the state.' },
    { id: 'tx-register-vehicle-30d', name: 'Register vehicle in Texas within 30 days', category: 'Administrative', daysOffset: 30, priority: PRIORITY_HIGH, description: 'Bring out-of-state title, proof of insurance, and inspection. Plan a half-day at the DMV.' },
    { id: 'tx-update-vehicle-insurance', name: 'Update auto insurance to meet TX minimums', category: 'Financial', daysOffset: 0, priority: PRIORITY_HIGH, description: 'TX requires 30/60/25 liability minimums — higher than many states.' },
    { id: 'tx-title-transfer', name: 'Transfer vehicle title at county tax office', category: 'Administrative', daysOffset: 30, priority: PRIORITY_NORMAL, description: 'Done in-person at the county tax assessor-collector, not the DMV.' },
    { id: 'tx-register-vote-county', name: 'Confirm voter registration in your TX county', category: 'Administrative', daysOffset: -20, priority: PRIORITY_NORMAL, description: 'County-level registration determines your local races — TX school board and county judge are competitive.' },
  ],
};

// ── Aggregate export ──────────────────────────────────────────────────────

export const MOVE_CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  firstTimerBaseline,
  familyWithKids,
  stateTexas,
];

// ── Selection helper ──────────────────────────────────────────────────────

export interface MoveChecklistContext {
  destinationState?: string;
  demographics?: string[];
  firstTimeMover?: boolean;
  hasPets?: boolean;
}

/** Flatten templates and filter tasks by appliesTo rules. Pure data routing. */
export function selectChecklistTasks(ctx: MoveChecklistContext): ChecklistTask[] {
  const out: ChecklistTask[] = [];
  for (const tpl of MOVE_CHECKLIST_TEMPLATES) {
    for (const task of tpl.tasks) {
      const a = task.appliesTo;
      if (!a) {
        out.push(task);
        continue;
      }
      if (a.firstTimeOnly && !ctx.firstTimeMover) continue;
      if (a.hasPets && !ctx.hasPets) continue;
      if (a.destinationStates && (!ctx.destinationState || !a.destinationStates.includes(ctx.destinationState))) continue;
      if (a.demographics && (!ctx.demographics || !a.demographics.some(d => ctx.demographics!.includes(d)))) continue;
      out.push(task);
    }
  }
  return out;
}