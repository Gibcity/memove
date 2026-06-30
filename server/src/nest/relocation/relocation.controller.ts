import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { z } from 'zod';
import type { User } from '../../types';
import type { ImplicitSignal } from '@memove/shared';
import { RelocationService } from './relocation.service';
import { RelocationJourneyService } from './relocation-journey.service';
import { CareerService } from './career.service';
import { ConciergeService } from './concierge.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { verifyTripAccess } from '../../services/tripAccess';

// ── Local Zod schemas (request shapes) ─────────────────────────────────────
//
// SearchFilters/ScoreFilters are consumed by the service's TS interfaces, but a
// request body / query string still needs runtime validation — a query with
// maxHomeValue="fivehundred" would otherwise sail through and break later.
// Define the wire schemas here; if they grow, hoist them to @memove/shared.

const numericString = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'expected a number' });
      return z.NEVER;
    }
    return n;
  });

// Wire-level convention: comma-separated strings OR repeated keys both arrive
// as `string | string[]` on @Query(). Split to an array to satisfy the
// service's strict `string[]` interfaces.
const csv = (v: unknown): string[] | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const arr = Array.isArray(v) ? v : String(v).split(',');
  const out = arr.map((s) => String(s).trim()).filter(Boolean);
  return out.length ? out : undefined;
};

const searchFiltersSchema = z.object({
  states: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => csv(v)),
  excludeStates: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => csv(v)),
  maxHomeValue: numericString.optional(),
  maxRent: numericString.optional(),
  maxViolentCrime: numericString.optional(),
  maxRiskTornado: numericString.optional(),
  maxRiskHurricane: numericString.optional(),
  maxRiskEarthquake: numericString.optional(),
  maxRiskWildfire: numericString.optional(),
  maxHotDays: numericString.optional(),
  maxColdDays: numericString.optional(),
  nameContains: z.string().optional(),
  limit: numericString.optional(),
});

const scoreFiltersSchema = searchFiltersSchema.extend({
  // ponytail: shared schema (relocation.schema.ts) advertises `topK`; honor
  // it here so the FE contract matches what the service reads. Falls back
  // to `limit` from searchFiltersSchema, then to the service default (1000).
  topK: z.number().int().positive().optional(),
  weights: z.record(z.string(), z.number()).optional(),
  // ponytail: UserProfile uses `softWeights` (see shared/relocation.schema.ts);
  // accept it here so the FE can pass the profile object through unchanged.
  // Service prefers `weights` when both are present.
  softWeights: z.record(z.string(), z.number()).optional(),
  filters: z.record(z.string(), z.object({ min: z.number().optional(), max: z.number().optional() })).optional(),
});

const idBodySchema = z.object({ locationId: z.string().min(1) });
const idArrayBodySchema = z.object({
  locationIds: z.array(z.string().min(1)).min(2, 'Need at least 2 location IDs'),
  weights: z.record(z.string(), z.number()).optional(),
});
const explainBodySchema = z.object({
  locationId: z.string().min(1),
  weights: z.record(z.string(), z.number()).optional(),
});

const elicitRespondSchema = z.object({
  sessionId: z.string().min(1),
  answer: z.string(),
});
const signalBodySchema = z.object({ signal: z.unknown() });
const shortlistBodySchema = z.object({ locationId: z.string().min(1) });
const eliminateBodySchema = z.object({
  locationId: z.string().min(1),
  reason: z.string().optional(),
});
const toggleTaskSchema = z.object({ taskId: z.string().min(1) });
const setPhaseSchema = z.object({ phase: z.string().min(1) });

const moveChecklistSchema = z.object({
  tripId: z.union([z.string(), z.number()]),
  moveDate: z.string().min(1),
});

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(z.object({ role: z.string(), content: z.string() }))
    .optional(),
});
const conciergeSchema = z.object({ query: z.string().min(1) });

const profileUpdateSchema = z.record(z.string(), z.unknown());
const prefsUpdateSchema = z.record(z.string(), z.unknown());

