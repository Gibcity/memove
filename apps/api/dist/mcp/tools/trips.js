"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTripTools = registerTripTools;
const zod_1 = require("zod");
const database_1 = require("../../db/database");
const authService_1 = require("../../services/authService");
const tripService_1 = require("../../services/tripService");
const shareService_1 = require("../../services/shareService");
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
const collabService_1 = require("../../services/collabService");
const todoService_1 = require("../../services/todoService");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
function registerTripTools(server, userId, scopes, getDeprecationNotice = () => null) {
    const R = (0, scopes_1.canReadTrips)(scopes);
    const W = (0, scopes_1.canWrite)(scopes, 'trips');
    const D = (0, scopes_1.canDeleteTrips)(scopes);
    const S = (0, scopes_1.canShareTrips)(scopes);
    // --- TRIPS ---
    if (W)
        server.registerTool('create_trip', {
            description: 'Create a new trip. Returns the created trip with its generated days.',
            inputSchema: {
                title: zod_1.z.string().min(1).max(200).describe('Trip title'),
                description: zod_1.z.string().max(2000).optional().describe('Trip description'),
                start_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date (YYYY-MM-DD)'),
                end_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date (YYYY-MM-DD)'),
                currency: zod_1.z.string().length(3).optional().describe('Currency code (e.g. EUR, USD)'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ title, description, start_date, end_date, currency }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (start_date) {
                const d = new Date(start_date + 'T00:00:00Z');
                if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== start_date)
                    return { content: [{ type: 'text', text: 'start_date is not a valid calendar date.' }], isError: true };
            }
            if (end_date) {
                const d = new Date(end_date + 'T00:00:00Z');
                if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== end_date)
                    return { content: [{ type: 'text', text: 'end_date is not a valid calendar date.' }], isError: true };
            }
            if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
                return { content: [{ type: 'text', text: 'End date must be after start date.' }], isError: true };
            }
            const { trip } = (0, tripService_1.createTrip)(userId, { title, description, start_date, end_date, currency }, _shared_1.MAX_MCP_TRIP_DAYS);
            return (0, _shared_1.ok)({ trip });
        });
    if (W)
        server.registerTool('update_trip', {
            description: 'Update an existing trip\'s details.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                title: zod_1.z.string().min(1).max(200).optional(),
                description: zod_1.z.string().max(2000).optional(),
                start_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
                end_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
                currency: zod_1.z.string().length(3).optional(),
                is_archived: zod_1.z.boolean().optional().describe('Archive (true) or unarchive (false) the trip'),
                cover_image: zod_1.z.string().optional().describe('Cover image path, e.g. /uploads/covers/abc.jpg'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, title, description, start_date, end_date, currency, is_archived, cover_image }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('trip_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            if (start_date) {
                const d = new Date(start_date + 'T00:00:00Z');
                if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== start_date)
                    return { content: [{ type: 'text', text: 'start_date is not a valid calendar date.' }], isError: true };
            }
            if (end_date) {
                const d = new Date(end_date + 'T00:00:00Z');
                if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== end_date)
                    return { content: [{ type: 'text', text: 'end_date is not a valid calendar date.' }], isError: true };
            }
            const { updatedTrip } = (0, tripService_1.updateTrip)(tripId, userId, { title, description, start_date, end_date, currency, is_archived, cover_image }, 'user');
            (0, _shared_1.safeBroadcast)(tripId, 'trip:updated', { trip: updatedTrip });
            return (0, _shared_1.ok)({ trip: updatedTrip });
        });
    if (D)
        server.registerTool('delete_trip', {
            description: 'Delete a trip. Only the trip owner can delete it.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ tripId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, tripService_1.isOwner)(tripId, userId))
                return (0, _shared_1.noAccess)();
            (0, tripService_1.deleteTrip)(tripId, userId, 'user');
            return (0, _shared_1.ok)({ success: true, tripId });
        });
    // list_trips and get_trip_summary are always registered regardless of OAuth scopes —
    // they are navigation tools that any MCP client needs to discover trip IDs.
    server.registerTool('list_trips', {
        description: 'List all trips the current user owns or is a member of. Use this for trip discovery before calling get_trip_summary.',
        inputSchema: {
            include_archived: zod_1.z.boolean().optional().describe('Include archived trips (default false)'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
    }, async ({ include_archived }) => {
        const notice = getDeprecationNotice();
        const trips = (0, tripService_1.listTrips)(userId, include_archived ? null : 0);
        if (notice)
            return {
                isError: true,
                content: [
                    { type: 'text', text: notice },
                    { type: 'text', text: JSON.stringify({ trips }, null, 2) },
                ],
            };
        return (0, _shared_1.ok)({ trips });
    });
    // --- TRIP SUMMARY ---
    server.registerTool('get_trip_summary', {
        description: 'Get a full denormalized summary of a trip in a single call: metadata, members, days with assignments and notes, accommodations, budget line items (when enabled), packing list (when enabled), reservations, collab notes and poll/message counts (when enabled), and to-do items (when enabled). Use this as a context loader before planning or modifying a trip.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
    }, async ({ tripId }) => {
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        const summary = (0, tripService_1.getTripSummary)(tripId);
        if (!summary)
            return (0, _shared_1.noAccess)();
        // Addon availability gates
        const packingEnabled = (0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.PACKING);
        const budgetEnabled = (0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.BUDGET);
        const collabEnabled = (0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.COLLAB);
        const collabFeatures = collabEnabled ? (0, adminService_1.getCollabFeatures)() : null;
        // Scope gates — sections not covered by the client's OAuth scopes are omitted.
        // Core trip data (metadata, days, members, accommodations) is always included
        // because this tool is always registered and needed for navigation.
        const canReadBudget = budgetEnabled && (0, scopes_1.canRead)(scopes, 'budget');
        const canReadPacking = packingEnabled && (0, scopes_1.canRead)(scopes, 'packing');
        const canReadCollab = collabEnabled && (0, scopes_1.canRead)(scopes, 'collab');
        const canReadTodos = packingEnabled && (0, scopes_1.canRead)(scopes, 'todos');
        const canReadRes = (0, scopes_1.canRead)(scopes, 'reservations');
        const todos = canReadTodos ? (0, todoService_1.listItems)(tripId) : [];
        let pollCount = 0;
        let messageCount = 0;
        if (canReadCollab) {
            if (collabFeatures?.polls)
                pollCount = (0, collabService_1.listPolls)(tripId).length;
            if (collabFeatures?.chat)
                messageCount = (0, collabService_1.countMessages)(tripId);
        }
        const notice = getDeprecationNotice();
        const summaryData = {
            ...summary,
            reservations: canReadRes ? summary.reservations : undefined,
            packing: canReadPacking ? summary.packing : undefined,
            budget: canReadBudget ? summary.budget : undefined,
            collab_notes: canReadCollab && collabFeatures?.notes ? summary.collab_notes : [],
            todos,
            pollCount,
            messageCount,
        };
        if (notice)
            return {
                isError: true,
                content: [
                    { type: 'text', text: notice },
                    { type: 'text', text: JSON.stringify(summaryData, null, 2) },
                ],
            };
        return (0, _shared_1.ok)(summaryData);
    });
    // --- TRIP MEMBERS, COPY, ICS, SHARE ---
    if (R)
        server.registerTool('list_trip_members', {
            description: 'List all members of a trip (owner + collaborators).',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ tripId }) => {
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            const ownerRow = (0, tripService_1.getTripOwner)(tripId);
            if (!ownerRow)
                return (0, _shared_1.noAccess)();
            const { owner, members } = (0, tripService_1.listMembers)(tripId, ownerRow.user_id);
            return (0, _shared_1.ok)({ owner, members });
        });
    if (W)
        server.registerTool('add_trip_member', {
            description: 'Add a user to a trip by their username or email address. Only the trip owner can do this.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                identifier: zod_1.z.string().min(1).describe('Username or email of the user to add'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, identifier }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            const ownerRow = (0, tripService_1.getTripOwner)(tripId);
            if (!ownerRow || ownerRow.user_id !== userId)
                return { content: [{ type: 'text', text: 'Only the trip owner can add members.' }], isError: true };
            try {
                const result = (0, tripService_1.addMember)(tripId, identifier, ownerRow.user_id, userId);
                (0, _shared_1.safeBroadcast)(tripId, 'member:added', { member: result.member });
                return (0, _shared_1.ok)({ member: result.member });
            }
            catch (err) {
                const msg = err instanceof tripService_1.ValidationError || err instanceof tripService_1.NotFoundError ? err.message : 'Failed to add member.';
                return { content: [{ type: 'text', text: msg }], isError: true };
            }
        });
    if (W)
        server.registerTool('remove_trip_member', {
            description: 'Remove a member from a trip. Only the trip owner can do this.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                memberId: zod_1.z.number().int().positive().describe('User ID of the member to remove'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ tripId, memberId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            const ownerRow = (0, tripService_1.getTripOwner)(tripId);
            if (!ownerRow || ownerRow.user_id !== userId)
                return { content: [{ type: 'text', text: 'Only the trip owner can remove members.' }], isError: true };
            (0, tripService_1.removeMember)(tripId, memberId);
            (0, _shared_1.safeBroadcast)(tripId, 'member:removed', { userId: memberId });
            return (0, _shared_1.ok)({ success: true });
        });
    if (W)
        server.registerTool('copy_trip', {
            description: 'Duplicate a trip (all days, places, itinerary, packing, budget, reservations, day notes). Packing items are reset to unchecked. Returns the new trip.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive().describe('Source trip ID to duplicate'),
                title: zod_1.z.string().min(1).max(200).optional().describe('Title for the new trip (defaults to source title)'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, title }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            try {
                const newTripId = (0, tripService_1.copyTripById)(tripId, userId, title);
                const newTrip = (0, database_1.canAccessTrip)(newTripId, userId);
                return (0, _shared_1.ok)({ trip: { id: newTripId, ...newTrip } });
            }
            catch {
                return { content: [{ type: 'text', text: 'Failed to copy trip.' }], isError: true };
            }
        });
    if (R)
        server.registerTool('export_trip_ics', {
            description: 'Export a trip\'s itinerary and reservations as iCalendar (.ics) format text. Useful for importing into calendar apps.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ tripId }) => {
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            try {
                const { ics, filename } = (0, tripService_1.exportICS)(tripId);
                return (0, _shared_1.ok)({ ics, filename });
            }
            catch {
                return { content: [{ type: 'text', text: 'Trip not found.' }], isError: true };
            }
        });
    if (S)
        server.registerTool('get_share_link', {
            description: 'Get the current public share link for a trip, including its permission flags. Returns null if no share link exists.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ tripId }) => {
            // Read parity with the REST route GET /api/trips/:tripId/share-link, which
            // only requires trip membership (share_manage gates create/delete, not read).
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            const link = (0, shareService_1.getShareLink)(String(tripId));
            return (0, _shared_1.ok)({ link });
        });
    if (S)
        server.registerTool('create_share_link', {
            description: 'Create or update the public share link for a trip. Set permission flags to control what is visible to guests.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                share_map: zod_1.z.boolean().optional().default(true).describe('Share the map and places'),
                share_bookings: zod_1.z.boolean().optional().default(true).describe('Share reservations'),
                share_packing: zod_1.z.boolean().optional().default(false).describe('Share packing list'),
                share_budget: zod_1.z.boolean().optional().default(false).describe('Share budget'),
                share_collab: zod_1.z.boolean().optional().default(false).describe('Share collab messages'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, share_map, share_bookings, share_packing, share_budget, share_collab }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('share_manage', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const { token, created } = (0, shareService_1.createOrUpdateShareLink)(String(tripId), userId, {
                share_map: share_map ?? true,
                share_bookings: share_bookings ?? true,
                share_packing: share_packing ?? false,
                share_budget: share_budget ?? false,
                share_collab: share_collab ?? false,
            });
            return (0, _shared_1.ok)({ token, created });
        });
    if (S)
        server.registerTool('delete_share_link', {
            description: 'Revoke the public share link for a trip. Guests will no longer be able to access the shared view.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ tripId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('share_manage', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            (0, shareService_1.deleteShareLink)(String(tripId));
            return (0, _shared_1.ok)({ success: true });
        });
}
