"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelocationController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const relocation_service_1 = require("./relocation.service");
const relocation_journey_service_1 = require("./relocation-journey.service");
const career_service_1 = require("./career.service");
const concierge_service_1 = require("./concierge.service");
const relocation_chat_service_1 = require("./relocation-chat.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const zod_validation_pipe_1 = require("../common/zod-validation.pipe");
const tripAccess_1 = require("../../services/tripAccess");
// ── Local Zod schemas (request shapes) ─────────────────────────────────────
//
// SearchFilters/ScoreFilters are consumed by the service's TS interfaces, but a
// request body / query string still needs runtime validation — a query with
// maxHomeValue="fivehundred" would otherwise sail through and break later.
// Define the wire schemas here; if they grow, hoist them to @memove/shared.
const numericString = zod_1.z
    .union([zod_1.z.string(), zod_1.z.number()])
    .transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'expected a number' });
        return zod_1.z.NEVER;
    }
    return n;
});
// Wire-level convention: comma-separated strings OR repeated keys both arrive
// as `string | string[]` on @Query(). Split to an array to satisfy the
// service's strict `string[]` interfaces.
const csv = (v) => {
    if (v === undefined || v === null || v === '')
        return undefined;
    const arr = Array.isArray(v) ? v : String(v).split(',');
    const out = arr.map((s) => String(s).trim()).filter(Boolean);
    return out.length ? out : undefined;
};
const searchFiltersSchema = zod_1.z.object({
    states: zod_1.z
        .union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())])
        .optional()
        .transform((v) => csv(v)),
    excludeStates: zod_1.z
        .union([zod_1.z.string(), zod_1.z.array(zod_1.z.string())])
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
    nameContains: zod_1.z.string().optional(),
    minPopulation: numericString.optional(),
    limit: numericString.optional(),
});
const scoreFiltersSchema = searchFiltersSchema.extend({
    // ponytail: shared schema (relocation.schema.ts) advertises `topK`; honor
    // it here so the FE contract matches what the service reads. Falls back
    // to `limit` from searchFiltersSchema, then to the service default (1000).
    topK: zod_1.z.number().int().positive().optional(),
    weights: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).optional(),
    // ponytail: UserProfile uses `softWeights` (see shared/relocation.schema.ts);
    // accept it here so the FE can pass the profile object through unchanged.
    // Service prefers `weights` when both are present.
    softWeights: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).optional(),
    filters: zod_1.z.record(zod_1.z.string(), zod_1.z.object({ min: zod_1.z.number().optional(), max: zod_1.z.number().optional() })).optional(),
});
const idBodySchema = zod_1.z.object({ locationId: zod_1.z.string().min(1) });
const idArrayBodySchema = zod_1.z.object({
    locationIds: zod_1.z.array(zod_1.z.string().min(1)).min(2, 'Need at least 2 location IDs'),
    weights: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).optional(),
});
const explainBodySchema = zod_1.z.object({
    locationId: zod_1.z.string().min(1),
    weights: zod_1.z.record(zod_1.z.string(), zod_1.z.number()).optional(),
});
const elicitRespondSchema = zod_1.z.object({
    sessionId: zod_1.z.string().min(1),
    answer: zod_1.z.string(),
});
const signalBodySchema = zod_1.z.object({ signal: zod_1.z.unknown() });
const shortlistBodySchema = zod_1.z.object({ locationId: zod_1.z.string().min(1) });
const eliminateBodySchema = zod_1.z.object({
    locationId: zod_1.z.string().min(1),
    reason: zod_1.z.string().optional(),
});
const toggleTaskSchema = zod_1.z.object({ taskId: zod_1.z.string().min(1) });
const setPhaseSchema = zod_1.z.object({ phase: zod_1.z.string().min(1) });
const moveChecklistSchema = zod_1.z.object({
    tripId: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]),
    moveDate: zod_1.z.string().min(1),
});
// ponytail: z.coerce.number() (the idParamSchema pattern) over the local
// numericString transform — a transform infers its key as optional in zod v4,
// and the aggregation needs all four bounds present.
const viewportStatsSchema = zod_1.z.object({
    north: zod_1.z.coerce.number().min(-90).max(90),
    south: zod_1.z.coerce.number().min(-90).max(90),
    east: zod_1.z.coerce.number().min(-180).max(180),
    west: zod_1.z.coerce.number().min(-180).max(180),
});
const chatSchema = zod_1.z.object({
    message: zod_1.z.string().min(1).max(2000),
    history: zod_1.z
        .array(zod_1.z.object({ role: zod_1.z.string(), content: zod_1.z.string() }))
        .optional(),
});
const conciergeSchema = zod_1.z.object({ query: zod_1.z.string().min(1) });
const profileUpdateSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown());
const prefsUpdateSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.unknown());
/**
 * /api/relocation — relocation discovery endpoints.
 *
 * Convention matches the existing Nest controllers: JWT-guarded, user-scoped,
 * returns plain JSON objects. Follows the isAddonEnabled(ADDON_IDS.RELOCATION)
 * gating pattern (client-side check).
 */