/**
 * /api/relocation — relocation discovery endpoints.
 *
 * Convention matches the existing Nest controllers: JWT-guarded, user-scoped,
 * returns plain JSON objects. Follows the isAddonEnabled(ADDON_IDS.RELOCATION)
 * gating pattern (client-side check).
 */
@Controller('api/relocation')
@UseGuards(JwtAuthGuard)
export class RelocationController {
  constructor(
    private readonly relocation: RelocationService,
    private readonly journey: RelocationJourneyService,
    private readonly career: CareerService,
    private readonly concierge: ConciergeService,
  ) {}

  // ── Locations ──

  /** GET /api/relocation/locations — lightweight list of all relocation candidates */
  @Get('locations')
  @UsePipes(new ZodValidationPipe(searchFiltersSchema))
  listLocations(@Query() query: z.infer<typeof searchFiltersSchema>) {
    return this.relocation.searchLocations(query);
  }

  /** GET /api/relocation/locations/:id — full location detail */
  @Get('locations/:id')
  getLocation(@Param('id') id: string) {
    const loc = this.relocation.getLocationById(id);
    if (!loc) throw new NotFoundException(`Location not found: ${id}`);
    return loc;
  }

  // ── Scoring ──

  /** POST /api/relocation/score — rank all locations by weighted preferences */
  @Post('score')
  @UsePipes(new ZodValidationPipe(scoreFiltersSchema))
  score(@Body() body: z.infer<typeof scoreFiltersSchema>) {
    // ponytail: accept `softWeights` (UserProfile field name) as an alias for
    // `weights` so the FE can forward the profile verbatim. The service
    // reads `weights`; we map before delegating.
    if (!body.weights && body.softWeights) {
      body.weights = body.softWeights;
    }
    return this.relocation.scoreLocations(body);
  }

  /** POST /api/relocation/score/explain — explain why a location scored as it did */
  @Post('score/explain')
  @UsePipes(new ZodValidationPipe(explainBodySchema))
  explain(@Body() body: z.infer<typeof explainBodySchema>) {
    return this.relocation.explainScore(body.locationId, body.weights);
  }

  // ── Compare ──

  /** POST /api/relocation/compare — side-by-side comparison of 2+ locations */
  @Post('compare')
  @UsePipes(new ZodValidationPipe(idArrayBodySchema))
  compare(@Body() body: z.infer<typeof idArrayBodySchema>) {
    const result = this.relocation.compareLocations(body.locationIds, body.weights);
    if ('error' in result) throw new BadRequestException(result.error);
    return result;
  }

  // ── Fiscal health ──

  /** POST /api/relocation/fiscal-health — assess the fiscal health of a location's state */
  @Post('fiscal-health')
  @UsePipes(new ZodValidationPipe(idBodySchema))
  fiscalHealth(@Body() body: z.infer<typeof idBodySchema>) {
    return this.relocation.fiscalHealth(body.locationId);
  }

  // ── Profile ──

  /** GET /api/relocation/profile — current user's relocation profile */
  @Get('profile')
  getProfile(@CurrentUser() user: User) {
    return this.relocation.getUserProfile(String(user.id));
  }

  /** POST /api/relocation/profile — update user's relocation profile */
  @Post('profile')
  @UsePipes(new ZodValidationPipe(profileUpdateSchema))
  updateProfile(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof profileUpdateSchema>,
  ) {
    return this.relocation.upsertUserProfile(String(user.id), body as never);
  }

  // ── Elicitation (preference-learning loop) ────────────────────────

  /**
   * POST /api/relocation/profile/elicitation/start
   *
   * Begin a new elicitation round.  Returns the session identifier and
   * the first question.  The frontend's useRelocationElicitation hook
   * drives the full 3-question conversation from this starting point.
   */
  @Post('profile/elicitation/start')
  startElicitation(@CurrentUser() user: User) {
    return this.relocation.startElicitation(String(user.id));
  }

