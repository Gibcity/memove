"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerResources = registerResources;
const mcp_1 = require("@modelcontextprotocol/sdk/server/mcp");
const database_1 = require("../db/database");
const tripService_1 = require("../services/tripService");
const dayService_1 = require("../services/dayService");
const placeService_1 = require("../services/placeService");
const budgetService_1 = require("../services/budgetService");
const packingService_1 = require("../services/packingService");
const reservationService_1 = require("../services/reservationService");
const dayNoteService_1 = require("../services/dayNoteService");
const collabService_1 = require("../services/collabService");
const todoService_1 = require("../services/todoService");
const categoryService_1 = require("../services/categoryService");
const atlasService_1 = require("../services/atlasService");
const inAppNotifications_1 = require("../services/inAppNotifications");
const vacayService_1 = require("../services/vacayService");
const adminService_1 = require("../services/adminService");
const addons_1 = require("../addons");
const journeyService_1 = require("../services/journeyService");
const relocation_service_1 = require("../nest/relocation/relocation.service");
const _dbAdapter_1 = require("./_dbAdapter");
const scopes_1 = require("./scopes");
function parseId(value) {
    const n = Number(Array.isArray(value) ? value[0] : value);
    return Number.isInteger(n) && n > 0 ? n : null;
}
function accessDenied(uri) {
    return {
        contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({ error: 'Trip not found or access denied' }),
            }],
    };
}
function scopeDenied(uri) {
    return {
        contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify({ error: 'Insufficient OAuth scope to access this resource' }),
            }],
    };
}
function jsonContent(uri, data) {
    return {
        contents: [{
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(data, null, 2),
            }],
    };
}
function registerResources(server, userId, scopes) {
    // List all accessible trips
    if ((0, scopes_1.canReadTrips)(scopes))
        server.registerResource('trips', 'memove://trips', { description: 'All trips the user owns or is a member of', mimeType: 'application/json' }, async (uri) => {
            const trips = (0, tripService_1.listTrips)(userId, 0);
            return jsonContent(uri.href, trips);
        });
    // Single trip detail
    if ((0, scopes_1.canReadTrips)(scopes))
        server.registerResource('trip', new mcp_1.ResourceTemplate('memove://trips/{tripId}', { list: undefined }), { description: 'A single trip with metadata and member count', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const trip = (0, tripService_1.getTrip)(id, userId);
            return jsonContent(uri.href, trip);
        });
    // Days with assigned places
    if ((0, scopes_1.canReadTrips)(scopes))
        server.registerResource('trip-days', new mcp_1.ResourceTemplate('memove://trips/{tripId}/days', { list: undefined }), { description: 'Days of a trip with their assigned places', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const { days } = (0, dayService_1.listDays)(id);
            return jsonContent(uri.href, days);
        });
    // Places in a trip
    if ((0, scopes_1.canRead)(scopes, 'places'))
        server.registerResource('trip-places', new mcp_1.ResourceTemplate('memove://trips/{tripId}/places', { list: undefined }), { description: 'All places/POIs in a trip, optionally filtered by assignment status (e.g. ?assignment=unassigned)', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const assignment = uri.searchParams.get('assignment');
            const places = (0, placeService_1.listPlaces)(String(id), { assignment: assignment ?? undefined });
            return jsonContent(uri.href, places);
        });
    // Budget items
    if ((0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.BUDGET) && (0, scopes_1.canRead)(scopes, 'budget'))
        server.registerResource('trip-budget', new mcp_1.ResourceTemplate('memove://trips/{tripId}/budget', { list: undefined }), { description: 'Budget and expense items for a trip', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const items = (0, budgetService_1.listBudgetItems)(id);
            return jsonContent(uri.href, items);
        });
    // Packing checklist
    if ((0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.PACKING) && (0, scopes_1.canRead)(scopes, 'packing'))
        server.registerResource('trip-packing', new mcp_1.ResourceTemplate('memove://trips/{tripId}/packing', { list: undefined }), { description: 'Packing checklist for a trip', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const items = (0, packingService_1.listItems)(id);
            return jsonContent(uri.href, items);
        });
    // Reservations (flights, hotels, restaurants)
    if ((0, scopes_1.canRead)(scopes, 'reservations'))
        server.registerResource('trip-reservations', new mcp_1.ResourceTemplate('memove://trips/{tripId}/reservations', { list: undefined }), { description: 'Reservations (flights, hotels, restaurants) for a trip', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const reservations = (0, reservationService_1.listReservations)(id);
            return jsonContent(uri.href, reservations);
        });
    // Day notes
    if ((0, scopes_1.canReadTrips)(scopes))
        server.registerResource('day-notes', new mcp_1.ResourceTemplate('memove://trips/{tripId}/days/{dayId}/notes', { list: undefined }), { description: 'Notes for a specific day in a trip', mimeType: 'application/json' }, async (uri, { tripId, dayId }) => {
            const tId = parseId(tripId);
            const dId = parseId(dayId);
            if (tId === null || dId === null || !(0, database_1.canAccessTrip)(tId, userId))
                return accessDenied(uri.href);
            const notes = (0, dayNoteService_1.listNotes)(dId, tId);
            return jsonContent(uri.href, notes);
        });
    // Accommodations (hotels, rentals) per trip
    if ((0, scopes_1.canReadTrips)(scopes))
        server.registerResource('trip-accommodations', new mcp_1.ResourceTemplate('memove://trips/{tripId}/accommodations', { list: undefined }), { description: 'Accommodations (hotels, rentals) for a trip with check-in/out details', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const accommodations = (0, dayService_1.listAccommodations)(id);
            return jsonContent(uri.href, accommodations);
        });
    // Trip members (owner + collaborators)
    if ((0, scopes_1.canReadTrips)(scopes))
        server.registerResource('trip-members', new mcp_1.ResourceTemplate('memove://trips/{tripId}/members', { list: undefined }), { description: 'Owner and collaborators of a trip', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const ownerRow = (0, tripService_1.getTripOwner)(id);
            if (!ownerRow)
                return accessDenied(uri.href);
            const { owner, members } = (0, tripService_1.listMembers)(id, ownerRow.user_id);
            return jsonContent(uri.href, { owner, members });
        });
    // Collab notes for a trip
    const collabFeatures = (0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.COLLAB) ? (0, adminService_1.getCollabFeatures)() : null;
    if (collabFeatures?.notes && (0, scopes_1.canRead)(scopes, 'collab'))
        server.registerResource('trip-collab-notes', new mcp_1.ResourceTemplate('memove://trips/{tripId}/collab-notes', { list: undefined }), { description: 'Shared collaborative notes for a trip', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const notes = (0, collabService_1.listNotes)(id);
            return jsonContent(uri.href, notes);
        });
    // Trip to-do list
    if ((0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.PACKING) && (0, scopes_1.canRead)(scopes, 'todos'))
        server.registerResource('trip-todos', new mcp_1.ResourceTemplate('memove://trips/{tripId}/todos', { list: undefined }), { description: 'To-do items for a trip, ordered by position', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const items = (0, todoService_1.listItems)(id);
            return jsonContent(uri.href, items);
        });
    // All place categories (global, no trip filter) — safe for any authenticated session
    server.registerResource('categories', 'memove://categories', { description: 'All available place categories (id, name, color, icon) for use when creating places', mimeType: 'application/json' }, async (uri) => {
        const categories = (0, categoryService_1.listCategories)();
        return jsonContent(uri.href, categories);
    });
    // User's bucket list
    if ((0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.ATLAS) && (0, scopes_1.canRead)(scopes, 'atlas'))
        server.registerResource('bucket-list', 'memove://bucket-list', { description: 'Your personal travel bucket list', mimeType: 'application/json' }, async (uri) => {
            const items = (0, atlasService_1.listBucketList)(userId);
            return jsonContent(uri.href, items);
        });
    // User's visited countries
    if ((0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.ATLAS) && (0, scopes_1.canRead)(scopes, 'atlas'))
        server.registerResource('visited-countries', 'memove://visited-countries', { description: 'Countries you have marked as visited in Atlas', mimeType: 'application/json' }, async (uri) => {
            const countries = (0, atlasService_1.listVisitedCountries)(userId);
            return jsonContent(uri.href, countries);
        });
    // Budget per-person summary
    if ((0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.BUDGET) && (0, scopes_1.canRead)(scopes, 'budget'))
        server.registerResource('trip-budget-per-person', new mcp_1.ResourceTemplate('memove://trips/{tripId}/budget/per-person', { list: undefined }), { description: 'Per-person budget summary for a trip (total spent per member, split breakdown)', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const summary = (0, budgetService_1.getPerPersonSummary)(id);
            return jsonContent(uri.href, summary);
        });
    // Budget settlement
    if ((0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.BUDGET) && (0, scopes_1.canRead)(scopes, 'budget'))
        server.registerResource('trip-budget-settlement', new mcp_1.ResourceTemplate('memove://trips/{tripId}/budget/settlement', { list: undefined }), { description: 'Suggested settlement transactions to balance who owes whom', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const settlement = (0, budgetService_1.calculateSettlement)(id);
            return jsonContent(uri.href, settlement);
        });
    // Packing bags
    if ((0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.PACKING) && (0, scopes_1.canRead)(scopes, 'packing'))
        server.registerResource('trip-packing-bags', new mcp_1.ResourceTemplate('memove://trips/{tripId}/packing/bags', { list: undefined }), { description: 'All packing bags for a trip with their members', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const bags = (0, packingService_1.listBags)(id);
            return jsonContent(uri.href, bags);
        });
    // In-app notifications
    if ((0, scopes_1.canRead)(scopes, 'notifications'))
        server.registerResource('notifications-in-app', 'memove://notifications/in-app', { description: "The current user's in-app notifications (most recent 50, unread first)", mimeType: 'application/json' }, async (uri) => {
            const result = (0, inAppNotifications_1.getNotifications)(userId, { limit: 50 });
            return jsonContent(uri.href, result);
        });
    // Atlas stats and regions (addon-gated)
    if ((0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.ATLAS) && (0, scopes_1.canRead)(scopes, 'atlas')) {
        server.registerResource('atlas-stats', 'memove://atlas/stats', { description: "User's atlas statistics — visited country counts and breakdown", mimeType: 'application/json' }, async (uri) => {
            const stats = await (0, atlasService_1.getStats)(userId);
            return jsonContent(uri.href, stats);
        });
        server.registerResource('atlas-regions', 'memove://atlas/regions', { description: 'List of manually visited regions for the current user', mimeType: 'application/json' }, async (uri) => {
            const regions = (0, atlasService_1.listManuallyVisitedRegions)(userId);
            return jsonContent(uri.href, regions);
        });
    }
    // Collab polls (addon + sub-feature gated)
    if (collabFeatures?.polls && (0, scopes_1.canRead)(scopes, 'collab')) {
        server.registerResource('trip-collab-polls', new mcp_1.ResourceTemplate('memove://trips/{tripId}/collab/polls', { list: undefined }), { description: 'All polls for a trip with vote counts per option', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const polls = (0, collabService_1.listPolls)(id);
            return jsonContent(uri.href, polls);
        });
    }
    // Collab messages (addon + sub-feature gated)
    if (collabFeatures?.chat && (0, scopes_1.canRead)(scopes, 'collab')) {
        server.registerResource('trip-collab-messages', new mcp_1.ResourceTemplate('memove://trips/{tripId}/collab/messages', { list: undefined }), { description: 'Most recent 100 chat messages for a trip', mimeType: 'application/json' }, async (uri, { tripId }) => {
            const id = parseId(tripId);
            if (id === null || !(0, database_1.canAccessTrip)(id, userId))
                return accessDenied(uri.href);
            const messages = (0, collabService_1.listMessages)(id);
            return jsonContent(uri.href, messages);
        });
    }
    // Vacay resources (addon-gated)
    if ((0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.VACAY) && (0, scopes_1.canRead)(scopes, 'vacay')) {
        server.registerResource('vacay-plan', 'memove://vacay/plan', { description: "Full snapshot of the user's active vacation plan (members, years, settings)", mimeType: 'application/json' }, async (uri) => {
            const plan = (0, vacayService_1.getPlanData)(userId);
            return jsonContent(uri.href, plan);
        });
        server.registerResource('vacay-entries', new mcp_1.ResourceTemplate('memove://vacay/entries/{year}', { list: undefined }), { description: 'All vacation entries for the active plan and a specific year', mimeType: 'application/json' }, async (uri, { year }) => {
            const planId = (0, vacayService_1.getActivePlanId)(userId);
            const entries = (0, vacayService_1.getEntries)(planId, Array.isArray(year) ? year[0] : year);
            return jsonContent(uri.href, entries);
        });
        server.registerResource('vacay-holidays', new mcp_1.ResourceTemplate('memove://vacay/holidays/{year}', { list: undefined }), { description: "Cached public holidays for the plan's configured region and year", mimeType: 'application/json' }, async (uri, { year }) => {
            const plan = (0, vacayService_1.getActivePlan)(userId);
            if (!plan.holidays_enabled || !plan.holidays_region)
                return jsonContent(uri.href, []);
            const yearStr = Array.isArray(year) ? year[0] : year;
            const result = await (0, vacayService_1.getHolidays)(yearStr, plan.holidays_region);
            return jsonContent(uri.href, result.data ?? []);
        });
    }
    // Journey resources (Journey addon)
    if ((0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.JOURNEY) && (0, scopes_1.canRead)(scopes, 'journey')) {
        server.registerResource('journeys', 'memove://journeys', { description: 'All journeys owned or contributed to by the current user', mimeType: 'application/json' }, async (uri) => {
            const journeys = (0, journeyService_1.listJourneys)(userId);
            return jsonContent(uri.href, journeys);
        });
        server.registerResource('journey-detail', new mcp_1.ResourceTemplate('memove://journeys/{journeyId}', { list: undefined }), { description: 'Single journey with entries, contributors, and trip links', mimeType: 'application/json' }, async (uri, { journeyId }) => {
            const id = parseId(journeyId);
            if (id === null)
                return accessDenied(uri.href);
            const journey = (0, journeyService_1.getJourneyFull)(id, userId);
            if (!journey)
                return accessDenied(uri.href);
            return jsonContent(uri.href, journey);
        });
        server.registerResource('journey-entries', new mcp_1.ResourceTemplate('memove://journeys/{journeyId}/entries', { list: undefined }), { description: 'All entries in a journey (date, text, mood, linked trip)', mimeType: 'application/json' }, async (uri, { journeyId }) => {
            const id = parseId(journeyId);
            if (id === null)
                return accessDenied(uri.href);
            const j = (0, journeyService_1.canAccessJourney)(id, userId);
            if (!j)
                return accessDenied(uri.href);
            const entries = (0, journeyService_1.listEntries)(id, userId);
            return jsonContent(uri.href, entries);
        });
        server.registerResource('journey-contributors', new mcp_1.ResourceTemplate('memove://journeys/{journeyId}/contributors', { list: undefined }), { description: 'Contributors (owners and collaborators) of a journey', mimeType: 'application/json' }, async (uri, { journeyId }) => {
            const id = parseId(journeyId);
            if (id === null)
                return accessDenied(uri.href);
            const j = (0, journeyService_1.getJourneyFull)(id, userId);
            if (!j)
                return accessDenied(uri.href);
            return jsonContent(uri.href, j.contributors ?? []);
        });
    }
    // Relocation resources (relocation addon)
    if ((0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.RELOCATION) && (0, scopes_1.canRead)(scopes, 'relocation')) {
        const relocService = new relocation_service_1.RelocationService((0, _dbAdapter_1.createDbAdapter)(database_1.db));
        server.registerResource('relocation-locations', 'memove://relocation/locations', {
            description: 'List of all US metro areas available for relocation scoring',
            mimeType: 'application/json',
        }, async (uri) => {
            const result = relocService.searchLocations({ limit: 9999 });
            return jsonContent(uri.href, result);
        });
        server.registerResource('relocation-location-detail', new mcp_1.ResourceTemplate('memove://relocation/locations/{locationId}', { list: undefined }), {
            description: 'Full relocation data for a single metro area',
            mimeType: 'application/json',
        }, async (uri, { locationId }) => {
            const id = Array.isArray(locationId) ? locationId[0] : locationId;
            const loc = relocService.getLocationById(id);
            if (!loc)
                return jsonContent(uri.href, { error: 'Location not found' });
            return jsonContent(uri.href, loc);
        });
        server.registerResource('relocation-location-provenance', new mcp_1.ResourceTemplate('memove://relocation/locations/{locationId}/provenance', { list: undefined }), {
            description: 'Per-metric provenance for a relocation candidate',
            mimeType: 'application/json',
        }, async (uri, { locationId }) => {
            const id = Array.isArray(locationId) ? locationId[0] : locationId;
            const loc = relocService.getLocationById(id);
            if (!loc)
                return jsonContent(uri.href, { error: 'Location not found' });
            return jsonContent(uri.href, loc.metricsProvenance ?? {});
        });
        server.registerResource('relocation-profile', 'memove://relocation/profile', {
            description: "Current user\'s relocation profile",
            mimeType: 'application/json',
        }, async (uri) => {
            const profile = relocService.getUserProfile(String(userId));
            return jsonContent(uri.href, profile);
        });
        server.registerResource('relocation-scored-list', 'memove://relocation/scored-list', {
            description: 'Top-K scored relocation candidates for the current user',
            mimeType: 'application/json',
        }, async (uri) => {
            const profile = relocService.getUserProfile(String(userId));
            const softWeights = profile.softWeights;
            const maxW = Math.max(...Object.values(softWeights), 0.01);
            const intWeights = {};
            for (const [k, v] of Object.entries(softWeights)) {
                intWeights[k] = Math.max(1, Math.round((v / maxW) * 5));
            }
            const result = relocService.scoreLocations({ weights: intWeights, limit: 50 });
            return jsonContent(uri.href, result);
        });
        server.registerResource('relocation-scored-list-decision-trace', 'memove://relocation/scored-list/decision-trace', {
            description: 'Why each top candidate scored as it did',
            mimeType: 'application/json',
        }, async (uri) => {
            const profile = relocService.getUserProfile(String(userId));
            const softWeights = profile.softWeights;
            const maxW = Math.max(...Object.values(softWeights), 0.01);
            const intWeights = {};
            for (const [k, v] of Object.entries(softWeights)) {
                intWeights[k] = Math.max(1, Math.round((v / maxW) * 5));
            }
            const result = relocService.scoreLocations({ weights: intWeights, limit: 10 });
            const withTraces = result.topMatches.map((m) => {
                const explain = relocService.explainScore(m.id, intWeights);
                return { ...m, explanation: 'error' in explain ? null : explain.explanation };
            });
            return jsonContent(uri.href, { topMatches: withTraces, profileSnapshot: profile });
        });
        server.registerResource('relocation-profile-elicitation-state', 'memove://relocation/profile/elicitation-state', {
            description: "Current user\'s elicitation round state",
            mimeType: 'application/json',
        }, async (uri) => {
            const profile = relocService.getUserProfile(String(userId));
            return jsonContent(uri.href, {
                roundsCompleted: profile.elicitationRoundsCompleted,
                signalCount: profile.implicitSignalCount,
                hardFilters: profile.hardFilters,
                nonNegotiablesDiscovered: profile.nonNegotiablesDiscovered,
            });
        });
    }
}
