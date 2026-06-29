import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '../../types';
import type { ImplicitSignal } from '@trek/shared';
import { RelocationService, SearchFilters, ScoreFilters } from './relocation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

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
  constructor(private readonly relocation: RelocationService) {}

  // ── Locations ──

  /** GET /api/relocation/locations — lightweight list of all relocation candidates */
  @Get('locations')
  listLocations(@Query() query: SearchFilters) {
    return this.relocation.searchLocations(query);
  }

  /** GET /api/relocation/locations/:id — full location detail */
  @Get('locations/:id')
  getLocation(@Param('id') id: string) {
    return this.relocation.getLocationById(id) ?? { error: 'Not found' };
  }

  // ── Scoring ──

  /** POST /api/relocation/score — rank all locations by weighted preferences */
  @Post('score')
  score(@Body() body: ScoreFilters) {
    return this.relocation.scoreLocations(body);
  }

  /** POST /api/relocation/score/explain — explain why a location scored as it did */
  @Post('score/explain')
  explain(@Body() body: { locationId: string; weights?: Record<string, number> }) {
    return this.relocation.explainScore(body.locationId, body.weights);
  }

  // ── Compare ──

  /** POST /api/relocation/compare — side-by-side comparison of 2+ locations */
  @Post('compare')
  compare(@Body() body: { locationIds: string[]; weights?: Record<string, number> }) {
    return this.relocation.compareLocations(body.locationIds, body.weights);
  }

  // ── Fiscal health ──

  /** POST /api/relocation/fiscal-health — assess the fiscal health of a location's state */
  @Post('fiscal-health')
  fiscalHealth(@Body() body: { locationId: string }) {
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
  updateProfile(@CurrentUser() user: User, @Body() body: Record<string, unknown>) {
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
  respondElicitation(
    @CurrentUser() user: User,
    @Body() body: { sessionId: string; answer: string },
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
  @Post('profile/signal')
  submitSignal(
    @CurrentUser() user: User,
    @Body() body: { signal: ImplicitSignal },
  ) {
    return this.relocation.submitImplicitSignal(String(user.id), body.signal);
  }
}