  /**
   * POST /api/relocation/profile/elicitation/respond
   *
   * Answer a question in an active elicitation session.  Returns either
   * the next question or signals completion with a profileSnapshot.
   */
  @Post('profile/elicitation/respond')
  @UsePipes(new ZodValidationPipe(elicitRespondSchema))
  respondElicitation(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof elicitRespondSchema>,
  ) {
    return this.relocation.respondToElicitation(
      String(user.id),
      body.sessionId,
      body.answer,
    );
  }

  // ── Implicit signals (TikTok-style behavioral learning) ───────────

  /**
   * POST /api/relocation/profile/signal
   *
   * Record a behavioral signal — the core of the TikTok-style learning
   * loop (RESEARCH.md §1).  Every map-pan, candidate view, dismiss, save,
   * comparison, search, and filter action feeds the user's preference
   * embedding.
   */
  /** POST /api/relocation/profile/signal */
  @Post('profile/signal')
  @UsePipes(new ZodValidationPipe(signalBodySchema))
  submitSignal(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof signalBodySchema>,
  ) {
    return this.relocation.submitImplicitSignal(String(user.id), body.signal as ImplicitSignal);
  }

  // ── Journey state (persistent relocation workspace) ─────────────

  /** GET /api/relocation/journey — current user's relocation journey */
  @Get('journey')
  getJourney(@CurrentUser() user: User) {
    return this.journey.getJourney(Number(user.id));
  }

  /** POST /api/relocation/journey/shortlist — add location to shortlist */
  @Post('journey/shortlist')
  @UsePipes(new ZodValidationPipe(shortlistBodySchema))
  shortlist(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof shortlistBodySchema>,
  ) {
    return this.journey.shortlistLocation(Number(user.id), body.locationId);
  }

  /** POST /api/relocation/journey/eliminate — remove from shortlist */
  @Post('journey/eliminate')
  @UsePipes(new ZodValidationPipe(eliminateBodySchema))
  eliminate(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof eliminateBodySchema>,
  ) {
    return this.journey.eliminateLocation(Number(user.id), body.locationId, body.reason);
  }

  /** POST /api/relocation/journey/preferences — update preferences */
  @Post('journey/preferences')
  @UsePipes(new ZodValidationPipe(prefsUpdateSchema))
  updatePrefs(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof prefsUpdateSchema>,
  ) {
    return this.journey.updatePreferences(Number(user.id), body as never);
  }

  /** POST /api/relocation/journey/toggle-task — toggle task completion */
  @Post('journey/toggle-task')
  @UsePipes(new ZodValidationPipe(toggleTaskSchema))
  toggleTask(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof toggleTaskSchema>,
  ) {
    return this.journey.toggleTask(Number(user.id), body.taskId);
  }

  /** POST /api/relocation/journey/phase — set current phase */
  @Post('journey/phase')
  @UsePipes(new ZodValidationPipe(setPhaseSchema))
  setPhase(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof setPhaseSchema>,
  ) {
    return this.journey.setPhase(Number(user.id), body.phase);
  }

  // ── Chat (in-app agent conversation) ──────────────────────────────

