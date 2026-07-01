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
exports.WeatherController = void 0;
const common_1 = require("@nestjs/common");
const weather_service_1 = require("./weather.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const weatherService_1 = require("../../services/weatherService");
/**
 * /api/weather — first migrated leaf module (the pilot).
 *
 * Behaviour is byte-identical to the legacy Express route (server/src/routes/
 * weather.ts): same paths, query params, status codes and `{ error }` bodies.
 *
 * Parity note: the "X is required" 400s and the 500 fallback messages are bespoke
 * strings, not the generic Zod-pipe envelope, so they are reproduced here exactly
 * rather than derived from the schema. The Zod contract/types live in
 * @memove/shared/weather and are used for typing; `lang` defaults to 'de' only when
 * the param is absent, matching the Express destructuring default.
 */
let WeatherController = class WeatherController {
    weather;
    constructor(weather) {
        this.weather = weather;
    }
    async getWeather(lat, lng, date, lang) {
        if (!lat || !lng) {
            throw new common_1.HttpException({ error: 'Latitude and longitude are required' }, 400);
        }
        try {
            return await this.weather.get(lat, lng, date, lang ?? 'de');
        }
        catch (err) {
            throw toHttp(err, 'Weather error:', 'Error fetching weather data');
        }
    }
    async getDetailed(lat, lng, date, lang) {
        if (!lat || !lng || !date) {
            throw new common_1.HttpException({ error: 'Latitude, longitude, and date are required' }, 400);
        }
        try {
            return await this.weather.getDetailed(lat, lng, date, lang ?? 'de');
        }
        catch (err) {
            throw toHttp(err, 'Detailed weather error:', 'Error fetching detailed weather data');
        }
    }
};
exports.WeatherController = WeatherController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('lat')),
    __param(1, (0, common_1.Query)('lng')),
    __param(2, (0, common_1.Query)('date')),
    __param(3, (0, common_1.Query)('lang')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], WeatherController.prototype, "getWeather", null);
__decorate([
    (0, common_1.Get)('detailed'),
    __param(0, (0, common_1.Query)('lat')),
    __param(1, (0, common_1.Query)('lng')),
    __param(2, (0, common_1.Query)('date')),
    __param(3, (0, common_1.Query)('lang')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], WeatherController.prototype, "getDetailed", null);
exports.WeatherController = WeatherController = __decorate([
    (0, common_1.Controller)('api/weather'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [weather_service_1.WeatherService])
], WeatherController);
/** Maps a thrown error to the same status + `{ error }` body the Express route sent. */
function toHttp(err, logPrefix, fallback) {
    if (err instanceof weatherService_1.ApiError) {
        return new common_1.HttpException({ error: err.message }, err.status);
    }
    console.error(logPrefix, err);
    return new common_1.HttpException({ error: fallback }, 500);
}
