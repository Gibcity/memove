"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAtlasTools = registerAtlasTools;
const zod_1 = require("zod");
const authService_1 = require("../../services/authService");
const atlasService_1 = require("../../services/atlasService");
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
function registerAtlasTools(server, userId, scopes) {
    const R = (0, scopes_1.canRead)(scopes, 'atlas');
    const W = (0, scopes_1.canWrite)(scopes, 'atlas');
    if (!(0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.ATLAS))
        return;
    // --- BUCKET LIST ---
    if (W)
        server.registerTool('create_bucket_list_item', {
            description: 'Add a destination to your personal travel bucket list.',
            inputSchema: {
                name: zod_1.z.string().min(1).max(200).describe('Destination or experience name'),
                lat: zod_1.z.number().optional(),
                lng: zod_1.z.number().optional(),
                country_code: zod_1.z.string().length(2).toUpperCase().optional().describe('ISO 3166-1 alpha-2 country code'),
                notes: zod_1.z.string().max(1000).optional(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ name, lat, lng, country_code, notes }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const item = (0, atlasService_1.createBucketItem)(userId, { name, lat, lng, country_code, notes });
            return (0, _shared_1.ok)({ item });
        });
    if (W)
        server.registerTool('delete_bucket_list_item', {
            description: 'Remove an item from your travel bucket list.',
            inputSchema: {
                itemId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ itemId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const deleted = (0, atlasService_1.deleteBucketItem)(userId, itemId);
            if (!deleted)
                return { content: [{ type: 'text', text: 'Bucket list item not found.' }], isError: true };
            return (0, _shared_1.ok)({ success: true });
        });
    // --- ATLAS ---
    if (W)
        server.registerTool('mark_country_visited', {
            description: 'Mark a country as visited in your Atlas.',
            inputSchema: {
                country_code: zod_1.z.string().length(2).toUpperCase().describe('ISO 3166-1 alpha-2 country code (e.g. "FR", "JP")'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ country_code }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            (0, atlasService_1.markCountryVisited)(userId, country_code.toUpperCase());
            return (0, _shared_1.ok)({ success: true, country_code: country_code.toUpperCase() });
        });
    if (W)
        server.registerTool('unmark_country_visited', {
            description: 'Remove a country from your visited countries in Atlas.',
            inputSchema: {
                country_code: zod_1.z.string().length(2).toUpperCase().describe('ISO 3166-1 alpha-2 country code'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ country_code }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            (0, atlasService_1.unmarkCountryVisited)(userId, country_code.toUpperCase());
            return (0, _shared_1.ok)({ success: true, country_code: country_code.toUpperCase() });
        });
    // --- ATLAS EXPANDED ---
    if (R)
        server.registerTool('get_atlas_stats', {
            description: 'Get atlas statistics — total visited countries, region counts, continent breakdown.',
            inputSchema: {},
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async () => {
            const stats = await (0, atlasService_1.getStats)(userId);
            return (0, _shared_1.ok)({ stats });
        });
    if (R)
        server.registerTool('list_visited_regions', {
            description: 'List all manually visited sub-country regions for the current user.',
            inputSchema: {},
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async () => {
            const regions = (0, atlasService_1.listManuallyVisitedRegions)(userId);
            return (0, _shared_1.ok)({ regions });
        });
    if (W)
        server.registerTool('mark_region_visited', {
            description: 'Mark a sub-country region as visited.',
            inputSchema: {
                regionCode: zod_1.z.string().describe('ISO region code e.g. US-CA'),
                regionName: zod_1.z.string(),
                countryCode: zod_1.z.string().describe('ISO 3166-1 alpha-2 country code'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ regionCode, regionName, countryCode }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            (0, atlasService_1.markRegionVisited)(userId, regionCode, regionName, countryCode);
            const row = (0, atlasService_1.listManuallyVisitedRegions)(userId).find(r => r.region_code === regionCode);
            // Echo in the client-facing shape ({ code, name, ... }) rather than raw DB columns.
            const region = row
                ? { code: row.region_code, name: row.region_name, country_code: row.country_code, manuallyMarked: true }
                : undefined;
            return (0, _shared_1.ok)({ region });
        });
    if (W)
        server.registerTool('unmark_region_visited', {
            description: 'Remove a region from the visited list.',
            inputSchema: {
                regionCode: zod_1.z.string(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ regionCode }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            (0, atlasService_1.unmarkRegionVisited)(userId, regionCode);
            return (0, _shared_1.ok)({ success: true });
        });
    if (R)
        server.registerTool('get_country_atlas_places', {
            description: 'Get places saved in the user\'s atlas for a specific country.',
            inputSchema: {
                countryCode: zod_1.z.string().describe('ISO 3166-1 alpha-2 country code'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ countryCode }) => {
            const result = (0, atlasService_1.getCountryPlaces)(userId, countryCode);
            return (0, _shared_1.ok)(result);
        });
    if (W)
        server.registerTool('update_bucket_list_item', {
            description: 'Update a bucket list item (notes, name, target date, location).',
            inputSchema: {
                itemId: zod_1.z.number().int().positive(),
                name: zod_1.z.string().optional(),
                notes: zod_1.z.string().optional(),
                lat: zod_1.z.number().nullable().optional(),
                lng: zod_1.z.number().nullable().optional(),
                country_code: zod_1.z.string().optional(),
                target_date: zod_1.z.string().nullable().optional(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ itemId, name, notes, lat, lng, country_code, target_date }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const item = (0, atlasService_1.updateBucketItem)(userId, itemId, { name, notes, lat, lng, country_code, target_date });
            if (!item)
                return { content: [{ type: 'text', text: 'Bucket list item not found.' }], isError: true };
            return (0, _shared_1.ok)({ item });
        });
}
