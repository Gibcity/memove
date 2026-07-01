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
exports.AccommodationsController = void 0;
const common_1 = require("@nestjs/common");
const accommodations_service_1 = require("./accommodations.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/**
 * /api/trips/:tripId/accommodations — trip-scoped lodging blocks.
 *
 * Byte-identical to the legacy accommodations sub-router (server/src/routes/
 * days.ts): trip access (404 "Trip not found"), the 'day_edit' permission on
 * mutations (403), the bespoke 400 (missing refs) and 404 (validateRefs / not
 * found) bodies, create 201 / rest 200, and the cascade broadcasts (a created
 * accommodation also emits reservation:created; a delete emits the linked
 * reservation/budget deletions) with the forwarded X-Socket-Id.
 */
let AccommodationsController = class AccommodationsController {
    accommodations;
    constructor(accommodations) {
        this.accommodations = accommodations;
    }
    requireTrip(tripId, user) {
        const trip = this.accommodations.verifyTripAccess(tripId, user.id);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        return trip;
    }
    requireEdit(trip, user) {
        if (!this.accommodations.canEdit(trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
    }
    list(user, tripId) {
        this.requireTrip(tripId, user);
        return { accommodations: this.accommodations.list(tripId) };
    }
    create(user, tripId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const { place_id, start_day_id, end_day_id, check_in, check_in_end, check_out, confirmation, notes } = body;
        if (!place_id || !start_day_id || !end_day_id) {
            throw new common_1.HttpException({ error: 'place_id, start_day_id, and end_day_id are required' }, 400);
        }
        const errors = this.accommodations.validateRefs(tripId, place_id, start_day_id, end_day_id);
        if (errors.length > 0) {
            throw new common_1.HttpException({ error: errors[0].message }, 404);
        }
        const accommodation = this.accommodations.create(tripId, { place_id, start_day_id, end_day_id, check_in, check_in_end, check_out, confirmation, notes });
        this.accommodations.broadcast(tripId, 'accommodation:created', { accommodation }, socketId);
        this.accommodations.broadcast(tripId, 'reservation:created', {}, socketId);
        return { accommodation };
    }
    update(user, tripId, id, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const existing = this.accommodations.get(id, tripId);
        if (!existing) {
            throw new common_1.HttpException({ error: 'Accommodation not found' }, 404);
        }
        const { place_id, start_day_id, end_day_id, check_in, check_in_end, check_out, confirmation, notes } = body;
        const errors = this.accommodations.validateRefs(tripId, place_id, start_day_id, end_day_id);
        if (errors.length > 0) {
            throw new common_1.HttpException({ error: errors[0].message }, 404);
        }
        const accommodation = this.accommodations.update(id, existing, { place_id, start_day_id, end_day_id, check_in, check_in_end, check_out, confirmation, notes });
        this.accommodations.broadcast(tripId, 'accommodation:updated', { accommodation }, socketId);
        return { accommodation };
    }
    remove(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!this.accommodations.get(id, tripId)) {
            throw new common_1.HttpException({ error: 'Accommodation not found' }, 404);
        }
        const { linkedReservationId, deletedBudgetItemId } = this.accommodations.remove(id);
        if (linkedReservationId) {
            this.accommodations.broadcast(tripId, 'reservation:deleted', { reservationId: linkedReservationId }, socketId);
        }
        if (deletedBudgetItemId) {
            this.accommodations.broadcast(tripId, 'budget:deleted', { itemId: deletedBudgetItemId }, socketId);
        }
        this.accommodations.broadcast(tripId, 'accommodation:deleted', { accommodationId: Number(id) }, socketId);
        return { success: true };
    }
};
exports.AccommodationsController = AccommodationsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AccommodationsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], AccommodationsController.prototype, "create", null);
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
], AccommodationsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], AccommodationsController.prototype, "remove", null);
exports.AccommodationsController = AccommodationsController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/accommodations'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [accommodations_service_1.AccommodationsService])
], AccommodationsController);
