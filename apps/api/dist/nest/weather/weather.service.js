"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherService = void 0;
const common_1 = require("@nestjs/common");
const weatherService_1 = require("../../services/weatherService");
/**
 * Thin Nest wrapper around the existing weather service. It delegates to the
 * exact same `getWeather` / `getDetailedWeather` functions the legacy route and
 * the MCP tools use, so behaviour — including the shared in-memory cache and the
 * Open-Meteo calls — is identical. No logic is duplicated; the upstream service
 * stays the single source of truth (still consumed by the MCP weather tools).
 */
let WeatherService = class WeatherService {
    get(lat, lng, date, lang) {
        return (0, weatherService_1.getWeather)(lat, lng, date, lang);
    }
    getDetailed(lat, lng, date, lang) {
        return (0, weatherService_1.getDetailedWeather)(lat, lng, date, lang);
    }
};
exports.WeatherService = WeatherService;
exports.WeatherService = WeatherService = __decorate([
    (0, common_1.Injectable)()
], WeatherService);
