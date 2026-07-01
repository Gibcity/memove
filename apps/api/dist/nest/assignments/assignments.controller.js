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
exports.AssignmentOpsController = exports.DayAssignmentsController = void 0;
const common_1 = require("@nestjs/common");
const assignments_service_1 = require("./assignments.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/** Shared trip-access guard (mirrors requireTripAccess → 404 "Trip not found"). */
function requireTrip(svc, tripId, user) {
    const trip = svc.verifyTripAccess(tripId, user.id);
    if (!trip) {
        throw new common_1.HttpException({ error: 'Trip not found' }, 404);
    }
    return trip;
}
function requireEdit(svc, trip, user) {
    if (!svc.canEdit(trip, user)) {
        throw new common_1.HttpException({ error: 'No permission' }, 403);
    }
}
/**
 * /api/trips/:tripId/days/:dayId/assignments — the day's ordered itinerary items.
 *
 * Byte-identical to the legacy Express route (server/src/routes/assignments.ts):
 * trip access (404), 'day_edit' on mutations (403, GET is access-only), create
 * 201 / rest 200, the bespoke "Day not found" / "Place not found" / "Assignment
 * not found" bodies, the journey place-created hook, and WebSocket broadcasts.
 */
let DayAssignmentsController = class DayAssignmentsController {
    assignments;
    constructor(assignments) {
        this.assignments = assignments;
    }
    list(user, tripId, dayId) {
        requireTrip(this.assignments, tripId, user);
        if (!this.assignments.dayExists(dayId, tripId)) {
            throw new common_1.HttpException({ error: 'Day not found' }, 404);
        }
        return { assignments: this.assignments.listDayAssignments(dayId) };
    }
    create(user, tripId, dayId, body, socketId) {
        const trip = requireTrip(this.assignments, tripId, user);
        requireEdit(this.assignments, trip, user);
        if (!this.assignments.dayExists(dayId, tripId)) {
            throw new common_1.HttpException({ error: 'Day not found' }, 404);
        }
        if (!this.assignments.placeExists(body.place_id, tripId)) {
            throw new common_1.HttpException({ error: 'Place not found' }, 404);
        }
        const assignment = this.assignments.createAssignment(dayId, body.place_id, body.notes);
        this.assignments.broadcast(tripId, 'assignment:created', { assignment }, socketId);
        this.assignments.notifyPlaceCreated(tripId, body.place_id);
        return { assignment };
    }
    reorder(user, tripId, dayId, orderedIds, socketId) {
        const trip = requireTrip(this.assignments, tripId, user);
        requireEdit(this.assignments, trip, user);
        if (!this.assignments.dayExists(dayId, tripId)) {
            throw new common_1.HttpException({ error: 'Day not found' }, 404);
        }
        this.assignments.reorderAssignments(dayId, orderedIds);
        this.assignments.broadcast(tripId, 'assignment:reordered', { dayId: Number(dayId), orderedIds }, socketId);
        return { success: true };
    }
    remove(user, tripId, dayId, id, socketId) {
        const trip = requireTrip(this.assignments, tripId, user);
        requireEdit(this.assignments, trip, user);
        if (!this.assignments.assignmentExistsInDay(id, dayId, tripId)) {
            throw new common_1.HttpException({ error: 'Assignment not found' }, 404);
        }
        this.assignments.deleteAssignment(id);
        this.assignments.broadcast(tripId, 'assignment:deleted', { assignmentId: Number(id), dayId: Number(dayId) }, socketId);
        return { success: true };
    }
};
exports.DayAssignmentsController = DayAssignmentsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('dayId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], DayAssignmentsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('dayId')),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], DayAssignmentsController.prototype, "create", null);
__decorate([
    (0, common_1.Put)('reorder'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('dayId')),
    __param(3, (0, common_1.Body)('orderedIds')),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Array, String]),
    __metadata("design:returntype", void 0)
], DayAssignmentsController.prototype, "reorder", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('dayId')),
    __param(3, (0, common_1.Param)('id')),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", void 0)
], DayAssignmentsController.prototype, "remove", null);
exports.DayAssignmentsController = DayAssignmentsController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/days/:dayId/assignments'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [assignments_service_1.AssignmentsService])
], DayAssignmentsController);
/**
 * /api/trips/:tripId/assignments/:id/* — per-assignment ops (move, time,
 * participants), independent of the day path. Same parity rules as above.
 */
let AssignmentOpsController = class AssignmentOpsController {
    assignments;
    constructor(assignments) {
        this.assignments = assignments;
    }
    move(user, tripId, id, body, socketId) {
        const trip = requireTrip(this.assignments, tripId, user);
        requireEdit(this.assignments, trip, user);
        const existing = this.assignments.getAssignmentForTrip(id, tripId);
        if (!existing) {
            throw new common_1.HttpException({ error: 'Assignment not found' }, 404);
        }
        if (!this.assignments.dayExists(String(body.new_day_id), tripId)) {
            throw new common_1.HttpException({ error: 'Target day not found' }, 404);
        }
        const oldDayId = existing.day_id;
        const { assignment } = this.assignments.moveAssignment(id, body.new_day_id, body.order_index, oldDayId);
        this.assignments.broadcast(tripId, 'assignment:moved', { assignment, oldDayId: Number(oldDayId), newDayId: Number(body.new_day_id) }, socketId);
        return { assignment };
    }
    participants(user, tripId, id) {
        requireTrip(this.assignments, tripId, user);
        return { participants: this.assignments.getParticipants(id) };
    }
    time(user, tripId, id, body, socketId) {
        const trip = requireTrip(this.assignments, tripId, user);
        requireEdit(this.assignments, trip, user);
        if (!this.assignments.getAssignmentForTrip(id, tripId)) {
            throw new common_1.HttpException({ error: 'Assignment not found' }, 404);
        }
        const assignment = this.assignments.updateTime(id, body.place_time, body.end_time);
        this.assignments.broadcast(tripId, 'assignment:updated', { assignment }, socketId);
        return { assignment };
    }
    setParticipants(user, tripId, id, userIds, socketId) {
        const trip = requireTrip(this.assignments, tripId, user);
        requireEdit(this.assignments, trip, user);
        if (!Array.isArray(userIds)) {
            throw new common_1.HttpException({ error: 'user_ids must be an array' }, 400);
        }
        const participants = this.assignments.setParticipants(id, userIds);
        this.assignments.broadcast(tripId, 'assignment:participants', { assignmentId: Number(id), participants }, socketId);
        return { participants };
    }
};
exports.AssignmentOpsController = AssignmentOpsController;
__decorate([
    (0, common_1.Put)(':id/move'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], AssignmentOpsController.prototype, "move", null);
__decorate([
    (0, common_1.Get)(':id/participants'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], AssignmentOpsController.prototype, "participants", null);
__decorate([
    (0, common_1.Put)(':id/time'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], AssignmentOpsController.prototype, "time", null);
__decorate([
    (0, common_1.Put)(':id/participants'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)('user_ids')),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], AssignmentOpsController.prototype, "setParticipants", null);
exports.AssignmentOpsController = AssignmentOpsController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/assignments'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [assignments_service_1.AssignmentsService])
], AssignmentOpsController);
