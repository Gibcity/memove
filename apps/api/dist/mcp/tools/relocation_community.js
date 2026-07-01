"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCommunityTools = registerCommunityTools;
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
const relocation_service_1 = require("../../nest/relocation/relocation.service");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
const _dbAdapter_1 = require("../_dbAdapter");
const database_1 = require("../../db/database");
const tool_registry_1 = require("../tool-registry");
/**
 * MCP tools for the Settlement & Community agent (post-decision phase).
 *
 * 4 tools: assess_healthcare_access, school_district_overview,
 *          community_fit_analysis, settlement_checklist
 *
 * All read-only. Registry is gated by the relocation add-on.
 *
 * Handlers live in tool-registry.ts.
 */
const relocationService = new relocation_service_1.RelocationService((0, _dbAdapter_1.createDbAdapter)(database_1.db));
function registerCommunityTools(server, _userId, scopes) {
    if (!(0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.RELOCATION))
        return;
    const R = (0, scopes_1.canRead)(scopes, 'relocation');
    if (!R)
        return;
    const tools = (0, tool_registry_1.communityToolDefs)();
    for (const def of tools) {
        server.registerTool(def.name, {
            description: def.description,
            inputSchema: def.inputSchema,
            annotations: def.annotations,
        }, async (args) => (0, _shared_1.ok)(await def.handler({ relocation: relocationService }, args, String(_userId))));
    }
}
