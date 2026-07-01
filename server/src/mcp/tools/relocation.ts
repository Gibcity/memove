import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { isAddonEnabled } from '../../services/adminService';
import { ADDON_IDS } from '../../addons';
import { RelocationService } from '../../nest/relocation/relocation.service';
import { ok } from './_shared';
import { canRead, canWrite } from '../scopes';
import { createDbAdapter } from '../_dbAdapter';
import { db } from '../../db/database';
import { coreTools } from '../tool-registry';

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

const relocationService = new RelocationService(createDbAdapter(db));

export function registerRelocationTools(
  server: McpServer,
  userId: number,
  scopes: string[] | null,
): void {
  if (!isAddonEnabled(ADDON_IDS.RELOCATION)) return;

  const R = canRead(scopes, 'relocation');
  const W = canWrite(scopes, 'relocation');

  const tools = coreTools();
  for (const def of tools) {
    if (def.scope === 'write' && !W) continue;
    if (def.scope === 'read' && !R) continue;
    const uid = String(userId);
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: def.annotations,
      },
      async (args) => ok(await def.handler({ relocation: relocationService }, args as Record<string, unknown>, uid)),
    );
  }
}
