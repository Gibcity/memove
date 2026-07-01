"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerLogisticsTools = registerLogisticsTools;
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
 * MCP tools for the Moving Logistics Planner agent.
 *
 * 4 tools: plan_move_timeline, estimate_moving_costs,
 *          utility_setup_checklist, mark_move_task_complete
 *
 * Scope-gated: relocation:read for read ops, relocation:write for mutation.
 * Handlers live in tool-registry.ts.
 */
const relocationService = new relocation_service_1.RelocationService((0, _dbAdapter_1.createDbAdapter)(database_1.db));
const journeyService = new relocation_journey_service_1.RelocationJourneyService((0, _dbAdapter_1.createDbAdapter)(database_1.db));
function registerLogisticsTools(server, userId, scopes) {
    if (!(0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.RELOCATION))
        return;
    const R = (0, scopes_1.canRead)(scopes, 'relocation');
    const W = (0, scopes_1.canWrite)(scopes, 'relocation');
    const tools = (0, tool_registry_1.logisticsToolDefs)();
    for (const def of tools) {
        if (def.scope === 'write' && !W)
            continue;
        if (def.scope === 'read' && !R)
            continue;
        const uid = String(userId);
        server.registerTool(def.name, {
            description: def.description,
            inputSchema: def.inputSchema,
            annotations: def.annotations,
        }, async (args) => (0, _shared_1.ok)(
        // ponytail: write tools need the journey service. Read tools use
        // only `relocation`. Passing both keeps one closure for all tools.
        await def.handler({ relocation: relocationService, journey: journeyService }, args, uid)));
    }
}
