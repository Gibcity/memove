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
exports.DayNotesController = void 0;
const common_1 = require("@nestjs/common");
const day_notes_service_1 = require("./day-notes.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
// Runs BEFORE the trip-access check, so an over-long field 400s first. The `time`
// cap matches the shared dayNote schema (max 250) and the note dialog's counter;
// it was 150 here, which rejected valid 151–250 char notes with a confusing error.
const MAX_LENGTHS = { text: 500, time: 250 };
function validateLengths(body) {
    for (const [field, max] of Object.entries(MAX_LENGTHS)) {
        const value = body[field];
        if (value && typeof value === 'string' && value.length > max) {
            throw new common_1.HttpException({ error: `${field} must be ${max} characters or less` }, 400);
        }
    }
}
/**
 * /api/trips/:tripId/days/:dayId/notes — free-text annotations on a day.
 *
 * Byte-identical to the legacy Express route (server/src/routes/dayNotes.ts):
 * the string-length guard runs first (400), then trip access (404), then the
 * 'day_edit' permission (403); create 201 / rest 200; the bespoke "Day not
 * found" / "Note not found" / "Text required" bodies; WebSocket broadcasts with
 * the forwarded X-Socket-Id.
 */
let DayNotesController = class DayNotesController {
    notes;
    constructor(notes) {
        this.notes = notes;
    }
    requireTrip(tripId, user) {
        const trip = this.notes.verifyTripAccess(tripId, user.id);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        return trip;
    }
    requireEdit(trip, user) {
        if (!this.notes.canEdit(trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
    }
    list(user, tripId, dayId) {
        this.requireTrip(tripId, user);
        return { notes: this.notes.list(dayId, tripId) };
    }
    create(user, tripId, dayId, body, socketId) {
        validateLengths(body);
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!this.notes.dayExists(dayId, tripId)) {
            throw new common_1.HttpException({ error: 'Day not found' }, 404);
        }
        if (!body.text?.trim()) {
            throw new common_1.HttpException({ error: 'Text required' }, 400);
        }
        const note = this.notes.create(dayId, tripId, body.text, body.time, body.icon, body.sort_order);
        this.notes.broadcast(tripId, 'dayNote:created', { dayId: Number(dayId), note }, socketId);
        return { note };
    }
    update(user, tripId, dayId, id, body, socketId) {
        validateLengths(body);
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const current = this.notes.getNote(id, dayId, tripId);
        if (!current) {
            throw new common_1.HttpException({ error: 'Note not found' }, 404);
        }
        const note = this.notes.update(id, current, { text: body.text, time: body.time, icon: body.icon, sort_order: body.sort_order });
        this.notes.broadcast(tripId, 'dayNote:updated', { dayId: Number(dayId), note }, socketId);
        return { note };
    }
    remove(user, tripId, dayId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!this.notes.getNote(id, dayId, tripId)) {
            throw new common_1.HttpException({ error: 'Note not found' }, 404);
        }
        this.notes.remove(id);
        this.notes.broadcast(tripId, 'dayNote:deleted', { noteId: Number(id), dayId: Number(dayId) }, socketId);
        return { success: true };
    }
};
exports.DayNotesController = DayNotesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('dayId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], DayNotesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('dayId')),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], DayNotesController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('dayId')),
    __param(3, (0, common_1.Param)('id')),
    __param(4, (0, common_1.Body)()),
    __param(5, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], DayNotesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('dayId')),
    __param(3, (0, common_1.Param)('id')),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", void 0)
], DayNotesController.prototype, "remove", null);
exports.DayNotesController = DayNotesController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/days/:dayId/notes'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [day_notes_service_1.DayNotesService])
], DayNotesController);
