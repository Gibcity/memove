import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { isAddonEnabled } from '../../services/adminService';
import { ADDON_IDS } from '../../addons';
import { RelocationService } from '../../nest/relocation/relocation.service';
import { ok } from './_shared';
import { canRead } from '../scopes';
import { createDbAdapter } from '../_dbAdapter';
import { db } from '../../db/database';
import { communityToolDefs } from '../tool-registry';

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

const relocationService = new RelocationService(createDbAdapter(db));

export function registerCommunityTools(
  server: McpServer,
  _userId: number,
  scopes: string[] | null,
): void {
  if (!isAddonEnabled(ADDON_IDS.RELOCATION)) return;

  const R = canRead(scopes, 'relocation');
  if (!R) return;

  const tools = communityToolDefs();
  for (const def of tools) {
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: def.annotations,
      },
      async (args) => ok(await def.handler({ relocation: relocationService }, args as Record<string, unknown>, String(_userId))),
    );
  }
}
