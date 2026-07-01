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
exports.ReservationsController = void 0;
const common_1 = require("@nestjs/common");
const reservations_service_1 = require("./reservations.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const airtrailSync_1 = require("../../services/airtrail/airtrailSync");
/**
 * /api/trips/:tripId/reservations — trip-scoped bookings.
 *
 * Byte-identical to the legacy Express route (server/src/routes/reservations.ts):
 * trip access (404), 'reservation_edit' permission (403), create 201 / rest 200,
 * the bespoke 400/404 bodies, the accommodation + budget side effects, the
 * booking notifications, and all WebSocket broadcasts with the forwarded
 * X-Socket-Id. /positions is declared before /:id so it wins over the param.
 */
let ReservationsController = class ReservationsController {
    reservations;
    constructor(reservations) {
        this.reservations = reservations;
    }
    requireTrip(tripId, user) {
        const trip = this.reservations.verifyTripAccess(tripId, user.id);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        return trip;
    }
    requireEdit(trip, user) {
        if (!this.reservations.canEdit(trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
    }
    list(user, tripId) {
        this.requireTrip(tripId, user);
        return { reservations: this.reservations.list(tripId) };
    }
    create(user, tripId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!body.title) {
            throw new common_1.HttpException({ error: 'Title is required' }, 400);
        }
        const { reservation, accommodationCreated } = this.reservations.create(tripId, body);
        if (accommodationCreated) {
            this.reservations.broadcast(tripId, 'accommodation:created', {}, socketId);
        }
        this.reservations.syncBudgetOnCreate(tripId, reservation.id, body.title, body.type, body.create_budget_entry, socketId);
        this.reservations.broadcast(tripId, 'reservation:created', { reservation }, socketId);
        this.reservations.notifyBookingChange(tripId, user, body.title, body.type ?? '');
        return { reservation };
    }
    updatePositions(user, tripId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!Array.isArray(body.positions)) {
            throw new common_1.HttpException({ error: 'positions must be an array' }, 400);
        }
        this.reservations.updatePositions(tripId, body.positions, body.day_id);
        this.reservations.broadcast(tripId, 'reservation:positions', { positions: body.positions, day_id: body.day_id }, socketId);
        return { success: true };
    }
    update(user, tripId, id, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const current = this.reservations.getReservation(id, tripId);
        if (!current) {
            throw new common_1.HttpException({ error: 'Reservation not found' }, 404);
        }
        const { reservation, accommodationChanged } = this.reservations.update(id, tripId, body, current);
        if (accommodationChanged) {
            this.reservations.broadcast(tripId, 'accommodation:updated', {}, socketId);
        }
        const cur = current;
        this.reservations.syncBudgetOnUpdate(tripId, id, body.title ?? '', body.type, cur.title, cur.type, body.create_budget_entry, socketId);
        this.reservations.broadcast(tripId, 'reservation:updated', { reservation }, socketId);
        // Push a locally-edited AirTrail flight back to AirTrail (fire-and-forget,
        // under the importer's credentials — see airtrailSync). #214
        if (reservation?.external_source === 'airtrail' && reservation?.sync_enabled) {
            void (0, airtrailSync_1.pushReservationToAirtrail)(Number(reservation.id), Number(tripId)).catch(() => { });
        }
        this.reservations.notifyBookingChange(tripId, user, body.title || cur.title, body.type || cur.type || '');
        return { reservation };
    }
    remove(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const { deleted, accommodationDeleted, deletedBudgetItemId } = this.reservations.remove(id, tripId);
        if (!deleted) {
            throw new common_1.HttpException({ error: 'Reservation not found' }, 404);
        }
        if (accommodationDeleted) {
            this.reservations.broadcast(tripId, 'accommodation:deleted', { accommodationId: deleted.accommodation_id }, socketId);
        }
        if (deletedBudgetItemId) {
            this.reservations.broadcast(tripId, 'budget:deleted', { itemId: deletedBudgetItemId }, socketId);
        }
        this.reservations.broadcast(tripId, 'reservation:deleted', { reservationId: Number(id) }, socketId);
        this.reservations.notifyBookingChange(tripId, user, deleted.title, deleted.type || '');
        return { success: true };
    }
};
exports.ReservationsController = ReservationsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ReservationsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], ReservationsController.prototype, "create", null);
__decorate([
    (0, common_1.Put)('positions'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], ReservationsController.prototype, "updatePositions", null);
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
], ReservationsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], ReservationsController.prototype, "remove", null);
exports.ReservationsController = ReservationsController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/reservations'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [reservations_service_1.ReservationsService])
], ReservationsController);
