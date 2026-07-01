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
exports.DaysController = void 0;
const common_1 = require("@nestjs/common");
const days_service_1 = require("./days.service");
const dayService_1 = require("../../services/dayService");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/**
 * /api/trips/:tripId/days — trip itinerary days.
 *
 * Byte-identical to the legacy Express route (server/src/routes/days.ts): trip
 * access (404 "Trip not found"), the 'day_edit' permission on mutations (403),
 * create 201 / rest 200, the bespoke 404 "Day not found", and WebSocket
 * broadcasts with the forwarded X-Socket-Id.
 */
let DaysController = class DaysController {
    days;
    constructor(days) {
        this.days = days;
    }
    requireTrip(tripId, user) {
        const trip = this.days.verifyTripAccess(tripId, user.id);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        return trip;
    }
    requireEdit(trip, user) {
        if (!this.days.canEdit(trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
    }
    list(user, tripId) {
        this.requireTrip(tripId, user);
        return this.days.list(tripId);
    }
    create(user, tripId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        // A `position` means "insert a new empty day here" (which on a dated trip
        // extends the trip and re-pins dates); without it, the legacy append.
        const day = body.position !== undefined
            ? this.days.insert(tripId, body.position)
            : this.days.create(tripId, body.date, body.notes);
        // An insert can shuffle dates/positions of other days, so collaborators
        // refetch the whole list; a plain append only needs the new day.
        const event = body.position !== undefined ? 'day:reordered' : 'day:created';
        this.days.broadcast(tripId, event, { day }, socketId);
        return { day };
    }
    reorder(user, tripId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!Array.isArray(body.orderedIds)) {
            throw new common_1.HttpException({ error: 'orderedIds must be an array' }, 400);
        }
        try {
            this.days.reorder(tripId, body.orderedIds);
        }
        catch (err) {
            if (err instanceof dayService_1.DayReorderError) {
                throw new common_1.HttpException({ error: err.message }, 400);
            }
            throw err;
        }
        this.days.broadcast(tripId, 'day:reordered', { orderedIds: body.orderedIds }, socketId);
        return { success: true };
    }
    update(user, tripId, id, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const current = this.days.getDay(id, tripId);
        if (!current) {
            throw new common_1.HttpException({ error: 'Day not found' }, 404);
        }
        const day = this.days.update(id, current, { notes: body.notes, title: body.title });
        this.days.broadcast(tripId, 'day:updated', { day }, socketId);
        return { day };
    }
    remove(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!this.days.getDay(id, tripId)) {
            throw new common_1.HttpException({ error: 'Day not found' }, 404);
        }
        this.days.remove(id);
        this.days.broadcast(tripId, 'day:deleted', { dayId: Number(id) }, socketId);
        return { success: true };
    }
};
exports.DaysController = DaysController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DaysController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], DaysController.prototype, "create", null);
__decorate([
    (0, common_1.Put)('reorder'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], DaysController.prototype, "reorder", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], DaysController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], DaysController.prototype, "remove", null);
exports.DaysController = DaysController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/days'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [days_service_1.DaysService])
], DaysController);
