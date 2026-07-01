"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOOL_ANNOTATIONS_NON_IDEMPOTENT = exports.TOOL_ANNOTATIONS_DELETE = exports.TOOL_ANNOTATIONS_WRITE = exports.TOOL_ANNOTATIONS_READONLY = exports.MAX_MCP_TRIP_DAYS = void 0;
exports.safeBroadcast = safeBroadcast;
exports.demoDenied = demoDenied;
exports.noAccess = noAccess;
exports.permissionDenied = permissionDenied;
exports.hasTripPermission = hasTripPermission;
exports.isAdminUser = isAdminUser;
exports.adminRequired = adminRequired;
exports.ok = ok;
const websocket_1 = require("../../websocket");
const database_1 = require("../../db/database");
const permissions_1 = require("../../services/permissions");
function safeBroadcast(tripId, event, payload) {
    try {
        (0, websocket_1.broadcast)(tripId, event, { ...payload, _source: 'mcp' });
    }
    catch (err) {
        console.error(`[MCP] broadcast failed for ${event}:`, err?.message ?? err);
    }
}
exports.MAX_MCP_TRIP_DAYS = 90;
exports.TOOL_ANNOTATIONS_READONLY = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};
exports.TOOL_ANNOTATIONS_WRITE = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
};
exports.TOOL_ANNOTATIONS_DELETE = {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
};
exports.TOOL_ANNOTATIONS_NON_IDEMPOTENT = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
};
function demoDenied() {
    return { content: [{ type: 'text', text: 'Write operations are disabled in demo mode.' }], isError: true };
}
function noAccess() {
    return { content: [{ type: 'text', text: 'Trip not found or access denied.' }], isError: true };
}
function permissionDenied() {
    return { content: [{ type: 'text', text: 'You do not have permission to perform this action on this trip.' }], isError: true };
}
/**
 * RBAC gate for MCP tools, mirroring the checkPermission() calls the REST/Nest
 * routes run. Call this after canAccessTrip() with the same action key the
 * matching REST route uses. Returns true when the user may perform `action`
 * on `tripId`.
 */
function hasTripPermission(action, tripId, userId) {
    const trip = database_1.db.prepare('SELECT user_id FROM trips WHERE id = ?').get(tripId);
    if (!trip)
        return false;
    const userRow = database_1.db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
    const tripOwnerId = typeof trip.user_id === 'number' ? trip.user_id : null;
    return (0, permissions_1.checkPermission)(action, userRow?.role ?? 'user', tripOwnerId, userId, tripOwnerId !== userId);
}
/** True when the user has the global admin role (mirrors REST `user.role === 'admin'` gates). */
function isAdminUser(userId) {
    const userRow = database_1.db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
    return userRow?.role === 'admin';
}
/** Error response for admin-only tools, reproducing the REST `{ error: 'Admin access required' }` string. */
function adminRequired() {
    return { content: [{ type: 'text', text: 'Admin access required' }], isError: true };
}
function ok(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
