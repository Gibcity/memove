import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import type { User } from '../../types';
import type { ImplicitSignal } from '@memove/shared';
import { RelocationService } from './relocation.service';
import { RelocationJourneyService } from './relocation-journey.service';
import { CareerService } from './career.service';
import { ConciergeService } from './concierge.service';
import { RelocationChatService } from './relocation-chat.service';
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
  minPopulation: numericString.optional(),
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

// ponytail: z.coerce.number() (the idParamSchema pattern) over the local
// numericString transform — a transform infers its key as optional in zod v4,
// and the aggregation needs all four bounds present.
const viewportStatsSchema = z.object({
  north: z.coerce.number().min(-90).max(90),
  south: z.coerce.number().min(-90).max(90),
  east: z.coerce.number().min(-180).max(180),
  west: z.coerce.number().min(-180).max(180),
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
    private readonly chatService: RelocationChatService,
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

  /** GET /api/relocation/stats/viewport — averaged metrics over in-view metros */
  @Get('stats/viewport')
  @UsePipes(new ZodValidationPipe(viewportStatsSchema))
  viewportStats(@Query() query: z.infer<typeof viewportStatsSchema>) {
    return this.relocation.aggregateViewportStats(query);
  }

  // ── Scoring ──

  /** POST /api/relocation/score — rank all locations by weighted preferences */
  @Post('score')
  @UsePipes(new ZodValidationPipe(scoreFiltersSchema))
  score(@CurrentUser() user: User, @Body() body: z.infer<typeof scoreFiltersSchema>) {
    // ponytail: accept `softWeights` (UserProfile field name) as an alias for
    // `weights` so the FE can forward the profile verbatim. The service
    // reads `weights`; we map before delegating.
    if (!body.weights && body.softWeights) {
      body.weights = body.softWeights;
    }
    // ponytail: pass userId so the service can fall back to the user's
    // profile softWeights when filters.weights is absent. Without this,
    // elicited preferences are silently ignored by the scoring engine.
    return this.relocation.scoreLocations(body, String(user.id));
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
   * the first question.  The frontend elicitation flow drives the full
   * 3-question conversation from this starting point.
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

  /** GET /api/relocation/bundle — full offline snapshot of the user's relocation workspace */
  @Get('bundle')
  bundle(@CurrentUser() user: User) {
    return this.relocation.bundle(String(user.id));
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
   * Thin wrapper: delegates to RelocationChatService which calls
   * completeWithTools() (LLM-driven tool-calling agent). The previous
   * regex-keyword chain was extracted to that service on 2026-06-30 (§6 #3).
   */
  @Post('chat')
  @UsePipes(new ZodValidationPipe(chatSchema))
  async chat(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof chatSchema>,
  ) {
    return this.chatService.handle(String(user.id), body.message, body.history);
  }

  /**
   * POST /api/relocation/chat/stream — SSE stream of LLM tokens.
   *
   * Wire format (Server-Sent Events):
   *   data: {"t":"hello"}
   *   data: {"t":" world"}
   *   ...
   *   data: [DONE]
   *
   * Plain LLM only — no tools. Tool-calling flow stays on /chat (non-streaming).
   * Body validation reuses `chatSchema` so the wire shape is identical.
   * ponytail: bare-minimum SSE — no heartbeats, no reconnection hints, no
   * backpressure. Add when a client actually disconnects mid-stream in prod.
   */
  @Post('chat/stream')
  @UsePipes(new ZodValidationPipe(chatSchema))
  async chatStream(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof chatSchema>,
    @Res() res: Response,
  ): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const writeEvent = (payload: unknown): void => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    writeEvent({ t: '' }); // poke the FE into streaming state immediately
    // ponytail: no AbortSignal plumbed — Express's Request type doesn't expose
    // one. If the client disconnects, res.write throws and the loop aborts.
    // Add a manual AbortController wired to req.on('close') if needed.
    try {
      for await (const token of this.chatService.handleStream(
        String(user.id),
        body.message,
        body.history,
      )) {
        if (res.writableEnded) return;
        writeEvent({ t: token });
      }
      res.write('data: [DONE]\n\n');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'stream failed';
      writeEvent({ error: msg });
    } finally {
      res.end();
    }
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

  // ── DSR (GDPR/CCPA) ───────────────────────────────────────────
  // ponytail: synchronous export/delete of every relocation-scoped row
  // for the authenticated user — relocation_user_profile, relocation_journey,
  // and any in-memory elicitation sessions. Relocation lacks Qdrant
  // (search is location-static), so no vector store purge is needed.

  /** GET /api/relocation/dsr/export — full relocation data export for the user */
  @Get('dsr/export')
  exportDsr(@CurrentUser() user: User) {
    const userId = String(user.id);
    return {
      exportedAt: new Date().toISOString(),
      userId,
      ...this.relocation.exportUserData(userId),
      journey: this.journey.exportUserData(Number(user.id)),
    };
  }

  /** DELETE /api/relocation/dsr/delete — purge all relocation data for the user */
  @Delete('dsr/delete')
  deleteDsr(@CurrentUser() user: User) {
    const profile = this.relocation.deleteUserData(String(user.id));
    const journey = this.journey.deleteUserData(Number(user.id));
    return {
      deletedAt: new Date().toISOString(),
      userId: String(user.id),
      ...profile,
      ...journey,
    };
  }
}