  /**
   * POST /api/relocation/chat — conversational agent endpoint.
   *
   * Accepts a user message and conversation history, returns an agent
   * response. The agent has access to the same relocation data and can
   * recommend cities, compare costs, generate timelines, etc.
   *
   * This is a simple rule-based responder for v1 — it pattern-matches
   * the user's intent and calls the appropriate service method directly.
   * Future: wire to an actual LLM with MCP tool access.
   */
  @Post('chat')
  @UsePipes(new ZodValidationPipe(chatSchema))
  async chat(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof chatSchema>,
  ) {
    const message = body.message?.toLowerCase() ?? '';
    const journey = this.journey.getJourney(Number(user.id));

    // Intent: greeting / help
    if (!message || message.length < 5 || /^(hi|hey|hello|help|start)/.test(message)) {
      return {
        role: 'agent' as const,
        content: `Welcome to your relocation journey! I can help you:\n\n` +
          `🔍 **Discover** — Find cities that match your priorities\n` +
          `💰 **Compare** — Cost of living, taxes, salary adjustments\n` +
          `📦 **Plan** — Move timeline, cost estimates, utility setup\n` +
          `📋 **Admin** — DMV, voter registration, insurance, address changes\n` +
          `🏥 **Settle** — Healthcare, schools, community fit\n\n` +
          `You're currently in the **${journey.currentPhase}** phase${journey.shortlistedLocations.length > 0 ? ` with ${journey.shortlistedLocations.length} shortlisted ${journey.shortlistedLocations.length === 1 ? 'city' : 'cities'}` : ''}.\n\n` +
          `What would you like to explore?`,
        phase: journey.currentPhase,
        shortlistCount: journey.shortlistedLocations.length,
      };
    }

    // Intent: find/search cities
    if (/find|search|look|recommend|suggest|best|warm|cheap|affordable|sunny|safe/.test(message)) {
      const results = this.relocation.scoreLocations({
        limit: 5,
        weights: this.inferWeights(message),
      });
      const top = results.topMatches.slice(0, 5);
      return {
        role: 'agent' as const,
        content: `Here are 5 cities that match what you're looking for:\n\n` +
          top.map((m, i) =>
            `${i + 1}. **${m.name}** — Score: ${m.matchScore}/100\n` +
            `   💰 $${m.keyMetrics.medianHomeValue?.toLocaleString() ?? 'N/A'} median home | Rent: $${m.keyMetrics.medianRent?.toLocaleString() ?? 'N/A'}/mo\n` +
            `   🌡️ ${m.keyMetrics.daysMaxGt90FAnnual ?? '?'} hot days/yr | ☀️ Sunshine data available\n` +
            `   🏥 Healthcare: ${m.keyMetrics.healthcareAccessScore ?? '?'}/100\n` +
            `   ${m.trace.slice(0, 2).join(' | ')}`
          ).join('\n\n'),
        type: 'city_list' as const,
        cities: top,
        phase: journey.currentPhase,
      };
    }

    // Intent: compare
    if (/compare|vs|versus|difference|better/.test(message)) {
      return {
        role: 'agent' as const,
        content: `I can compare cities side-by-side across 15+ dimensions: cost of living, taxes, climate, crime, healthcare, and more.\n\nWhich cities would you like to compare? For example:\n• "Compare Austin and Denver"\n• "Austin TX vs Nashville TN"`,
        type: 'compare_prompt' as const,
        shortlist: journey.shortlistedLocations,
      };
    }

    // Intent: move timeline / logistics
    if (/timeline|plan|move|moving|checklist|when|schedule/.test(message)) {
      return {
        role: 'agent' as const,
        content: `I'll help you plan your move! I can generate a personalized timeline with tasks from 8 weeks before your move through your first month in the new city.\n\nWhen are you planning to move? (e.g., "September 2026" or "in 3 months")`,
        type: 'timeline_prompt' as const,
        phase: journey.currentPhase,
      };
    }

    // Intent: cost / tax / salary
    if (/cost|tax|salary|money|budget|expensive|afford|income/.test(message)) {
      const cities = journey.shortlistedLocations.length > 0
        ? `\n\nYour shortlisted cities: ${journey.shortlistedLocations.join(', ')}`
        : '\n\nSearch for a city first, then I can give you a detailed cost breakdown.';
      return {
        role: 'agent' as const,
        content: `I can analyze costs across multiple dimensions:\n\n` +
          `• **Cost of Living Index** — How expensive is the city vs national average?\n` +
          `• **Tax Impact** — Income tax, property tax, and overall burden\n` +
          `• **Salary Adjustment** — What salary do you need to maintain your lifestyle?\n` +
          `• **Full Cost Breakdown** — Housing, food, transport, healthcare, utilities\n` +
          cities,
        type: 'cost_prompt' as const,
      };
    }

    // Intent: DMV / admin / license
    if (/dmv|license|registration|vote|voter|insurance|address|paperwork/.test(message)) {
      return {
        role: 'agent' as const,
        content: `I can guide you through the administrative side of moving:\n\n` +
          `• **Driver's License** — State-specific requirements, deadlines, fees\n` +
          `• **Vehicle Registration** — Title transfer, registration deadlines\n` +
          `• **Voter Registration** — Deadlines, online registration, requirements\n` +
          `• **Insurance Changes** — Auto, home/renters, health insurance impact\n` +
          `• **Address Change** — Comprehensive list of who to notify\n\n` +
          `Which state are you moving to?`,
        type: 'admin_prompt' as const,
      };
    }

    // Default: acknowledge and guide
    return {
      role: 'agent' as const,
      content: `I understand you're asking about: "${body.message}"\n\nI can help with finding cities, comparing costs, planning your move, handling paperwork, and settling in. Could you give me a bit more detail about what you need? For example:\n\n• "Find warm cities under $300k homes"\n• "Compare Austin TX and Raleigh NC"\n• "Plan a move for October 2026"\n• "What do I need to register my car in Texas?"`,
      type: 'clarify' as const,
    };
  }

