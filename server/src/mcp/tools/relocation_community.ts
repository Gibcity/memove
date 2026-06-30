import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { z } from 'zod';
import { isAddonEnabled } from '../../services/adminService';
import { ADDON_IDS } from '../../addons';
import { RelocationService } from '../../nest/relocation/relocation.service';
import { TOOL_ANNOTATIONS_READONLY, ok } from './_shared';
import { canRead } from '../scopes';
import type { Location } from '@memove/shared';

/**
 * MCP tools for the Settlement & Community agent (post-decision phase).
 *
 * 4 tools: assess_healthcare_access, school_district_overview,
 *          community_fit_analysis, settlement_checklist
 *
 * All read-only. Registry is gated by the relocation add-on.
 */

const relocationService = new RelocationService();

// ── Shared helpers ───────────────────────────────────────────────────────────

type ExtendedLocation = Location & {
  healthOutcomes: {
    lifeExpectancy: number;
    adultObesityPct: number;
    adultSmokingPct: number;
    poorMentalHealthDays: number;
    primaryCarePhysiciansPer100k: number;
  };
  transportation: {
    avgCommuteMinutes: number;
    pctTransitCommute: number;
    pctRemoteWork: number;
    longCommutePct: number;
  };
  mobility: {
    upwardMobilityScore: number;
    mobilityPercentile: number;
  };
};

function getExt(id: string): ExtendedLocation | undefined {
  // ponytail: healthOutcomes/mobility/transportation exist in locations.json but aren't in @memove/shared yet
  return relocationService.getLocationById(id) as ExtendedLocation | undefined;
}

const NATIONAL_AVG = {
  lifeExpectancy: 78.5, // CDC NVSS 2022
  adultObesityPct: 33.6, // BRFSS 2022
  adultSmokingPct: 11.5, // BRFSS 2022
  poorMentalHealthDays: 4.0, // CHR
  primaryCarePhysiciansPer100k: 75.0, // AAMC baseline
};

const SPECIALTY_GUIDANCE: Record<string, string> = {
  pediatrics:
    'Pediatricians cluster near hospital systems; verify the nearest children\'s hospital and confirm in-network status with your insurance.',
  cardiology:
    'Look for an ACC-accredited chest pain center or a hospital with a cath lab. Cardiologists follow tertiary centers, not just any clinic.',
  mental_health:
    'Psychiatrist supply is constrained nationally — expect 4-8 week wait times for new patients. Check Psychology Today and Zocdoc for in-network therapists.',
  maternity:
    'Confirm a Level II or III NICU at the nearest hospital if any pregnancy risk exists. Midwife-friendly birth centers matter for low-risk pregnancies.',
  geriatrics:
    'Board-certified geriatricians are rare (~1 per 3,000 seniors). Look for a geriatrics consult service at a university-affiliated hospital.',
};

function pctile(label: string, value: number, n: number): string {
  if (!n) return `${label}: no data`;
  return `${label}: ${value.toFixed(1)} (${n}th percentile)`;
}

const LIFESTYLE_WEIGHTS: Record<string, Record<string, number>> = {
  family_oriented: {
    upwardMobility: 30,
    healthcare: 25,
    lifeExpectancy: 25,
    recreation: 20,
  },
  young_professional: {
    broadband: 25,
    transit: 20,
    healthcare: 15,
    affordability: 40,
  },
  retiree: {
    healthcare: 35,
    lifeExpectancy: 25,
    affordability: 20,
    commute: 20,
  },
  outdoor_enthusiast: {
    sunshine: 25,
    natureAreas: 30,
    recreation: 20,
    lowPrecipitation: 25,
  },
  arts_culture: {
    populationProxy: 30,
    healthcare: 15,
    broadband: 15,
    upwardMobility: 40,
  },
  foodie: {
    grocery: 30,
    populationProxy: 30,
    recreation: 20,
    upwardMobility: 20,
  },
};

