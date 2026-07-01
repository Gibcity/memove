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
exports.AirtrailImportController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const zod_validation_pipe_1 = require("../common/zod-validation.pipe");
const airtrail_addon_guard_1 = require("./airtrail-addon.guard");
const shared_1 = require("@memove/shared");
const tripAccess_1 = require("../../services/tripAccess");
const permissions_1 = require("../../services/permissions");
const airtrailImport_1 = require("../../services/airtrail/airtrailImport");
/**
 * POST /api/trips/:tripId/reservations/import/airtrail — turn selected AirTrail
 * flights into reservations. Trip-scoped (reservation_edit) and addon-gated. The
 * flights are re-fetched server-side with the caller's own key.
 */
let AirtrailImportController = class AirtrailImportController {
    requireEdit(tripId, user) {
        const trip = (0, tripAccess_1.verifyTripAccess)(tripId, user.id);
        if (!trip)
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        if (!(0, permissions_1.checkPermission)('reservation_edit', user.role, trip.user_id, user.id, trip.user_id !== user.id)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
    }
    async importAirtrail(user, tripId, body, socketId) {
        this.requireEdit(tripId, user);
        try {
            return await (0, airtrailImport_1.importAirtrailFlights)(tripId, user.id, body.flightIds, socketId);
        }
        catch (err) {
            throw new common_1.HttpException({ error: err?.message || 'AirTrail import failed' }, err?.status === 400 ? 400 : 502);
        }
    }
};
exports.AirtrailImportController = AirtrailImportController;
__decorate([
    (0, common_1.Post)('airtrail'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(shared_1.airtrailImportSchema))),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", Promise)
], AirtrailImportController.prototype, "importAirtrail", null);
exports.AirtrailImportController = AirtrailImportController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/reservations/import'),
    (0, common_1.UseGuards)(airtrail_addon_guard_1.AirtrailAddonGuard, jwt_auth_guard_1.JwtAuthGuard)
], AirtrailImportController);
