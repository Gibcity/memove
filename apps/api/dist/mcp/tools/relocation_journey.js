"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerJourneyTools = registerJourneyTools;
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
const relocation_service_1 = require("../../nest/relocation/relocation.service");
const relocation_journey_service_1 = require("../../nest/relocation/relocation-journey.service");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
const _dbAdapter_1 = require("../_dbAdapter");
const database_1 = require("../../db/database");
const tool_registry_1 = require("../tool-registry");
/**
 * MCP tools for the relocation journey state — the persistent workspace
 * that tracks a user's relocation progress across sessions and agents.
 *
 * 7 tools: get_relocation_journey, shortlist_location, eliminate_location,
 *          update_relocation_preferences, toggle_move_task, save_comparison, set_phase
 *
 * The MCP layer doesn't use Nest DI, so we adapt the raw db singleton
 * into a DatabaseService-shaped object (same pattern as relocation.ts
 * which constructs RelocationService without DI).
 */
const relocationService = new relocation_service_1.RelocationService((0, _dbAdapter_1.createDbAdapter)(database_1.db));
const journeyService = new relocation_journey_service_1.RelocationJourneyService((0, _dbAdapter_1.createDbAdapter)(database_1.db));
function registerJourneyTools(server, userId, scopes) {
    if (!(0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.RELOCATION))
        return;
    const R = (0, scopes_1.canRead)(scopes, 'relocation');
    const W = (0, scopes_1.canWrite)(scopes, 'relocation');
    const tools = (0, tool_registry_1.journeyToolDefs)();
    for (const def of tools) {
        if (def.scope === 'write' && !W)
            continue;
        if (def.scope === 'read' && !R)
            continue;
        // ponytail: capture per-request userId in the closure so MCP-registered
        // tools resolve to the requesting user — same behavior as the original
        // explicit `server.registerTool(...)` calls.
        const uid = String(userId);
        server.registerTool(def.name, {
            description: def.description,
            inputSchema: def.inputSchema,
            annotations: def.annotations,
        }, async (args) => (0, _shared_1.ok)(await def.handler({ relocation: relocationService, journey: journeyService }, args, uid)));
    }
}
