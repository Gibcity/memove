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
exports.AirportsController = void 0;
const common_1 = require("@nestjs/common");
const airports_service_1 = require("./airports.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
/**
 * /api/airports — typeahead search + single lookup by IATA code.
 *
 * Behaviour is byte-identical to the legacy Express route (server/src/routes/
 * airports.ts): both endpoints require auth, an absent/non-string query answers
 * with `[]` (not a 400), and an unknown IATA code 404s with the exact
 * `{ error: 'Airport not found' }` body.
 *
 * The `search` route is declared before `:iata` so the static segment wins over
 * the param, matching the legacy router's registration order.
 */
let AirportsController = class AirportsController {
    airports;
    constructor(airports) {
        this.airports = airports;
    }
    search(q) {
        // Express coerces a missing/array query to '' and returns [] for it.
        const term = typeof q === 'string' ? q : '';
        if (!term)
            return [];
        return this.airports.search(term);
    }
    findByIata(iata) {
        const airport = this.airports.findByIata(iata);
        if (!airport) {
            throw new common_1.HttpException({ error: 'Airport not found' }, 404);
        }
        return airport;
    }
};
exports.AirportsController = AirportsController;
__decorate([
    (0, common_1.Get)('search'),
    __param(0, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Array)
], AirportsController.prototype, "search", null);
__decorate([
    (0, common_1.Get)(':iata'),
    __param(0, (0, common_1.Param)('iata')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], AirportsController.prototype, "findByIata", null);
exports.AirportsController = AirportsController = __decorate([
    (0, common_1.Controller)('api/airports'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [airports_service_1.AirportsService])
], AirportsController);
