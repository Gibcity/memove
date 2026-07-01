"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReservationsModule = void 0;
const common_1 = require("@nestjs/common");
const reservations_controller_1 = require("./reservations.controller");
const reservations_service_1 = require("./reservations.service");
const accommodations_controller_1 = require("./accommodations.controller");
const accommodations_service_1 = require("./accommodations.service");
const upcoming_reservations_controller_1 = require("./upcoming-reservations.controller");
/**
 * Reservations + accommodations domain (S5 — Phase 2 trip sub-domain).
 * Mounts: /api/trips/:tripId/reservations, /accommodations, and the cross-trip
 * /api/reservations/upcoming dashboard feed.
 */
let ReservationsModule = class ReservationsModule {
};
exports.ReservationsModule = ReservationsModule;
exports.ReservationsModule = ReservationsModule = __decorate([
    (0, common_1.Module)({
        controllers: [reservations_controller_1.ReservationsController, accommodations_controller_1.AccommodationsController, upcoming_reservations_controller_1.UpcomingReservationsController],
        providers: [reservations_service_1.ReservationsService, accommodations_service_1.AccommodationsService],
    })
], ReservationsModule);
