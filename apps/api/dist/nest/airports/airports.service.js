"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirportsService = void 0;
const common_1 = require("@nestjs/common");
const airportService_1 = require("../../services/airportService");
/**
 * Thin Nest wrapper around the existing airport service. It delegates to the
 * same `searchAirports` / `findByIata` functions the legacy route uses, so the
 * in-memory dataset and lookup behaviour stay identical and unduplicated.
 */
let AirportsService = class AirportsService {
    search(query) {
        return (0, airportService_1.searchAirports)(query);
    }
    findByIata(code) {
        return (0, airportService_1.findByIata)(code);
    }
};
exports.AirportsService = AirportsService;
exports.AirportsService = AirportsService = __decorate([
    (0, common_1.Injectable)()
], AirportsService);
