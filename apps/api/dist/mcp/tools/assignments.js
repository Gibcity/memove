"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAssignmentTools = registerAssignmentTools;
const zod_1 = require("zod");
const database_1 = require("../../db/database");
const authService_1 = require("../../services/authService");
const assignmentService_1 = require("../../services/assignmentService");
const dayService_1 = require("../../services/dayService");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
function registerAssignmentTools(server, userId, scopes) {
    const R = (0, scopes_1.canRead)(scopes, 'places');
    const W = (0, scopes_1.canWrite)(scopes, 'places');
    // --- ASSIGNMENTS ---
    if (W)
        server.registerTool('assign_place_to_day', {
            description: 'Assign a place to a specific day in a trip.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                dayId: zod_1.z.number().int().positive(),
                placeId: zod_1.z.number().int().positive(),
                notes: zod_1.z.string().max(500).optional(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, dayId, placeId, notes }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            if (!(0, assignmentService_1.dayExists)(dayId, tripId))
                return { content: [{ type: 'text', text: 'Day not found.' }], isError: true };
            if (!(0, assignmentService_1.placeExists)(placeId, tripId))
                return { content: [{ type: 'text', text: 'Place not found.' }], isError: true };
            const assignment = (0, assignmentService_1.createAssignment)(dayId, placeId, notes || null);
            (0, _shared_1.safeBroadcast)(tripId, 'assignment:created', { assignment });
            return (0, _shared_1.ok)({ assignment });
        });
    if (W)
        server.registerTool('unassign_place', {
            description: 'Remove a place assignment from a day.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                dayId: zod_1.z.number().int().positive(),
                assignmentId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ tripId, dayId, assignmentId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            if (!(0, assignmentService_1.assignmentExistsInDay)(assignmentId, dayId, tripId))
                return { content: [{ type: 'text', text: 'Assignment not found.' }], isError: true };
            (0, assignmentService_1.deleteAssignment)(assignmentId);
            (0, _shared_1.safeBroadcast)(tripId, 'assignment:deleted', { assignmentId, dayId });
            return (0, _shared_1.ok)({ success: true });
        });
    if (W)
        server.registerTool('update_assignment_time', {
            description: 'Set the start and/or end time for a place assignment on a day (e.g. "09:00", "11:30"). Pass null to clear a time.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                assignmentId: zod_1.z.number().int().positive(),
                place_time: zod_1.z.string().max(50).nullable().optional().describe('Start time (e.g. "09:00"), or null to clear'),
                end_time: zod_1.z.string().max(50).nullable().optional().describe('End time (e.g. "11:00"), or null to clear'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, assignmentId, place_time, end_time }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const existing = (0, assignmentService_1.getAssignmentForTrip)(assignmentId, tripId);
            if (!existing)
                return { content: [{ type: 'text', text: 'Assignment not found.' }], isError: true };
            const assignment = (0, assignmentService_1.updateTime)(assignmentId, place_time !== undefined ? place_time : existing.assignment_time, end_time !== undefined ? end_time : existing.assignment_end_time);
            (0, _shared_1.safeBroadcast)(tripId, 'assignment:updated', { assignment });
            return (0, _shared_1.ok)({ assignment });
        });
    if (W)
        server.registerTool('move_assignment', {
            description: 'Move a place assignment to a different day.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                assignmentId: zod_1.z.number().int().positive(),
                newDayId: zod_1.z.number().int().positive(),
                oldDayId: zod_1.z.number().int().positive(),
                orderIndex: zod_1.z.number().int().min(0).optional().default(0),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, assignmentId, newDayId, oldDayId, orderIndex }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            if (!(0, assignmentService_1.getAssignmentForTrip)(assignmentId, tripId))
                return { content: [{ type: 'text', text: 'Assignment not found.' }], isError: true };
            if (!(0, dayService_1.getDay)(newDayId, tripId))
                return { content: [{ type: 'text', text: 'Day not found.' }], isError: true };
            const result = (0, assignmentService_1.moveAssignment)(assignmentId, newDayId, orderIndex ?? 0, oldDayId);
            (0, _shared_1.safeBroadcast)(tripId, 'assignment:moved', { assignment: result.assignment, oldDayId: result.oldDayId });
            return (0, _shared_1.ok)({ assignment: result.assignment });
        });
    if (R)
        server.registerTool('get_assignment_participants', {
            description: 'Get the list of users participating in a specific place assignment.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                assignmentId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ tripId, assignmentId }) => {
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, assignmentService_1.getAssignmentForTrip)(assignmentId, tripId))
                return { content: [{ type: 'text', text: 'Assignment not found.' }], isError: true };
            const participants = (0, assignmentService_1.getParticipants)(assignmentId);
            return (0, _shared_1.ok)({ participants });
        });
    if (W)
        server.registerTool('set_assignment_participants', {
            description: 'Set the participants for a place assignment (replaces current list).',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                assignmentId: zod_1.z.number().int().positive(),
                userIds: zod_1.z.array(zod_1.z.number().int().positive()).describe('User IDs to set as participants; empty array clears all'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, assignmentId, userIds }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            if (!(0, assignmentService_1.getAssignmentForTrip)(assignmentId, tripId))
                return { content: [{ type: 'text', text: 'Assignment not found.' }], isError: true };
            const participants = (0, assignmentService_1.setParticipants)(assignmentId, userIds);
            (0, _shared_1.safeBroadcast)(tripId, 'assignment:participants', { assignmentId, participants });
            return (0, _shared_1.ok)({ participants });
        });
    // --- REORDER ---
    if (W)
        server.registerTool('reorder_day_assignments', {
            description: 'Reorder places within a day by providing the assignment IDs in the desired order.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                dayId: zod_1.z.number().int().positive(),
                assignmentIds: zod_1.z.array(zod_1.z.number().int().positive()).min(1).max(200).describe('Assignment IDs in desired display order'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, dayId, assignmentIds }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            if (!(0, dayService_1.getDay)(dayId, tripId))
                return { content: [{ type: 'text', text: 'Day not found.' }], isError: true };
            (0, assignmentService_1.reorderAssignments)(dayId, assignmentIds);
            (0, _shared_1.safeBroadcast)(tripId, 'assignment:reordered', { dayId, assignmentIds });
            return (0, _shared_1.ok)({ success: true, dayId, order: assignmentIds });
        });
}