  // ── Move Checklist ──

  /**
   * POST /api/relocation/move-checklist
   * Generate a personalized move checklist from the user's profile and apply
   * it to the specified trip's todo list. Idempotent.
   */
  @Post('move-checklist')
  @UsePipes(new ZodValidationPipe(moveChecklistSchema))
  applyMoveChecklist(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof moveChecklistSchema>,
  ) {
    // ponytail: trip_id FK on todo_items blows up to 500 without this.
    // The canonical pattern in every other controller.
    if (!verifyTripAccess(body.tripId, Number(user.id))) {
      throw new HttpException({ error: 'Trip not found' }, 404);
    }
    return this.relocation.applyMoveChecklist(
      String(user.id),
      body.tripId,
      body.moveDate,
    );
  }

  // ── Career ──

  /** GET /api/relocation/career/economic-indicators/:metro */
  @Get('career/economic-indicators/:metro')
  economicIndicators(@Param('metro') metro: string) {
    const metroName = decodeURIComponent(metro);
    const data = this.career.getEconomicIndicators(metroName);
    if (!data) throw new NotFoundException(`Metro not found: ${metroName}`);
    return data;
  }

  /** GET /api/relocation/career/licensing/:state */
  @Get('career/licensing/:state')
  licensing(@Param('state') state: string) {
    return this.career.getLicensingBoards(state);
  }

  /** GET /api/relocation/career/outlook/:occupation */
  @Get('career/outlook/:occupation')
  outlook(@Param('occupation') occ: string) {
    return this.career.getOccupationOutlook(decodeURIComponent(occ));
  }

  // ── Concierge ──

  /** POST /api/relocation/concierge */
  @Post('concierge')
  @UsePipes(new ZodValidationPipe(conciergeSchema))
  askConcierge(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof conciergeSchema>,
  ) {
    return this.concierge.handleQuery(String(user.id), body.query);
  }

  /** GET /api/relocation/concierge/stats — lane-promotion pipeline data */
  @Get('concierge/stats')
  conciergeStats() {
    return this.concierge.getQueryStats();
  }

  /**
   * Infer scoring weights from natural language.
   */
  private inferWeights(message: string): Record<string, number> {
    const w: Record<string, number> = { cost: 3, climate: 3, safety: 3, healthcare: 3, jobs: 3, outdoors: 3 };
    if (/cheap|afford|budget|inexpensive|low cost/.test(message)) w.cost = 5;
    if (/warm|sunny|hot|sun/.test(message)) { w.climate = 5; w.outdoors = 4; }
    if (/safe|low crime|secure/.test(message)) w.safety = 5;
    if (/hospital|doctor|health|medical/.test(message)) w.healthcare = 5;
    if (/job|career|work|remote|internet|broadband/.test(message)) w.jobs = 5;
    if (/outdoor|hike|nature|mountain|beach/.test(message)) w.outdoors = 5;
    return w;
  }
}
