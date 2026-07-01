"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISSION_ACTIONS = void 0;
exports.invalidatePermissionsCache = invalidatePermissionsCache;
exports.getPermissionLevel = getPermissionLevel;
exports.getAllPermissions = getAllPermissions;
exports.savePermissions = savePermissions;
exports.checkPermission = checkPermission;
const database_1 = require("../db/database");
// All configurable actions with their defaults matching upstream behavior
exports.PERMISSION_ACTIONS = [
    // Trip management
    { key: 'trip_create', defaultLevel: 'everybody', allowedLevels: ['admin', 'everybody'] },
    { key: 'trip_edit', defaultLevel: 'trip_owner', allowedLevels: ['trip_owner', 'trip_member'] },
    { key: 'trip_delete', defaultLevel: 'trip_owner', allowedLevels: ['admin', 'trip_owner'] },
    { key: 'trip_archive', defaultLevel: 'trip_owner', allowedLevels: ['trip_owner', 'trip_member'] },
    { key: 'trip_cover_upload', defaultLevel: 'trip_owner', allowedLevels: ['trip_owner', 'trip_member'] },
    // Member management
    { key: 'member_manage', defaultLevel: 'trip_owner', allowedLevels: ['admin', 'trip_owner', 'trip_member'] },
    // Files
    { key: 'file_upload', defaultLevel: 'trip_member', allowedLevels: ['admin', 'trip_owner', 'trip_member'] },
    { key: 'file_edit', defaultLevel: 'trip_member', allowedLevels: ['trip_owner', 'trip_member'] },
    { key: 'file_delete', defaultLevel: 'trip_member', allowedLevels: ['trip_owner', 'trip_member'] },
    // Places
    { key: 'place_edit', defaultLevel: 'trip_member', allowedLevels: ['trip_owner', 'trip_member'] },
    // Budget
    { key: 'budget_edit', defaultLevel: 'trip_member', allowedLevels: ['trip_owner', 'trip_member'] },
    // Packing
    { key: 'packing_edit', defaultLevel: 'trip_member', allowedLevels: ['trip_owner', 'trip_member'] },
    // Reservations
    { key: 'reservation_edit', defaultLevel: 'trip_member', allowedLevels: ['trip_owner', 'trip_member'] },
    // Day notes & schedule
    { key: 'day_edit', defaultLevel: 'trip_member', allowedLevels: ['trip_owner', 'trip_member'] },
    // Collaboration (notes, polls, messages)
    { key: 'collab_edit', defaultLevel: 'trip_member', allowedLevels: ['trip_owner', 'trip_member'] },
    // Share link management
    { key: 'share_manage', defaultLevel: 'trip_owner', allowedLevels: ['trip_owner', 'trip_member'] },
];
const ACTIONS_MAP = new Map(exports.PERMISSION_ACTIONS.map(a => [a.key, a]));
// In-memory cache, invalidated on save
let cache = null;
function loadPermissions() {
    if (cache)
        return cache;
    cache = new Map();
    try {
        const rows = database_1.db.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'perm_%'").all();
        for (const row of rows) {
            const actionKey = row.key.replace('perm_', '');
            if (ACTIONS_MAP.has(actionKey)) {
                cache.set(actionKey, row.value);
            }
        }
    }
    catch { /* table might not exist yet during init */ }
    return cache;
}
function invalidatePermissionsCache() {
    cache = null;
}
function getPermissionLevel(actionKey) {
    const perms = loadPermissions();
    const stored = perms.get(actionKey);
    if (stored)
        return stored;
    const action = ACTIONS_MAP.get(actionKey);
    return action?.defaultLevel ?? 'trip_owner';
}
function getAllPermissions() {
    const perms = loadPermissions();
    const result = {};
    for (const action of exports.PERMISSION_ACTIONS) {
        result[action.key] = perms.get(action.key) ?? action.defaultLevel;
    }
    return result;
}
function savePermissions(settings) {
    const skipped = [];
    const upsert = database_1.db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)");
    const txn = database_1.db.transaction(() => {
        for (const [actionKey, level] of Object.entries(settings)) {
            const action = ACTIONS_MAP.get(actionKey);
            if (!action || !action.allowedLevels.includes(level)) {
                skipped.push(actionKey);
                continue;
            }
            upsert.run(`perm_${actionKey}`, level);
        }
    });
    txn();
    invalidatePermissionsCache();
    return { skipped };
}
/**
 * Check if a user passes the permission check for a given action.
 *
 * @param actionKey - The permission action key
 * @param userRole - 'admin' | 'user'
 * @param tripUserId - The trip owner's user ID (null for non-trip actions like trip_create)
 * @param userId - The requesting user's ID
 * @param isMember - Whether the user is a trip member (not owner)
 */
function checkPermission(actionKey, userRole, tripUserId, userId, isMember) {
    // Admins always pass
    if (userRole === 'admin')
        return true;
    const required = getPermissionLevel(actionKey);
    switch (required) {
        case 'admin':
            return false; // already checked above
        case 'trip_owner':
            return tripUserId !== null && tripUserId === userId;
        case 'trip_member':
            return (tripUserId !== null && tripUserId === userId) || isMember;
        case 'everybody':
            return true;
        default:
            return false;
    }
}
