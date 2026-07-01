"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssignmentsModule = void 0;
const common_1 = require("@nestjs/common");
const assignments_controller_1 = require("./assignments.controller");
const assignments_service_1 = require("./assignments.service");
/**
 * Assignments domain (S7 — Phase 2 trip sub-domain). The day-assignments mount
 * sits under the /api/trips/:tripId/days prefix (S6); the per-assignment ops use
 * the /api/trips/:tripId/assignments prefix.
 */
let AssignmentsModule = class AssignmentsModule {
};
exports.AssignmentsModule = AssignmentsModule;
exports.AssignmentsModule = AssignmentsModule = __decorate([
    (0, common_1.Module)({
        controllers: [assignments_controller_1.DayAssignmentsController, assignments_controller_1.AssignmentOpsController],
        providers: [assignments_service_1.AssignmentsService],
    })
], AssignmentsModule);
