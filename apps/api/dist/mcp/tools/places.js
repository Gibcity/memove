"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPlaceTools = registerPlaceTools;
const zod_1 = require("zod");
const database_1 = require("../../db/database");
const authService_1 = require("../../services/authService");
const placeService_1 = require("../../services/placeService");
const assignmentService_1 = require("../../services/assignmentService");
const journeyService_1 = require("../../services/journeyService");
const categoryService_1 = require("../../services/categoryService");
const mapsService_1 = require("../../services/mapsService");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
function registerPlaceTools(server, userId, scopes) {
    const R = (0, scopes_1.canRead)(scopes, 'places');
    const W = (0, scopes_1.canWrite)(scopes, 'places');
    // --- PLACES ---
    if (W)
        server.registerTool('create_place', {
            description: 'Add a new place/POI to a trip. Set google_place_id or osm_id (from search_place) so the app can show opening hours and ratings. Set price + currency to record the cost so it shows on the item.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                name: zod_1.z.string().min(1).max(200),
                description: zod_1.z.string().max(2000).optional(),
                lat: zod_1.z.number().optional(),
                lng: zod_1.z.number().optional(),
                address: zod_1.z.string().max(500).optional(),
                category_id: zod_1.z.number().int().positive().optional().describe('Category ID — use list_categories to see available options'),
                google_place_id: zod_1.z.string().optional().describe('Google Place ID from search_place — enables opening hours display'),
                osm_id: zod_1.z.string().optional().describe('OpenStreetMap ID from search_place (e.g. "way:12345") — enables opening hours if no Google ID'),
                notes: zod_1.z.string().max(2000).optional(),
                website: zod_1.z.string().max(500).optional(),
                phone: zod_1.z.string().max(50).optional(),
                price: zod_1.z.number().nonnegative().optional().describe('Cost of this place/activity (e.g. ticket price, entry fee)'),
                currency: zod_1.z.string().length(3).optional().describe('ISO 4217 currency code (e.g. "EUR", "USD")'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, name, description, lat, lng, address, category_id, google_place_id, osm_id, notes, website, phone, price, currency }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('place_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const place = (0, placeService_1.createPlace)(String(tripId), { name, description, lat, lng, address, category_id, google_place_id, osm_id, notes, website, phone, price, currency });
            (0, _shared_1.safeBroadcast)(tripId, 'place:created', { place });
            return (0, _shared_1.ok)({ place });
        });
    if (W)
        server.registerTool('create_and_assign_place', {
            description: 'Create a new place and immediately assign it to a day in one atomic operation. Use place details from search_place results. Only use when the place does not yet exist — if it already exists, use assign_place_to_day directly. Set price + currency to record the cost so it shows on the item.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                dayId: zod_1.z.number().int().positive().describe('Day to assign the place to'),
                name: zod_1.z.string().min(1).max(200),
                description: zod_1.z.string().max(2000).optional(),
                lat: zod_1.z.number().optional(),
                lng: zod_1.z.number().optional(),
                address: zod_1.z.string().max(500).optional(),
                category_id: zod_1.z.number().int().positive().optional().describe('Category ID — use list_categories to see available options'),
                google_place_id: zod_1.z.string().optional().describe('Google Place ID from search_place — enables opening hours display'),
                osm_id: zod_1.z.string().optional().describe('OpenStreetMap ID from search_place (e.g. "way:12345")'),
                place_notes: zod_1.z.string().max(2000).optional().describe('Notes for the place'),
                website: zod_1.z.string().max(500).optional(),
                phone: zod_1.z.string().max(50).optional(),
                assignment_notes: zod_1.z.string().max(500).optional().describe('Notes for this day assignment'),
                price: zod_1.z.number().nonnegative().optional().describe('Cost of this place/activity (e.g. ticket price, entry fee)'),
                currency: zod_1.z.string().length(3).optional().describe('ISO 4217 currency code (e.g. "EUR", "USD")'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, dayId, name, description, lat, lng, address, category_id, google_place_id, osm_id, place_notes, website, phone, assignment_notes, price, currency }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('place_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            if (!(0, assignmentService_1.dayExists)(dayId, tripId))
                return { content: [{ type: 'text', text: 'Day not found.' }], isError: true };
            try {
                const run = database_1.db.transaction(() => {
                    const place = (0, placeService_1.createPlace)(String(tripId), { name, description, lat, lng, address, category_id, google_place_id, osm_id, notes: place_notes, website, phone, price, currency });
                    const assignment = (0, assignmentService_1.createAssignment)(dayId, place.id, assignment_notes ?? null);
                    return { place, assignment };
                });
                const result = run();
                (0, _shared_1.safeBroadcast)(tripId, 'place:created', { place: result.place });
                (0, _shared_1.safeBroadcast)(tripId, 'assignment:created', { assignment: result.assignment });
                return (0, _shared_1.ok)(result);
            }
            catch {
                return { content: [{ type: 'text', text: 'Failed to create place and assignment.' }], isError: true };
            }
        });
    if (W)
        server.registerTool('update_place', {
            description: 'Update an existing place in a trip.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                placeId: zod_1.z.number().int().positive(),
                name: zod_1.z.string().min(1).max(200).optional(),
                description: zod_1.z.string().max(2000).optional(),
                lat: zod_1.z.number().optional(),
                lng: zod_1.z.number().optional(),
                address: zod_1.z.string().max(500).optional(),
                category_id: zod_1.z.number().int().positive().optional().describe('Category ID — use list_categories'),
                price: zod_1.z.number().optional(),
                currency: zod_1.z.string().length(3).optional(),
                place_time: zod_1.z.string().max(50).optional().describe('Scheduled time (e.g. "09:00")'),
                end_time: zod_1.z.string().max(50).optional().describe('End time (e.g. "11:00")'),
                duration_minutes: zod_1.z.number().int().positive().optional(),
                notes: zod_1.z.string().max(2000).optional(),
                website: zod_1.z.string().max(500).optional(),
                phone: zod_1.z.string().max(50).optional(),
                transport_mode: zod_1.z.enum(['walking', 'driving', 'cycling', 'transit', 'flight']).optional(),
                osm_id: zod_1.z.string().optional().describe('OpenStreetMap ID (e.g. "way:12345")'),
                google_place_id: zod_1.z.string().optional().describe('Google Place ID (e.g. "ChIJd8BlQ2BZwokRAFUEcm_qrcA")'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, placeId, name, description, lat, lng, address, category_id, price, currency, place_time, end_time, duration_minutes, notes, website, phone, transport_mode, osm_id, google_place_id }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('place_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const place = (0, placeService_1.updatePlace)(String(tripId), String(placeId), { name, description, lat, lng, address, category_id, price, currency, place_time, end_time, duration_minutes, notes, website, phone, transport_mode, osm_id, google_place_id });
            if (!place)
                return { content: [{ type: 'text', text: 'Place not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'place:updated', { place });
            return (0, _shared_1.ok)({ place });
        });
    if (W)
        server.registerTool('delete_place', {
            description: 'Delete a place from a trip.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                placeId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ tripId, placeId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('place_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const deleted = (0, placeService_1.deletePlace)(String(tripId), String(placeId));
            if (!deleted)
                return { content: [{ type: 'text', text: 'Place not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'place:deleted', { placeId });
            return (0, _shared_1.ok)({ success: true });
        });
    if (R)
        server.registerTool('list_places', {
            description: 'List all places/POIs in a trip, optionally filtered by assignment status. Use assignment=unassigned to find orphan activities not yet scheduled on any day.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                search: zod_1.z.string().optional(),
                category: zod_1.z.string().optional(),
                tag: zod_1.z.string().optional(),
                assignment: zod_1.z.enum(['all', 'unassigned', 'assigned']).optional().default('all').describe('Filter by assignment status: "all" (default), "unassigned" (not on any day), or "assigned" (scheduled on a day)'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ tripId, search, category, tag, assignment }) => {
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            const places = (0, placeService_1.listPlaces)(String(tripId), { search, category, tag, assignment });
            return (0, _shared_1.ok)({ places });
        });
    // --- CATEGORIES ---
    if (R)
        server.registerTool('list_categories', {
            description: 'List all available place categories with their id, name, icon and color. Use category_id when creating or updating places.',
            inputSchema: {},
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async () => {
            const categories = (0, categoryService_1.listCategories)();
            return (0, _shared_1.ok)({ categories });
        });
    // --- SEARCH ---
    if (R)
        server.registerTool('search_place', {
            description: 'Search for a real-world place by name or address. Returns results with osm_id (and google_place_id if configured). Use these IDs when calling create_place so the app can display opening hours and ratings.',
            inputSchema: {
                query: zod_1.z.string().min(1).max(500).describe('Place name or address to search for'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ query }) => {
            try {
                const result = await (0, mapsService_1.searchPlaces)(userId, query);
                return (0, _shared_1.ok)(result);
            }
            catch {
                return { content: [{ type: 'text', text: 'Place search failed.' }], isError: true };
            }
        });
    if (W)
        server.registerTool('import_places_from_url', {
            description: 'Import places from a shared Google Maps or Naver Maps list URL. Returns the imported places and count. The list must be shared publicly.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                url: zod_1.z.string().url().describe('Publicly shared Google Maps list URL (maps.app.goo.gl/...) or Naver Maps list URL'),
                source: zod_1.z.enum(['google-list', 'naver-list']).describe('List source: "google-list" for Google Maps saved places, "naver-list" for Naver Maps'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, url, source }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('place_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const result = source === 'google-list'
                ? await (0, placeService_1.importGoogleList)(String(tripId), url)
                : await (0, placeService_1.importNaverList)(String(tripId), url);
            if ('error' in result) {
                return { content: [{ type: 'text', text: result.error }], isError: true };
            }
            for (const place of result.places) {
                (0, _shared_1.safeBroadcast)(tripId, 'place:created', { place });
            }
            return (0, _shared_1.ok)({ places: result.places, count: result.places.length, listName: result.listName, skipped: result.skipped });
        });
    if (W)
        server.registerTool('bulk_delete_places', {
            description: 'Delete multiple places from a trip at once. Removes all day assignments for each place as well. Warn the user before calling this — it cannot be undone.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                placeIds: zod_1.z.array(zod_1.z.number().int().positive()).min(1).max(200),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ tripId, placeIds }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('place_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const deleted = (0, placeService_1.deletePlacesMany)(String(tripId), placeIds);
            for (const id of deleted) {
                (0, _shared_1.safeBroadcast)(tripId, 'place:deleted', { placeId: id });
                try {
                    (0, journeyService_1.onPlaceDeleted)(id);
                }
                catch { }
            }
            return (0, _shared_1.ok)({ deleted, count: deleted.length });
        });
}
