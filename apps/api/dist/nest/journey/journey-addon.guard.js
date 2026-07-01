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
Object.defineProperty(exports, "__esModule", { value: true });
exports.JourneyAddonGuard = void 0;
const common_1 = require("@nestjs/common");
const journey_service_1 = require("./journey.service");
/**
 * Mirrors the legacy `/api/journeys` mount gate: when the Journey addon is
 * disabled the whole route group answers 404, regardless of auth. Declared
 * before the JwtAuthGuard so the addon check wins over the 401, exactly as the
 * Express middleware ordering did.
 */
let JourneyAddonGuard = class JourneyAddonGuard {
    journey;
    constructor(journey) {
        this.journey = journey;
    }
    canActivate() {
        if (!this.journey.journeyAddonEnabled()) {
            throw new common_1.HttpException({ error: 'Journey addon is not enabled' }, 404);
        }
        return true;
    }
};
exports.JourneyAddonGuard = JourneyAddonGuard;
exports.JourneyAddonGuard = JourneyAddonGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [journey_service_1.JourneyService])
], JourneyAddonGuard);
