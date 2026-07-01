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
exports.UpcomingReservationsController = void 0;
const common_1 = require("@nestjs/common");
const reservations_service_1 = require("./reservations.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/**
 * GET /api/reservations/upcoming — the cross-trip "upcoming reservations" feed
 * (dashboard widget). Byte-identical to the legacy inline handler in
 * server/src/app.ts (authenticate, returns { reservations: [...] }, limit 6).
 *
 * Separate from the trip-scoped ReservationsController
 * (/api/trips/:tripId/reservations) because the base path differs.
 */
let UpcomingReservationsController = class UpcomingReservationsController {
    reservations;
    constructor(reservations) {
        this.reservations = reservations;
    }
    upcoming(user) {
        return { reservations: this.reservations.listUpcoming(user.id) };
    }
};
exports.UpcomingReservationsController = UpcomingReservationsController;
__decorate([
    (0, common_1.Get)('upcoming'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UpcomingReservationsController.prototype, "upcoming", null);
exports.UpcomingReservationsController = UpcomingReservationsController = __decorate([
    (0, common_1.Controller)('api/reservations'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [reservations_service_1.ReservationsService])
], UpcomingReservationsController);
