import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { isAddonEnabled } from '../../services/adminService';
import { ADDON_IDS } from '../../addons';
import { RelocationService } from '../../nest/relocation/relocation.service';
import { RelocationJourneyService } from '../../nest/relocation/relocation-journey.service';
import { ok } from './_shared';
import { canRead, canWrite } from '../scopes';
import { createDbAdapter } from '../_dbAdapter';
import { db } from '../../db/database';
import { journeyToolDefs } from '../tool-registry';

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

const relocationService = new RelocationService(createDbAdapter(db));
const journeyService = new RelocationJourneyService(createDbAdapter(db));

export function registerJourneyTools(
  server: McpServer,
  userId: number,
  scopes: string[] | null,
): void {
  if (!isAddonEnabled(ADDON_IDS.RELOCATION)) return;

  const R = canRead(scopes, 'relocation');
  const W = canWrite(scopes, 'relocation');

  const tools = journeyToolDefs();
  for (const def of tools) {
    if (def.scope === 'write' && !W) continue;
    if (def.scope === 'read' && !R) continue;
    // ponytail: capture per-request userId in the closure so MCP-registered
    // tools resolve to the requesting user — same behavior as the original
    // explicit `server.registerTool(...)` calls.
    const uid = String(userId);
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: def.annotations,
      },
      async (args) => ok(await def.handler({ relocation: relocationService, journey: journeyService }, args as Record<string, unknown>, uid)),
    );
  }
}