let RelocationController = class RelocationController {
    relocation;
    journey;
    career;
    concierge;
    chatService;
    constructor(relocation, journey, career, concierge, chatService) {
        this.relocation = relocation;
        this.journey = journey;
        this.career = career;
        this.concierge = concierge;
        this.chatService = chatService;
    }
    // ── Locations ──
    /** GET /api/relocation/locations — lightweight list of all relocation candidates */
    listLocations(query) {
        return this.relocation.searchLocations(query);
    }
    /** GET /api/relocation/locations/:id — full location detail */
    getLocation(id) {
        const loc = this.relocation.getLocationById(id);
        if (!loc)
            throw new common_1.NotFoundException(`Location not found: ${id}`);
        return loc;
    }
    /** GET /api/relocation/stats/viewport — averaged metrics over in-view metros */
    viewportStats(query) {
        return this.relocation.aggregateViewportStats(query);
    }
    // ── Scoring ──
    /** POST /api/relocation/score — rank all locations by weighted preferences */
    score(user, body) {
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
    explain(body) {
        return this.relocation.explainScore(body.locationId, body.weights);
    }
    // ── Compare ──
    /** POST /api/relocation/compare — side-by-side comparison of 2+ locations */
    compare(body) {
        const result = this.relocation.compareLocations(body.locationIds, body.weights);
        if ('error' in result)
            throw new common_1.BadRequestException(result.error);
        return result;
    }
    // ── Fiscal health ──
    /** POST /api/relocation/fiscal-health — assess the fiscal health of a location's state */
    fiscalHealth(body) {
        return this.relocation.fiscalHealth(body.locationId);
    }
    // ── Profile ──
    /** GET /api/relocation/profile — current user's relocation profile */
    getProfile(user) {
        return this.relocation.getUserProfile(String(user.id));
    }
    /** POST /api/relocation/profile — update user's relocation profile */
    updateProfile(user, body) {
        return this.relocation.upsertUserProfile(String(user.id), body);
    }
    // ── Elicitation (preference-learning loop) ────────────────────────
    /**
     * POST /api/relocation/profile/elicitation/start
     *
     * Begin a new elicitation round.  Returns the session identifier and
     * the first question.  The frontend elicitation flow drives the full
     * 3-question conversation from this starting point.
     */
    startElicitation(user) {
        return this.relocation.startElicitation(String(user.id));
    }
    /**
     * POST /api/relocation/profile/elicitation/respond
     *
     * Answer a question in an active elicitation session.  Returns either
     * the next question or signals completion with a profileSnapshot.
     */
    respondElicitation(user, body) {
        return this.relocation.respondToElicitation(String(user.id), body.sessionId, body.answer);
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
    submitSignal(user, body) {
        return this.relocation.submitImplicitSignal(String(user.id), body.signal);
    }
    // ── Journey state (persistent relocation workspace) ─────────────
    /** GET /api/relocation/journey — current user's relocation journey */
    getJourney(user) {
        return this.journey.getJourney(Number(user.id));
    }
    /** GET /api/relocation/bundle — full offline snapshot of the user's relocation workspace */
    bundle(user) {
        return this.relocation.bundle(String(user.id));
    }
    /** POST /api/relocation/journey/shortlist — add location to shortlist */
    shortlist(user, body) {
        return this.journey.shortlistLocation(Number(user.id), body.locationId);
    }
    /** POST /api/relocation/journey/eliminate — remove from shortlist */
    eliminate(user, body) {
        return this.journey.eliminateLocation(Number(user.id), body.locationId, body.reason);
    }
    /** POST /api/relocation/journey/preferences — update preferences */
    updatePrefs(user, body) {
        return this.journey.updatePreferences(Number(user.id), body);
    }
    /** POST /api/relocation/journey/toggle-task — toggle task completion */
    toggleTask(user, body) {
        return this.journey.toggleTask(Number(user.id), body.taskId);
    }
    /** POST /api/relocation/journey/phase — set current phase */
    setPhase(user, body) {
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
    async chat(user, body) {
        return this.chatService.handle(String(user.id), body.message, body.history);
    }
    // ── Move Checklist ──
    /**
     * POST /api/relocation/move-checklist
     * Generate a personalized move checklist from the user's profile and apply
     * it to the specified trip's todo list. Idempotent.
     */
    applyMoveChecklist(user, body) {
        // ponytail: trip_id FK on todo_items blows up to 500 without this.
        // The canonical pattern in every other controller.
        if (!(0, tripAccess_1.verifyTripAccess)(body.tripId, Number(user.id))) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        return this.relocation.applyMoveChecklist(String(user.id), body.tripId, body.moveDate);
    }
    // ── Career ──
    /** GET /api/relocation/career/economic-indicators/:metro */
    economicIndicators(metro) {
        const metroName = decodeURIComponent(metro);
        const data = this.career.getEconomicIndicators(metroName);
        if (!data)
            throw new common_1.NotFoundException(`Metro not found: ${metroName}`);
        return data;
    }
    /** GET /api/relocation/career/licensing/:state */
    licensing(state) {
        return this.career.getLicensingBoards(state);
    }
    /** GET /api/relocation/career/outlook/:occupation */
    outlook(occ) {
        return this.career.getOccupationOutlook(decodeURIComponent(occ));
    }
    // ── Concierge ──
    /** POST /api/relocation/concierge */
    askConcierge(user, body) {
        return this.concierge.handleQuery(String(user.id), body.query);
    }
    /** GET /api/relocation/concierge/stats — lane-promotion pipeline data */
    conciergeStats() {
        return this.concierge.getQueryStats();
    }
    // ── DSR (GDPR/CCPA) ───────────────────────────────────────────
    // ponytail: synchronous export/delete of every relocation-scoped row
    // for the authenticated user — relocation_user_profile, relocation_journey,
    // and any in-memory elicitation sessions. Relocation lacks Qdrant
    // (search is location-static), so no vector store purge is needed.
    /** GET /api/relocation/dsr/export — full relocation data export for the user */
    exportDsr(user) {
        const userId = String(user.id);
        return {
            exportedAt: new Date().toISOString(),
            userId,
            ...this.relocation.exportUserData(userId),
            journey: this.journey.exportUserData(Number(user.id)),
        };
    }
    /** DELETE /api/relocation/dsr/delete — purge all relocation data for the user */
    deleteDsr(user) {
        const profile = this.relocation.deleteUserData(String(user.id));
        const journey = this.journey.deleteUserData(Number(user.id));
        return {
            deletedAt: new Date().toISOString(),
            userId: String(user.id),
            ...profile,
            ...journey,
        };
    }
};
exports.RelocationController = RelocationController;
__decorate([
    (0, common_1.Get)('locations'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(searchFiltersSchema)),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "listLocations", null);
__decorate([
    (0, common_1.Get)('locations/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "getLocation", null);
__decorate([
    (0, common_1.Get)('stats/viewport'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(viewportStatsSchema)),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "viewportStats", null);
__decorate([
    (0, common_1.Post)('score'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(scoreFiltersSchema)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "score", null);
__decorate([
    (0, common_1.Post)('score/explain'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(explainBodySchema)),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "explain", null);
__decorate([
    (0, common_1.Post)('compare'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(idArrayBodySchema)),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "compare", null);
__decorate([
    (0, common_1.Post)('fiscal-health'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(idBodySchema)),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "fiscalHealth", null);
__decorate([
    (0, common_1.Get)('profile'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Post)('profile'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(profileUpdateSchema)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Post)('profile/elicitation/start'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "startElicitation", null);
__decorate([
    (0, common_1.Post)('profile/elicitation/respond'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(elicitRespondSchema)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "respondElicitation", null);
__decorate([
    (0, common_1.Post)('profile/signal'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(signalBodySchema)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "submitSignal", null);
__decorate([
    (0, common_1.Get)('journey'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "getJourney", null);
__decorate([
    (0, common_1.Get)('bundle'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "bundle", null);
__decorate([
    (0, common_1.Post)('journey/shortlist'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(shortlistBodySchema)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "shortlist", null);
__decorate([
    (0, common_1.Post)('journey/eliminate'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(eliminateBodySchema)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "eliminate", null);
__decorate([
    (0, common_1.Post)('journey/preferences'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(prefsUpdateSchema)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "updatePrefs", null);
__decorate([
    (0, common_1.Post)('journey/toggle-task'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(toggleTaskSchema)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "toggleTask", null);
__decorate([
    (0, common_1.Post)('journey/phase'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(setPhaseSchema)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "setPhase", null);
__decorate([
    (0, common_1.Post)('chat'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(chatSchema)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], RelocationController.prototype, "chat", null);
__decorate([
    (0, common_1.Post)('move-checklist'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(moveChecklistSchema)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "applyMoveChecklist", null);
__decorate([
    (0, common_1.Get)('career/economic-indicators/:metro'),
    __param(0, (0, common_1.Param)('metro')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "economicIndicators", null);
__decorate([
    (0, common_1.Get)('career/licensing/:state'),
    __param(0, (0, common_1.Param)('state')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "licensing", null);
__decorate([
    (0, common_1.Get)('career/outlook/:occupation'),
    __param(0, (0, common_1.Param)('occupation')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "outlook", null);
__decorate([
    (0, common_1.Post)('concierge'),
    (0, common_1.UsePipes)(new zod_validation_pipe_1.ZodValidationPipe(conciergeSchema)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "askConcierge", null);
__decorate([
    (0, common_1.Get)('concierge/stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "conciergeStats", null);
__decorate([
    (0, common_1.Get)('dsr/export'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "exportDsr", null);
__decorate([
    (0, common_1.Delete)('dsr/delete'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RelocationController.prototype, "deleteDsr", null);
exports.RelocationController = RelocationController = __decorate([
    (0, common_1.Controller)('api/relocation'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [relocation_service_1.RelocationService,
        relocation_journey_service_1.RelocationJourneyService,
        career_service_1.CareerService,
        concierge_service_1.ConciergeService,
        relocation_chat_service_1.RelocationChatService])
], RelocationController);
