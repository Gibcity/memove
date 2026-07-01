import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { isAddonEnabled } from '../../services/adminService';
import { ADDON_IDS } from '../../addons';
import { RelocationService } from '../../nest/relocation/relocation.service';
import { ok } from './_shared';
import { canRead } from '../scopes';
import { createDbAdapter } from '../_dbAdapter';
import { db } from '../../db/database';
import { costToolDefs } from '../tool-registry';

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

const relocationService = new RelocationService(createDbAdapter(db));

export function registerCostAnalysisTools(
  server: McpServer,
  _userId: number,
  scopes: string[] | null,
): void {
  if (!isAddonEnabled(ADDON_IDS.RELOCATION)) return;
  const R = canRead(scopes, 'relocation');

  const tools = costToolDefs();
  for (const def of tools) {
    if (def.scope === 'read' && !R) continue;
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: def.annotations,
      },
      // ponytail: pass relocation service for interface completeness; the cost
      // handlers resolve locations via the shared loader instead of the service.
      async (args) => ok(await def.handler({ relocation: relocationService }, args as Record<string, unknown>, String(_userId))),
    );
  }
}
