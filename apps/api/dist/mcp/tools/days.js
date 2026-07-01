"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerDayTools = registerDayTools;
const zod_1 = require("zod");
const database_1 = require("../../db/database");
const authService_1 = require("../../services/authService");
const dayService_1 = require("../../services/dayService");
const placeService_1 = require("../../services/placeService");
const dayNoteService_1 = require("../../services/dayNoteService");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
function registerDayTools(server, userId, scopes) {
    if (!(0, scopes_1.canWrite)(scopes, 'trips'))
        return;
    // --- DAYS ---
    server.registerTool('update_day', {
        description: 'Set the title of a day in a trip (e.g. "Arrival in Paris", "Free day").',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            dayId: zod_1.z.number().int().positive(),
            title: zod_1.z.string().max(200).nullable().describe('Day title, or null to clear it'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
    }, async ({ tripId, dayId, title }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        const current = (0, dayService_1.getDay)(dayId, tripId);
        if (!current)
            return { content: [{ type: 'text', text: 'Day not found.' }], isError: true };
        const updated = (0, dayService_1.updateDay)(dayId, current, title !== undefined ? { title } : {});
        (0, _shared_1.safeBroadcast)(tripId, 'day:updated', { day: updated });
        return (0, _shared_1.ok)({ day: updated });
    });
    server.registerTool('create_day', {
        description: 'Add a new day to a trip (optionally with a specific date and notes).',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            date: zod_1.z.string().optional().describe('ISO date string YYYY-MM-DD, optional for dateless trips'),
            notes: zod_1.z.string().optional(),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
    }, async ({ tripId, date, notes }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        const day = (0, dayService_1.createDay)(tripId, date, notes);
        (0, _shared_1.safeBroadcast)(tripId, 'day:created', { day });
        return (0, _shared_1.ok)({ day });
    });
    server.registerTool('delete_day', {
        description: 'Delete a day from a trip.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            dayId: zod_1.z.number().int().positive(),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
    }, async ({ tripId, dayId }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        if (!(0, dayService_1.getDay)(dayId, tripId))
            return { content: [{ type: 'text', text: 'Day not found.' }], isError: true };
        (0, dayService_1.deleteDay)(dayId);
        (0, _shared_1.safeBroadcast)(tripId, 'day:deleted', { id: dayId });
        return (0, _shared_1.ok)({ success: true });
    });
    server.registerTool('create_accommodation', {
        description: 'Add an accommodation (hotel, Airbnb, etc.) to a trip, linked to a place and a date range.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            place_id: zod_1.z.number().int().positive().describe('The place to use as the accommodation'),
            start_day_id: zod_1.z.number().int().positive().describe('Check-in day ID'),
            end_day_id: zod_1.z.number().int().positive().describe('Check-out day ID'),
            check_in: zod_1.z.string().max(10).optional().describe('Check-in time e.g. "15:00"'),
            check_in_end: zod_1.z.string().max(10).optional().describe('Check-in window end time e.g. "20:00"'),
            check_out: zod_1.z.string().max(10).optional().describe('Check-out time e.g. "11:00"'),
            confirmation: zod_1.z.string().max(100).optional(),
            notes: zod_1.z.string().max(1000).optional(),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
    }, async ({ tripId, place_id, start_day_id, end_day_id, check_in, check_in_end, check_out, confirmation, notes }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        const errors = (0, dayService_1.validateAccommodationRefs)(tripId, place_id, start_day_id, end_day_id);
        if (errors.length > 0)
            return { content: [{ type: 'text', text: errors.map(e => e.message).join(', ') }], isError: true };
        const accommodation = (0, dayService_1.createAccommodation)(tripId, { place_id, start_day_id, end_day_id, check_in, check_in_end, check_out, confirmation, notes });
        (0, _shared_1.safeBroadcast)(tripId, 'accommodation:created', { accommodation });
        return (0, _shared_1.ok)({ accommodation });
    });
    server.registerTool('create_place_accommodation', {
        description: 'Create a new place and immediately set it as an accommodation for a date range in one atomic operation. Use place details from search_place results. Only use when the place does not yet exist — if it already exists, use create_accommodation directly. Set price + currency to record the accommodation cost so it shows on the item.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
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
            start_day_id: zod_1.z.number().int().positive().describe('Check-in day ID'),
            end_day_id: zod_1.z.number().int().positive().describe('Check-out day ID'),
            check_in: zod_1.z.string().max(10).optional().describe('Check-in time e.g. "15:00"'),
            check_in_end: zod_1.z.string().max(10).optional().describe('Check-in window end time e.g. "20:00"'),
            check_out: zod_1.z.string().max(10).optional().describe('Check-out time e.g. "11:00"'),
            confirmation: zod_1.z.string().max(100).optional(),
            accommodation_notes: zod_1.z.string().max(1000).optional().describe('Notes for the accommodation'),
            price: zod_1.z.number().nonnegative().optional().describe('Total accommodation cost (shown on the item)'),
            currency: zod_1.z.string().length(3).optional().describe('ISO 4217 currency code (e.g. "EUR", "USD")'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
    }, async ({ tripId, name, description, lat, lng, address, category_id, google_place_id, osm_id, place_notes, website, phone, start_day_id, end_day_id, check_in, check_in_end, check_out, confirmation, accommodation_notes, price, currency }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        const dayErrors = (0, dayService_1.validateAccommodationRefs)(tripId, undefined, start_day_id, end_day_id);
        if (dayErrors.length > 0)
            return { content: [{ type: 'text', text: dayErrors.map(e => e.message).join(', ') }], isError: true };
        try {
            const run = database_1.db.transaction(() => {
                const place = (0, placeService_1.createPlace)(String(tripId), { name, description, lat, lng, address, category_id, google_place_id, osm_id, notes: place_notes, website, phone, price, currency });
                const accommodation = (0, dayService_1.createAccommodation)(tripId, { place_id: place.id, start_day_id, end_day_id, check_in, check_in_end, check_out, confirmation, notes: accommodation_notes });
                return { place, accommodation };
            });
            const result = run();
            (0, _shared_1.safeBroadcast)(tripId, 'place:created', { place: result.place });
            (0, _shared_1.safeBroadcast)(tripId, 'accommodation:created', { accommodation: result.accommodation });
            return (0, _shared_1.ok)(result);
        }
        catch {
            return { content: [{ type: 'text', text: 'Failed to create place and accommodation.' }], isError: true };
        }
    });
    server.registerTool('update_accommodation', {
        description: 'Update fields on an existing accommodation.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            accommodationId: zod_1.z.number().int().positive(),
            place_id: zod_1.z.number().int().positive().optional(),
            start_day_id: zod_1.z.number().int().positive().optional(),
            end_day_id: zod_1.z.number().int().positive().optional(),
            check_in: zod_1.z.string().max(10).optional(),
            check_in_end: zod_1.z.string().max(10).optional().describe('Check-in window end time e.g. "20:00"'),
            check_out: zod_1.z.string().max(10).optional(),
            confirmation: zod_1.z.string().max(100).optional(),
            notes: zod_1.z.string().max(1000).optional(),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
    }, async ({ tripId, accommodationId, place_id, start_day_id, end_day_id, check_in, check_in_end, check_out, confirmation, notes }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        const existing = (0, dayService_1.getAccommodation)(accommodationId, tripId);
        if (!existing)
            return { content: [{ type: 'text', text: 'Accommodation not found.' }], isError: true };
        const accommodation = (0, dayService_1.updateAccommodation)(accommodationId, existing, { place_id, start_day_id, end_day_id, check_in, check_in_end, check_out, confirmation, notes });
        (0, _shared_1.safeBroadcast)(tripId, 'accommodation:updated', { accommodation });
        return (0, _shared_1.ok)({ accommodation });
    });
    server.registerTool('delete_accommodation', {
        description: 'Delete an accommodation from a trip.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            accommodationId: zod_1.z.number().int().positive(),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
    }, async ({ tripId, accommodationId }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        if (!(0, dayService_1.getAccommodation)(accommodationId, tripId))
            return { content: [{ type: 'text', text: 'Accommodation not found.' }], isError: true };
        const { linkedReservationId } = (0, dayService_1.deleteAccommodation)(accommodationId);
        (0, _shared_1.safeBroadcast)(tripId, 'accommodation:deleted', { id: accommodationId, linkedReservationId });
        return (0, _shared_1.ok)({ success: true, linkedReservationId });
    });
    // --- DAY NOTES ---
    server.registerTool('create_day_note', {
        description: 'Add a note to a specific day in a trip.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            dayId: zod_1.z.number().int().positive(),
            text: zod_1.z.string().min(1).max(500),
            time: zod_1.z.string().max(250).optional().describe('Time label (e.g. "09:00" or "Morning")'),
            icon: zod_1.z.string().optional().describe('Emoji icon for the note'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
    }, async ({ tripId, dayId, text, time, icon }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        if (!(0, dayNoteService_1.dayExists)(dayId, tripId))
            return { content: [{ type: 'text', text: 'Day not found.' }], isError: true };
        const note = (0, dayNoteService_1.createNote)(dayId, tripId, text, time, icon);
        (0, _shared_1.safeBroadcast)(tripId, 'dayNote:created', { dayId, note });
        return (0, _shared_1.ok)({ note });
    });
    server.registerTool('update_day_note', {
        description: 'Edit an existing note on a specific day.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            dayId: zod_1.z.number().int().positive(),
            noteId: zod_1.z.number().int().positive(),
            text: zod_1.z.string().min(1).max(500).optional(),
            time: zod_1.z.string().max(250).nullable().optional().describe('Time label (e.g. "09:00" or "Morning"), or null to clear'),
            icon: zod_1.z.string().optional().describe('Emoji icon for the note'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
    }, async ({ tripId, dayId, noteId, text, time, icon }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        const existing = (0, dayNoteService_1.getNote)(noteId, dayId, tripId);
        if (!existing)
            return { content: [{ type: 'text', text: 'Note not found.' }], isError: true };
        const note = (0, dayNoteService_1.updateNote)(noteId, existing, { text, time: time !== undefined ? time : undefined, icon });
        (0, _shared_1.safeBroadcast)(tripId, 'dayNote:updated', { dayId, note });
        return (0, _shared_1.ok)({ note });
    });
    server.registerTool('delete_day_note', {
        description: 'Delete a note from a specific day.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            dayId: zod_1.z.number().int().positive(),
            noteId: zod_1.z.number().int().positive(),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
    }, async ({ tripId, dayId, noteId }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('day_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        const note = (0, dayNoteService_1.getNote)(noteId, dayId, tripId);
        if (!note)
            return { content: [{ type: 'text', text: 'Note not found.' }], isError: true };
        (0, dayNoteService_1.deleteNote)(noteId);
        (0, _shared_1.safeBroadcast)(tripId, 'dayNote:deleted', { noteId, dayId });
        return (0, _shared_1.ok)({ success: true });
    });
}
