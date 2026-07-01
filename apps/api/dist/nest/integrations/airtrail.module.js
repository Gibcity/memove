"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirtrailModule = void 0;
const common_1 = require("@nestjs/common");
const airtrail_controller_1 = require("./airtrail.controller");
const airtrail_import_controller_1 = require("./airtrail-import.controller");
/**
 * AirTrail integration domain. The connection lives under
 * /api/integrations/airtrail; the flight import is trip-scoped under
 * /api/trips/:tripId/reservations/import/airtrail. Business logic lives in
 * services/airtrail/* (plain functions over better-sqlite3).
 */
let AirtrailModule = class AirtrailModule {
};
exports.AirtrailModule = AirtrailModule;
exports.AirtrailModule = AirtrailModule = __decorate([
    (0, common_1.Module)({
        controllers: [airtrail_controller_1.AirtrailController, airtrail_import_controller_1.AirtrailImportController],
    })
], AirtrailModule);