export function registerCommunityTools(
  server: McpServer,
  _userId: number,
  scopes: string[] | null,
): void {
  if (!isAddonEnabled(ADDON_IDS.RELOCATION)) return;

  const R = canRead(scopes, 'relocation');
  if (!R) return;

  // ── 1. assess_healthcare_access ─────────────────────────────────────────
  server.registerTool(
    'assess_healthcare_access',
    {
      description:
        'Detailed healthcare access analysis for a location — hospital density, physician supply, life expectancy vs national average, and specialist-specific guidance. Use after a candidate is shortlisted to gauge whether routine + specialty care will be accessible.',
      inputSchema: {
        locationId: z
          .string()
          .describe("Location ID (e.g., 'austin-tx') or partial name match"),
        specialty: z
          .enum(['pediatrics', 'cardiology', 'mental_health', 'maternity', 'geriatrics'])
          .optional()
          .describe('Optional specialty to get targeted guidance for'),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const loc = getExt(args.locationId);
      if (!loc) {
        return {
          content: [{ type: 'text' as const, text: `Location not found: ${args.locationId}` }],
          isError: true,
        };
      }
      const hc = loc.healthcare;
      const ho = loc.healthOutcomes;
      const delta =
        ho.lifeExpectancy > 0 ? (ho.lifeExpectancy - NATIONAL_AVG.lifeExpectancy).toFixed(1) : null;
      const specialtyNote = args.specialty ? SPECIALTY_GUIDANCE[args.specialty] : null;

      const summary = {
        location: { id: loc.id, name: loc.name, state: loc.state },
        accessScore: hc.healthcareAccessScore,
        hospitalCountWithin10mi: hc.hospitalCountWithin10mi,
        primaryCarePhysiciansPer100k: ho.primaryCarePhysiciansPer100k,
        primaryCareDelta:
          ho.primaryCarePhysiciansPer100k > 0
            ? Math.round(ho.primaryCarePhysiciansPer100k - NATIONAL_AVG.primaryCarePhysiciansPer100k)
            : null,
        lifeExpectancy: ho.lifeExpectancy,
        lifeExpectancyVsNational: delta,
        healthOutcomes: {
          adultObesityPct: ho.adultObesityPct,
          obesityVsNational:
            ho.adultObesityPct > 0
              ? `${(ho.adultObesityPct - NATIONAL_AVG.adultObesityPct).toFixed(1)} pts`
              : null,
          adultSmokingPct: ho.adultSmokingPct,
          smokingVsNational:
            ho.adultSmokingPct > 0
              ? `${(ho.adultSmokingPct - NATIONAL_AVG.adultSmokingPct).toFixed(1)} pts`
              : null,
          poorMentalHealthDays: ho.poorMentalHealthDays,
        },
        specialistGuidance: specialtyNote,
      };
      return ok(summary);
    },
  );

  // ── 2. school_district_overview ─────────────────────────────────────────
  server.registerTool(
    'school_district_overview',
    {
      description:
        'School quality overview for a location. Since district test scores are out-of-scope of the platform, this uses upward mobility data as a community-investment proxy and points the user to authoritative sources (GreatSchools, Niche, district sites).',
      inputSchema: {
        locationId: z
          .string()
          .describe("Location ID (e.g., 'austin-tx') or partial name match"),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const loc = getExt(args.locationId);
      if (!loc) {
        return {
          content: [{ type: 'text' as const, text: `Location not found: ${args.locationId}` }],
          isError: true,
        };
      }
      const m = loc.mobility;
      const ho = loc.healthOutcomes;
      const amen = loc.amenities;
      const reconIndicator =
        m.mobilityPercentile >= 75
          ? 'Strong'
          : m.mobilityPercentile >= 50
            ? 'Average'
            : m.mobilityPercentile > 0
              ? 'Below average'
              : 'No data';
      return ok({
        location: { id: loc.id, name: loc.name, state: loc.state },
        mobility: {
          upwardMobilityScore: m.upwardMobilityScore,
          percentile: m.mobilityPercentile,
          interpretation: pctile(
            'Kids from this area reaching top income quintile',
            m.upwardMobilityScore,
            m.mobilityPercentile,
          ),
          proxyFor: `Higher mobility correlates with stronger public-school investment, lower child poverty, and broader community resources. ${reconIndicator} (vs other US metros)`,
        },
        communityHealthProxy: {
          lifeExpectancy: ho.lifeExpectancy,
          poorMentalHealthDays: ho.poorMentalHealthDays,
          interpretation:
            'Long life expectancy and low poor-mental-health days correlate with well-resourced community services, including schools.',
        },
        amenityAccess: {
          recreationAreaCount: amen.recreationAreaCount,
          interpretation:
            'Recreation area count is a proxy for parks, libraries, and after-school programming access.',
        },
        // ponytail: out-of-scope data — always redirect to authoritative sources
        nextSteps: [
          'Look up the assigned school district on GreatSchools.org for rating + test scores.',
          'Cross-check Niche.com for parent reviews and demographic breakdowns.',
          'Visit the district website for enrollment deadlines and boundary maps.',
          'Contact the district directly for special-education / IEP transfer logistics.',
          'Verify school assignment by address — district lines rarely match the CBSA boundary.',
        ],
      });
    },
  );

  // ── 3. community_fit_analysis ───────────────────────────────────────────
  server.registerTool(
    'community_fit_analysis',
    {
      description:
        "Analyze how well a location fits a stated lifestyle — family_oriented, young_professional, retiree, outdoor_enthusiast, arts_culture, foodie. Combines amenities, climate, healthcare, transportation, and mobility data into a scored match with strengths and weaknesses. The platform has no culture index, so this is a heuristic fit, not a vibe report.",
      inputSchema: {
        locationId: z
          .string()
          .describe("Location ID (e.g., 'austin-tx') or partial name match"),
        lifestyle: z.enum([
          'family_oriented',
          'young_professional',
          'retiree',
          'outdoor_enthusiast',
          'arts_culture',
          'foodie',
        ]),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const loc = getExt(args.locationId);
      if (!loc) {
        return {
          content: [{ type: 'text' as const, text: `Location not found: ${args.locationId}` }],
          isError: true,
        };
      }
      const ho = loc.healthOutcomes;
      const trans = loc.transportation;
      const amen = loc.amenities;
      const climate = loc.climate;
      const hc = loc.healthcare;

      // Heuristic: each lifestyle scores 0-100 across 4 weighted dimensions.
      const strengths: string[] = [];
      const weaknesses: string[] = [];

      function add(cond: boolean, hit: string, miss: string): void {
        (cond ? strengths : weaknesses).push(cond ? hit : miss);
      }
      const dims: Record<string, number> = {};

      switch (args.lifestyle) {
        case 'family_oriented': {
          dims.upwardMobility = loc.mobility.mobilityPercentile; // weight 30
          dims.healthcare = hc.healthcareAccessScore; // 25
          dims.lifeExpectancy = ho.lifeExpectancy > 0 ? ho.lifeExpectancy * 1.2 : 0; // 25
          dims.recreation = Math.min(100, amen.recreationAreaCount * 4); // 20
          add(
            loc.mobility.mobilityPercentile >= 75,
            'Strong upward mobility — kids from here tend to do well economically.',
            'Average or below-average upward mobility; investigate school quality directly.',
          );
          add(
            hc.healthcareAccessScore >= 70,
            'Solid healthcare access for routine family care.',
            'Limited healthcare access — pediatrician availability may be tight.',
          );
          add(
            ho.poorMentalHealthDays > 0 && ho.poorMentalHealthDays <= 4,
            'Community mental health is in the healthy range.',
            'Higher-than-average poor mental health days — factor in family services access.',
          );
          break;
        }
        case 'young_professional': {
          dims.broadband = loc.broadband.pctHouseholdsWith100MbpsPlus; // 25
          dims.transit = trans.pctTransitCommute * 100 + trans.pctRemoteWork * 2; // 20
          dims.healthcare = hc.healthcareAccessScore; // 15
          dims.affordability = Math.max(0, 100 - loc.cost.costOfLivingIndex); // 40
          add(
            loc.broadband.pctHouseholdsWith100MbpsPlus >= 85,
            'Excellent broadband — remote-work and streaming ready.',
            'Weaker broadband; check address-level speeds before committing.',
          );
          add(
            trans.pctRemoteWork >= 12 || trans.avgCommuteMinutes <= 22,
            'Commute patterns skew remote or short — better work-life balance.',
            'Long average commutes or low remote work — factor in transit quality of life.',
          );
          add(
            loc.cost.medianRent > 0 && loc.cost.medianRent <= 1300,
            'Rent is approachable for a single professional income.',
            'Rent is high relative to national median — roommates likely needed.',
          );
          break;
        }
        case 'retiree': {
          dims.healthcare = hc.healthcareAccessScore; // 35
          dims.lifeExpectancy = ho.lifeExpectancy > 0 ? ho.lifeExpectancy * 1.2 : 0; // 25
          dims.affordability = Math.max(0, 100 - loc.cost.costOfLivingIndex); // 20
          dims.commute = trans.pctTransitCommute >= 2 ? 80 : 50; // 20
          add(
            hc.hospitalCountWithin10mi >= 3,
            'Multiple hospitals within 10 miles — strong specialty + emergency coverage.',
            'Few hospitals nearby — important for specialist + ER access.',
          );
          add(
            ho.lifeExpectancy >= NATIONAL_AVG.lifeExpectancy,
            'Life expectancy above national average — community supports aging well.',
            'Life expectancy below national average — investigate why (healthcare, environment).',
          );
          add(
            trans.pctTransitCommute >= 2,
            'Some transit presence — useful for older drivers giving up the car.',
            'Auto-dependent — plan for the transition off driving.',
          );
          break;
        }
        case 'outdoor_enthusiast': {
          dims.sunshine = climate.sunshineHoursAnnual > 0 ? Math.min(100, climate.sunshineHoursAnnual / 32) : 0; // 25
          dims.natureAreas = Math.min(100, amen.natureAreaCount * 5); // 30
          dims.recreation = Math.min(100, amen.recreationAreaCount * 4); // 20
          dims.lowPrecipitation = climate.annualPrecipitationInches > 0 ? Math.max(0, 100 - climate.annualPrecipitationInches * 2) : 50; // 25
          add(
            amen.natureAreaCount >= 8,
            'Strong nature-area count — hiking/wildlife nearby.',
            'Limited nature areas; expect to drive for trail access.',
          );
          add(
            climate.sunshineHoursAnnual >= 2500,
            'High sunshine hours — year-round outdoor options.',
            'Low sunshine — seasonal mood and outdoor time restrictions likely.',
          );
          add(
            climate.annualPrecipitationInches <= 30,
            'Lower precipitation — fewer washout days.',
            'Heavy precipitation — outdoor hobbies get rained out regularly.',
          );
          break;
        }
        case 'arts_culture': {
          dims.populationProxy = Math.max(0, 100 - loc.cost.costOfLivingIndex); // proxy for dense / desirable metros, 30
          dims.healthcare = hc.healthcareAccessScore; // 15
          dims.broadband = loc.broadband.pctHouseholdsWith100MbpsPlus; // 15
          dims.upwardMobility = loc.mobility.mobilityPercentile; // community investment proxy, 40
          add(
            loc.cost.costOfLivingIndex >= 100,
            'Cost of living above national average — usually correlates with amenity-rich metro areas.',
            'Lower cost-of-living area may mean less dense cultural scene — verify directly.',
          );
          add(
            loc.mobility.mobilityPercentile >= 60,
            'Community-investment proxies are healthy — supports cultural institutions.',
            'Mixed community-investment signals — research specific venues and museums.',
          );
          add(
            amen.recreationAreaCount >= 10,
            'Strong recreation-area count — often tracks with public spaces and event venues.',
            'Lower recreation density — cultural amenities likely more limited.',
          );
          // ponytail: no live arts index in the dataset — always flag the gap
          weaknesses.push(
            'No direct arts/culture index available — verify with Niche.com, local magazines, and event calendars before committing.',
          );
          break;
        }
        case 'foodie': {
          dims.grocery = Math.min(100, amen.groceryStoreDensityPerCapita * 50); // 30
          dims.populationProxy = Math.max(0, 100 - loc.cost.costOfLivingIndex); // 30
          dims.recreation = Math.min(100, amen.recreationAreaCount * 4); // 20
          dims.upwardMobility = loc.mobility.mobilityPercentile; // 20
          add(
            amen.groceryStoreDensityPerCapita >= 1.5,
            'Strong grocery-store density — usually tracks with diverse restaurants.',
            'Sparse grocery density — restaurant scene may also be limited.',
          );
          add(
            amen.bigBoxStoreCount >= 6,
            'Multiple big-box stores nearby — strong retail + food infrastructure.',
            'Few big-box retailers — retail/food variety may be thinner.',
          );
          weaknesses.push(
            'No restaurant-scene index available — cross-reference Yelp, Eater, and local food blogs.',
          );
          break;
        }
      }

      const w = LIFESTYLE_WEIGHTS[args.lifestyle];
      let scoreSum = 0;
      let weightSum = 0;
      const sub = dims;
      for (const [k, weight] of Object.entries(w)) {
        scoreSum += Math.max(0, Math.min(100, sub[k] ?? 0)) * weight;
        weightSum += weight;
      }
      const matchScore = weightSum > 0 ? Math.round(scoreSum / weightSum) : 0;

      return ok({
        location: { id: loc.id, name: loc.name, state: loc.state },
        lifestyle: args.lifestyle,
        matchScore,
        subscores: sub,
        strengths,
        weaknesses,
        // ponytail: heuristic only — flag ceiling
        caveat:
          'Heuristic fit based on platform data only. Confirm cultural fit through visits, local conversations, and (for arts_culture/foodie) venue/event research.',
      });
    },
  );

  // ── 4. settlement_checklist ─────────────────────────────────────────────
  server.registerTool(
    'settlement_checklist',
    {
      description:
        'Post-move settlement checklist for the first 30 days — healthcare, community, services, and (optionally) family + pet tasks. Generic and stateless; user customizes locally.',
      inputSchema: {
        toLocationId: z
          .string()
          .describe("Location ID of the new city/metro (e.g., 'austin-tx')"),
        hasChildren: z.boolean().optional().describe('Include family-schooling tasks'),
        hasPets: z.boolean().optional().describe('Include pet care tasks'),
        employmentType: z
          .enum(['remote', 'hybrid', 'in_person', 'self_employed', 'unemployed'])
          .optional()
          .describe('Modifies services section (work setup, commute)',
          ),
      },
      annotations: TOOL_ANNOTATIONS_READONLY,
    },
    async (args) => {
      const loc = getExt(args.toLocationId);
      if (!loc) {
        return {
          content: [{ type: 'text' as const, text: `Location not found: ${args.toLocationId}` }],
          isError: true,
        };
      }
      const hc = loc.healthcare;
      const amen = loc.amenities;
      const trans = loc.transportation;

      const checklist = {
        destination: { id: loc.id, name: loc.name, state: loc.state },
        healthcare: {
          why: `${hc.hospitalCountWithin10mi} hospitals within 10 miles; access score ${hc.healthcareAccessScore}/100.`,
          tasks: [
            'Find a primary care physician accepting new patients (Zocdoc, insurance portal).',
            'Find a dentist — confirm in-network status.',
            'Transfer prescriptions to a local pharmacy on day one.',
            'Locate the nearest urgent care and ER (not the same as the nearest hospital).',
            `Verify health insurance coverage in ${loc.state} — network may differ.`,
          ],
        },
        community: {
          tasks: [
            'Register to vote (deadline often 30 days before the next election).',
            `Update driver's license at the ${loc.state} DMV within the state-required window (often 30-90 days).`,
            'Register the vehicle with the state (if moving from out of state).',
            'Find the nearest library + community center.',
            `Look up ${amen.recreationAreaCount} local recreation areas — parks are the fastest path to neighbors.`,
          ],
        },
        services: {
          tasks: [
            'Open a local bank account (easier bill pay + escrow + utilities).',
            'Set up utilities: power, gas, water, trash, internet.',
            `Identify the closest grocery stores (density score ${amen.groceryStoreDensityPerCapita.toFixed(2)} per capita indicates supply).`,
            'Find a gym or fitness studio — many offer first-month deals.',
            'Forward mail via USPS Change of Address (start date = move-in day).',
            'Transfer homeowner/renter insurance to the new state.',
          ],
        },
      };

      if (args.hasChildren) {
        Object.assign(checklist, {
          family: {
            tasks: [
              'Enroll kids in school — district-by-address; verify boundaries before signing a lease.',
              'Find a pediatrician accepting new patients.',
              'Request immunization records transfer from the previous school/pediatrician.',
              'Locate after-school programs and youth sports leagues.',
              'Find pediatric urgent care hours (most cities have dedicated pediatric ER lines).',
              'Register for childcare waitlists EARLY — even before the move.',
            ],
          },
        });
      }

      if (args.hasPets) {
        Object.assign(checklist, {
          pets: {
            tasks: [
              `Find a local veterinarian — confirm ${loc.state} rabies certificate requirements.`,
              'Register the pet with the city/county if required (some cities mandate this within 30 days).',
              'Locate the nearest 24/7 emergency vet hospital.',
              'Find dog parks and off-leash areas via BringFido and Sniffspot.',
              'Update microchip registration with the new address.',
              `Confirm leash + vaccination laws in ${loc.state} / county.`,
            ],
          },
        });
      }

      if (args.employmentType) {
        checklist.services.tasks.push(
          ...employmentTasks(args.employmentType, trans.avgCommuteMinutes, trans.pctRemoteWork),
        );
      }

      return ok(checklist);
    },
  );
}

function employmentTasks(
  kind: 'remote' | 'hybrid' | 'in_person' | 'self_employed' | 'unemployed',
  avgCommute: number,
  remotePct: number,
): string[] {
  switch (kind) {
    case 'remote':
      return [
        `Set up a dedicated home office — broadband at ${remotePct.toFixed(1)}% of households, verify at your exact address.`,
        'Update address with employer + payroll + tax withholding state.',
        'File a new state tax return if moving from a different state (depends on reciprocity).',
      ];
    case 'hybrid':
      return [
        `Average commute is ${avgCommute.toFixed(1)} minutes — check your specific route, not the average.`,
        'Decide transit vs. driving — pctTransitCommute tells you realistic alternatives.',
        'Confirm employer\'s in-office days and set up a routine around them.',
      ];
    case 'in_person':
      return [
        `Average commute is ${avgCommute.toFixed(1)} minutes — sample it 3+ times at different hours before committing.`,
        'Identify backup commute routes (most metros have 2 viable options).',
        'Open a workplace-adjacent locker or mail service if traffic is unreliable.',
      ];
    case 'self_employed':
      return [
        'Register a business entity in the new state (LLC, sole prop, etc.).',
        'Update EIN records + business licenses.',
        'Set up a registered agent if forming an LLC in the new state.',
        'Find a CPA familiar with the destination state\'s tax structure.',
      ];
    case 'unemployed':
      return [
        'Register with the state\'s unemployment/job service office.',
        'Update LinkedIn + job-search site locations to the new metro.',
        'Identify co-working spaces for interview prep + outbound work.',
      ];
  }
}
