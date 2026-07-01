"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCostAnalysisTools = registerCostAnalysisTools;
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
const relocation_service_1 = require("../../nest/relocation/relocation.service");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
const _dbAdapter_1 = require("../_dbAdapter");
const database_1 = require("../../db/database");
const tool_registry_1 = require("../tool-registry");
/**
 * MCP tools for the Cost of Living Deep-Dive agent.
 *
 * 4 tools: compare_cost_of_living, tax_impact_calculator,
 *          salary_adjustment, cost_breakdown
 *
 * Scope-gated: relocation:read for all ops.
 *
 * The handlers live in tool-registry.ts so the chat agent path can call them
 * with the same code. This file is the MCP-facing adapter.
 */
const relocationService = new relocation_service_1.RelocationService((0, _dbAdapter_1.createDbAdapter)(database_1.db));
function registerCostAnalysisTools(server, _userId, scopes) {
    if (!(0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.RELOCATION))
        return;
    const R = (0, scopes_1.canRead)(scopes, 'relocation');
    const tools = (0, tool_registry_1.costToolDefs)();
    for (const def of tools) {
        if (def.scope === 'read' && !R)
            continue;
        server.registerTool(def.name, {
            description: def.description,
            inputSchema: def.inputSchema,
            annotations: def.annotations,
        }, 
        // ponytail: pass relocation service for interface completeness; the cost
        // handlers resolve locations via the shared loader instead of the service.
        async (args) => (0, _shared_1.ok)(await def.handler({ relocation: relocationService }, args, String(_userId))));
    }
}
