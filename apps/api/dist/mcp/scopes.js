"use strict";
// ---------------------------------------------------------------------------
// OAuth 2.1 scope definitions for memove MCP
// ---------------------------------------------------------------------------
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCOPE_INFO = exports.ALL_SCOPES = exports.SCOPES = void 0;
exports.canReadTrips = canReadTrips;
exports.canWrite = canWrite;
exports.canRead = canRead;
exports.canDeleteTrips = canDeleteTrips;
exports.canShareTrips = canShareTrips;
exports.canShareJourneys = canShareJourneys;
exports.validateScopes = validateScopes;
exports.SCOPES = {
    TRIPS_READ: 'trips:read',
    TRIPS_WRITE: 'trips:write',
    TRIPS_DELETE: 'trips:delete',
    TRIPS_SHARE: 'trips:share',
    PLACES_READ: 'places:read',
    PLACES_WRITE: 'places:write',
    ATLAS_READ: 'atlas:read',
    ATLAS_WRITE: 'atlas:write',
    PACKING_READ: 'packing:read',
    PACKING_WRITE: 'packing:write',
    TODOS_READ: 'todos:read',
    TODOS_WRITE: 'todos:write',
    BUDGET_READ: 'budget:read',
    BUDGET_WRITE: 'budget:write',
    RESERVATIONS_READ: 'reservations:read',
    RESERVATIONS_WRITE: 'reservations:write',
    COLLAB_READ: 'collab:read',
    COLLAB_WRITE: 'collab:write',
    NOTIFICATIONS_READ: 'notifications:read',
    NOTIFICATIONS_WRITE: 'notifications:write',
    VACAY_READ: 'vacay:read',
    VACAY_WRITE: 'vacay:write',
    GEO_READ: 'geo:read',
    WEATHER_READ: 'weather:read',
    JOURNEY_READ: 'journey:read',
    JOURNEY_WRITE: 'journey:write',
    JOURNEY_SHARE: 'journey:share',
    RELOCATION_READ: 'relocation:read',
    RELOCATION_WRITE: 'relocation:write',
};
exports.ALL_SCOPES = Object.values(exports.SCOPES);
exports.SCOPE_INFO = {
    'trips:read': { label: 'View trips & itineraries', description: 'Read trips, days, day notes, and members', group: 'Trips' },
    'trips:write': { label: 'Edit trips & itineraries', description: 'Create and update trips, days, notes, and manage members', group: 'Trips' },
    'trips:delete': { label: 'Delete trips', description: 'Permanently delete entire trips — this action is irreversible', group: 'Trips' },
    'trips:share': { label: 'Manage share links', description: 'Create, update, and revoke public share links for trips', group: 'Trips' },
    'places:read': { label: 'View places & map data', description: 'Read places, day assignments, tags, and categories', group: 'Places' },
    'places:write': { label: 'Manage places', description: 'Create, update, and delete places, assignments, and tags', group: 'Places' },
    'atlas:read': { label: 'View Atlas', description: 'Read visited countries, regions, and bucket list', group: 'Atlas' },
    'atlas:write': { label: 'Manage Atlas', description: 'Mark countries and regions visited, manage bucket list', group: 'Atlas' },
    'packing:read': { label: 'View packing lists', description: 'Read packing items, bags, and category assignees', group: 'Packing' },
    'packing:write': { label: 'Manage packing lists', description: 'Add, update, delete, toggle, and reorder packing items and bags', group: 'Packing' },
    'todos:read': { label: 'View to-do lists', description: 'Read trip to-do items and category assignees', group: 'To-dos' },
    'todos:write': { label: 'Manage to-do lists', description: 'Create, update, toggle, delete, and reorder to-do items', group: 'To-dos' },
    'budget:read': { label: 'View budget', description: 'Read budget items and expense breakdown', group: 'Budget' },
    'budget:write': { label: 'Manage budget', description: 'Create, update, and delete budget items', group: 'Budget' },
    'reservations:read': { label: 'View reservations', description: 'Read reservations and accommodation details', group: 'Reservations' },
    'reservations:write': { label: 'Manage reservations', description: 'Create, update, delete, and reorder reservations', group: 'Reservations' },
    'collab:read': { label: 'View collaboration', description: 'Read collab notes, polls, and messages', group: 'Collaboration' },
    'collab:write': { label: 'Manage collaboration', description: 'Create, update, and delete collab notes, polls, and messages', group: 'Collaboration' },
    'notifications:read': { label: 'View notifications', description: 'Read in-app notifications and unread counts', group: 'Notifications' },
    'notifications:write': { label: 'Manage notifications', description: 'Mark notifications as read and respond to them', group: 'Notifications' },
    'vacay:read': { label: 'View vacation plans', description: 'Read vacation planning data, entries, and stats', group: 'Vacation' },
    'vacay:write': { label: 'Manage vacation plans', description: 'Create and manage vacation entries, holidays, and team plans', group: 'Vacation' },
    'geo:read': { label: 'Maps & geocoding', description: 'Search locations, resolve map URLs, and reverse geocode coordinates', group: 'Geo' },
    'weather:read': { label: 'Weather forecasts', description: 'Fetch weather forecasts for trip locations and dates', group: 'Weather' },
    'journey:read': { label: 'View journeys', description: 'Read journeys, entries, and contributor list', group: 'Journey' },
    'journey:write': { label: 'Manage journeys', description: 'Create, update, and delete journeys and their entries', group: 'Journey' },
    'journey:share': { label: 'Manage journey links', description: 'Create, update, and revoke public share links for journeys', group: 'Journey' },
    'relocation:read': { label: 'View relocation data', description: 'Read relocation candidates, scores, and user profiles', group: 'Relocation' },
    'relocation:write': { label: 'Manage relocation profile', description: 'Create and update relocation profiles, filters, and elicitation', group: 'Relocation' },
};
// ---------------------------------------------------------------------------
// Scope enforcement helpers
// null scopes = static memove_ token = full access
// ---------------------------------------------------------------------------
/** trips:read OR trips:write OR trips:delete OR trips:share all grant read access to trips */
function canReadTrips(scopes) {
    if (!scopes)
        return true;
    return scopes.some(s => s === 'trips:read' || s === 'trips:write' || s === 'trips:delete' || s === 'trips:share');
}
/** group:write grants write access; for trips canReadTrips handles read */
function canWrite(scopes, group) {
    if (!scopes)
        return true;
    return scopes.includes(`${group}:write`);
}
/** group:read OR group:write grant read access */
function canRead(scopes, group) {
    if (!scopes)
        return true;
    return scopes.some(s => s === `${group}:read` || s === `${group}:write`);
}
/** trips:delete is a separate scope from trips:write */
function canDeleteTrips(scopes) {
    if (!scopes)
        return true;
    return scopes.includes('trips:delete');
}
/** trips:share is a separate scope for managing public share links */
function canShareTrips(scopes) {
    if (!scopes)
        return true;
    return scopes.includes('trips:share');
}
/** journey:share is a separate scope for managing public share links for journeys */
function canShareJourneys(scopes) {
    if (!scopes)
        return true;
    return scopes.includes('journey:share');
}
function validateScopes(requestedScopes) {
    const invalid = requestedScopes.filter(s => !exports.ALL_SCOPES.includes(s));
    return { valid: invalid.length === 0, invalid };
}
