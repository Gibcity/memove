"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerJourneyTools = registerJourneyTools;
const zod_1 = require("zod");
const authService_1 = require("../../services/authService");
const journeyService_1 = require("../../services/journeyService");
const journeyShareService_1 = require("../../services/journeyShareService");
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
function notFound(msg) {
    return { content: [{ type: 'text', text: msg }], isError: true };
}
function registerJourneyTools(server, userId, scopes) {
    if (!(0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.JOURNEY))
        return;
    const R = (0, scopes_1.canRead)(scopes, 'journey');
    const W = (0, scopes_1.canWrite)(scopes, 'journey');
    const S = (0, scopes_1.canShareJourneys)(scopes);
    // --- READ TOOLS ---
    if (R)
        server.registerTool('list_journeys', {
            description: 'List all journeys owned or contributed to by the current user.',
            inputSchema: {},
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async () => {
            const journeys = (0, journeyService_1.listJourneys)(userId);
            return (0, _shared_1.ok)({ journeys });
        });
    if (R)
        server.registerTool('get_journey', {
            description: 'Get a full journey including entries, contributors, and linked trips.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ journeyId }) => {
            const journey = (0, journeyService_1.getJourneyFull)(journeyId, userId);
            if (!journey)
                return notFound('Journey not found or access denied.');
            return (0, _shared_1.ok)({ journey });
        });
    if (R)
        server.registerTool('list_journey_entries', {
            description: 'List all entries in a journey.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ journeyId }) => {
            if (!(0, journeyService_1.canAccessJourney)(journeyId, userId))
                return notFound('Journey not found or access denied.');
            const entries = (0, journeyService_1.listEntries)(journeyId, userId);
            return (0, _shared_1.ok)({ entries });
        });
    if (R)
        server.registerTool('list_journey_contributors', {
            description: 'List all contributors (owner and collaborators) of a journey.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ journeyId }) => {
            const journey = (0, journeyService_1.getJourneyFull)(journeyId, userId);
            if (!journey)
                return notFound('Journey not found or access denied.');
            return (0, _shared_1.ok)({ contributors: journey.contributors ?? [] });
        });
    if (R)
        server.registerTool('get_journey_suggestions', {
            description: 'Get trip suggestions for creating a new journey (recently completed trips not yet in any journey).',
            inputSchema: {},
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async () => {
            const trips = (0, journeyService_1.getSuggestions)(userId);
            return (0, _shared_1.ok)({ trips });
        });
    if (R)
        server.registerTool('list_journey_available_trips', {
            description: 'List all trips available to link to a journey.',
            inputSchema: {},
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async () => {
            const trips = (0, journeyService_1.listUserTrips)(userId);
            return (0, _shared_1.ok)({ trips });
        });
    // --- WRITE TOOLS ---
    if (W)
        server.registerTool('create_journey', {
            description: 'Create a new journey, optionally linking existing trips.',
            inputSchema: {
                title: zod_1.z.string().min(1).max(200),
                subtitle: zod_1.z.string().max(300).optional(),
                trip_ids: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ title, subtitle, trip_ids }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const journey = (0, journeyService_1.createJourney)(userId, { title, subtitle, trip_ids });
            // Return the fully-hydrated journey (entries/contributors/trips/stats/my_role),
            // matching get_journey, rather than the bare row.
            return (0, _shared_1.ok)({ journey: (0, journeyService_1.getJourneyFull)(journey.id, userId) ?? journey });
        });
    if (W)
        server.registerTool('update_journey', {
            description: 'Update an existing journey\'s title, subtitle, cover, or status. Owner only.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
                title: zod_1.z.string().min(1).max(200).optional(),
                subtitle: zod_1.z.string().max(300).optional(),
                status: zod_1.z.enum(['draft', 'active', 'completed', 'archived']).optional(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ journeyId, title, subtitle, status }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const journey = (0, journeyService_1.updateJourney)(journeyId, userId, { title, subtitle, status });
            if (!journey)
                return notFound('Journey not found or access denied.');
            return (0, _shared_1.ok)({ journey });
        });
    if (W)
        server.registerTool('delete_journey', {
            description: 'Delete a journey. Owner only — this cannot be undone.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ journeyId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const success = (0, journeyService_1.deleteJourney)(journeyId, userId);
            if (!success)
                return notFound('Journey not found or access denied.');
            return (0, _shared_1.ok)({ success: true });
        });
    if (W)
        server.registerTool('add_journey_trip', {
            description: 'Link a trip to a journey. Syncs skeleton entries for all places in the trip.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
                tripId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ journeyId, tripId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, journeyService_1.canAccessJourney)(journeyId, userId))
                return notFound('Journey not found or access denied.');
            const success = (0, journeyService_1.addTripToJourney)(journeyId, tripId, userId);
            return (0, _shared_1.ok)({ success });
        });
    if (W)
        server.registerTool('remove_journey_trip', {
            description: 'Unlink a trip from a journey. Owner only.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
                tripId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ journeyId, tripId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const success = (0, journeyService_1.removeTripFromJourney)(journeyId, tripId, userId);
            if (!success)
                return notFound('Journey not found or access denied.');
            return (0, _shared_1.ok)({ success });
        });
    if (W)
        server.registerTool('create_journey_entry', {
            description: 'Create a new entry in a journey.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
                entry_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Entry date (YYYY-MM-DD)'),
                title: zod_1.z.string().max(300).optional(),
                story: zod_1.z.string().optional(),
                entry_time: zod_1.z.string().optional().describe('Time of day (e.g. "14:30")'),
                location_name: zod_1.z.string().optional(),
                mood: zod_1.z.string().optional(),
                sort_order: zod_1.z.number().int().min(0).optional(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ journeyId, entry_date, title, story, entry_time, location_name, mood, sort_order }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const entry = (0, journeyService_1.createEntry)(journeyId, userId, { entry_date, title, story, entry_time, location_name, mood, sort_order });
            if (!entry)
                return notFound('Journey not found or access denied.');
            // Return through the listEntries enrichment (parsed tags/pros_cons, photos, source_trip_name).
            const enriched = (0, journeyService_1.listEntries)(journeyId, userId)?.find(e => e.id === entry.id) ?? entry;
            return (0, _shared_1.ok)({ entry: enriched });
        });
    if (W)
        server.registerTool('update_journey_entry', {
            description: 'Update an existing journey entry.',
            inputSchema: {
                entryId: zod_1.z.number().int().positive(),
                title: zod_1.z.string().max(300).optional(),
                story: zod_1.z.string().optional(),
                entry_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
                entry_time: zod_1.z.string().optional(),
                mood: zod_1.z.string().optional(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ entryId, title, story, entry_date, entry_time, mood }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const entry = (0, journeyService_1.updateEntry)(entryId, userId, { title, story, entry_date, entry_time, mood }, undefined);
            if (!entry)
                return notFound('Entry not found or access denied.');
            // Return through the listEntries enrichment (parsed tags/pros_cons, photos), matching create_journey_entry.
            const enriched = (0, journeyService_1.listEntries)(entry.journey_id, userId)?.find(e => e.id === entry.id) ?? entry;
            return (0, _shared_1.ok)({ entry: enriched });
        });
    if (W)
        server.registerTool('delete_journey_entry', {
            description: 'Delete a journey entry.',
            inputSchema: {
                entryId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ entryId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const success = (0, journeyService_1.deleteEntry)(entryId, userId, undefined);
            if (!success)
                return notFound('Entry not found or access denied.');
            return (0, _shared_1.ok)({ success: true });
        });
    if (W)
        server.registerTool('reorder_journey_entries', {
            description: 'Reorder entries within a journey by providing the desired order of entry IDs.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
                orderedIds: zod_1.z.array(zod_1.z.number().int().positive()),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ journeyId, orderedIds }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const success = (0, journeyService_1.reorderEntries)(journeyId, userId, orderedIds, undefined);
            if (!success)
                return notFound('Journey not found, access denied, or entry IDs do not belong to this journey.');
            return (0, _shared_1.ok)({ success: true });
        });
    if (W)
        server.registerTool('add_journey_contributor', {
            description: 'Add a contributor to a journey. Owner only.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
                targetUserId: zod_1.z.number().int().positive(),
                role: zod_1.z.enum(['editor', 'viewer']),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ journeyId, targetUserId, role }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const success = (0, journeyService_1.addContributor)(journeyId, userId, targetUserId, role);
            if (!success)
                return notFound('Journey not found or access denied.');
            return (0, _shared_1.ok)({ success: true });
        });
    if (W)
        server.registerTool('update_journey_contributor_role', {
            description: 'Update the role of a journey contributor. Owner only.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
                targetUserId: zod_1.z.number().int().positive(),
                role: zod_1.z.enum(['editor', 'viewer']),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ journeyId, targetUserId, role }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const success = (0, journeyService_1.updateContributorRole)(journeyId, userId, targetUserId, role);
            if (!success)
                return notFound('Journey not found or access denied.');
            return (0, _shared_1.ok)({ success: true });
        });
    if (W)
        server.registerTool('remove_journey_contributor', {
            description: 'Remove a contributor from a journey. Owner only.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
                targetUserId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ journeyId, targetUserId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const success = (0, journeyService_1.removeContributor)(journeyId, userId, targetUserId);
            if (!success)
                return notFound('Journey not found or access denied.');
            return (0, _shared_1.ok)({ success: true });
        });
    if (W)
        server.registerTool('update_journey_preferences', {
            description: 'Update per-user preferences for a journey (e.g. hide skeleton entries).',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
                hide_skeletons: zod_1.z.boolean().optional(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ journeyId, hide_skeletons }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const result = (0, journeyService_1.updateJourneyPreferences)(journeyId, userId, { hide_skeletons });
            if (!result)
                return notFound('Journey not found or access denied.');
            // Return the service result ({ hide_skeletons }), matching the REST route.
            return (0, _shared_1.ok)(result);
        });
    // --- SHARE TOOLS ---
    if (S)
        server.registerTool('get_journey_share_link', {
            description: 'Get the current public share link for a journey. Returns null if none exists.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ journeyId }) => {
            if (!(0, journeyService_1.canAccessJourney)(journeyId, userId))
                return notFound('Journey not found or access denied.');
            const shareLink = (0, journeyShareService_1.getJourneyShareLink)(journeyId);
            return (0, _shared_1.ok)({ shareLink });
        });
    if (S)
        server.registerTool('create_journey_share_link', {
            description: 'Create or update the public share link for a journey. Owner only.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ journeyId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const shareLink = (0, journeyShareService_1.createOrUpdateJourneyShareLink)(journeyId, userId, {});
            if (!shareLink)
                return notFound('Journey not found or access denied.');
            return (0, _shared_1.ok)({ shareLink });
        });
    if (S)
        server.registerTool('delete_journey_share_link', {
            description: 'Revoke the public share link for a journey. Owner only.',
            inputSchema: {
                journeyId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ journeyId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const success = (0, journeyShareService_1.deleteJourneyShareLink)(journeyId, userId);
            if (!success)
                return notFound('Journey not found or access denied.');
            return (0, _shared_1.ok)({ success: true });
        });
}
