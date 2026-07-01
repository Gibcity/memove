import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { isAddonEnabled } from '../../services/adminService';
import { ADDON_IDS } from '../../addons';
import { RelocationService } from '../../nest/relocation/relocation.service';
import { RelocationJourneyService } from '../../nest/relocation/relocation-journey.service';
import { ok } from './_shared';
import { canRead, canWrite } from '../scopes';
import { createDbAdapter } from '../_dbAdapter';
import { db } from '../../db/database';
import { logisticsToolDefs } from '../tool-registry';

/**
 * MCP tools for the Moving Logistics Planner agent.
 *
 * 4 tools: plan_move_timeline, estimate_moving_costs,
 *          utility_setup_checklist, mark_move_task_complete
 *
 * Scope-gated: relocation:read for read ops, relocation:write for mutation.
 * Handlers live in tool-registry.ts.
 */

const relocationService = new RelocationService(createDbAdapter(db));
const journeyService = new RelocationJourneyService(createDbAdapter(db));

export function registerLogisticsTools(
  server: McpServer,
  userId: number,
  scopes: string[] | null,
): void {
  if (!isAddonEnabled(ADDON_IDS.RELOCATION)) return;

  const R = canRead(scopes, 'relocation');
  const W = canWrite(scopes, 'relocation');

  const tools = logisticsToolDefs();
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
      async (args) =>
        ok(
          // ponytail: write tools need the journey service. Read tools use
          // only `relocation`. Passing both keeps one closure for all tools.
          await def.handler(
            { relocation: relocationService, journey: journeyService },
            args as Record<string, unknown>,
            uid,
          ),
        ),
    );
  }
}
