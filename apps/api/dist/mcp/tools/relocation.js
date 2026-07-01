"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRelocationTools = registerRelocationTools;
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
const relocation_service_1 = require("../../nest/relocation/relocation.service");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
const _dbAdapter_1 = require("../_dbAdapter");
const database_1 = require("../../db/database");
const tool_registry_1 = require("../tool-registry");
/**
 * MCP tools for the relocation add-on.
 *
 * 7 tools: search_locations, score_locations, compare_locations,
 *          explain_score, fiscal_health, update_relocation_profile,
 *          get_relocation_profile
 *
 * Registered per the isAddonEnabled(ADDON_IDS.RELOCATION) gating pattern.
 * Scope-gated: relocation:read for read ops, relocation:write for mutation.
 */
const relocationService = new relocation_service_1.RelocationService((0, _dbAdapter_1.createDbAdapter)(database_1.db));
function registerRelocationTools(server, userId, scopes) {
    if (!(0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.RELOCATION))
        return;
    const R = (0, scopes_1.canRead)(scopes, 'relocation');
    const W = (0, scopes_1.canWrite)(scopes, 'relocation');
    const tools = (0, tool_registry_1.coreTools)();
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
        }, async (args) => (0, _shared_1.ok)(await def.handler({ relocation: relocationService }, args, uid)));
    }
}
