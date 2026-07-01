"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DaysModule = void 0;
const common_1 = require("@nestjs/common");
const days_controller_1 = require("./days.controller");
const days_service_1 = require("./days.service");
const day_notes_controller_1 = require("./day-notes.controller");
const day_notes_service_1 = require("./day-notes.service");
/**
 * Days + day-notes domain (S6 — Phase 2 trip sub-domain). The single prefix
 * /api/trips/:tripId/days covers both the days mount and the nested
 * /days/:dayId/notes mount.
 */
let DaysModule = class DaysModule {
};
exports.DaysModule = DaysModule;
exports.DaysModule = DaysModule = __decorate([
    (0, common_1.Module)({
        controllers: [days_controller_1.DaysController, day_notes_controller_1.DayNotesController],
        providers: [days_service_1.DaysService, day_notes_service_1.DayNotesService],
    })
], DaysModule);
