"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPackingTools = registerPackingTools;
const zod_1 = require("zod");
const database_1 = require("../../db/database");
const authService_1 = require("../../services/authService");
const packingService_1 = require("../../services/packingService");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
function registerPackingTools(server, userId, scopes) {
    const R = (0, scopes_1.canRead)(scopes, 'packing');
    const W = (0, scopes_1.canWrite)(scopes, 'packing');
    if (!(0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.PACKING))
        return;
    // --- PACKING ---
    if (W)
        server.registerTool('create_packing_item', {
            description: 'Add an item to the packing checklist for a trip.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                name: zod_1.z.string().min(1).max(200),
                category: zod_1.z.string().max(100).optional().describe('Packing category (e.g. Clothes, Electronics)'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, name, category }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const item = (0, packingService_1.createItem)(tripId, { name, category: category || 'General' });
            (0, _shared_1.safeBroadcast)(tripId, 'packing:created', { item });
            return (0, _shared_1.ok)({ item });
        });
    if (W)
        server.registerTool('toggle_packing_item', {
            description: 'Check or uncheck a packing item.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                itemId: zod_1.z.number().int().positive(),
                checked: zod_1.z.boolean(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, itemId, checked }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const item = (0, packingService_1.updateItem)(tripId, itemId, { checked: checked ? 1 : 0 }, ['checked']);
            if (!item)
                return { content: [{ type: 'text', text: 'Packing item not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'packing:updated', { item });
            return (0, _shared_1.ok)({ item });
        });
    if (W)
        server.registerTool('delete_packing_item', {
            description: 'Remove an item from the packing checklist.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                itemId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ tripId, itemId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const deleted = (0, packingService_1.deleteItem)(tripId, itemId);
            if (!deleted)
                return { content: [{ type: 'text', text: 'Packing item not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'packing:deleted', { itemId });
            return (0, _shared_1.ok)({ success: true });
        });
    // --- PACKING (update) ---
    if (W)
        server.registerTool('update_packing_item', {
            description: 'Rename a packing item or change its category.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                itemId: zod_1.z.number().int().positive(),
                name: zod_1.z.string().min(1).max(200).optional(),
                category: zod_1.z.string().max(100).optional(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, itemId, name, category }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const bodyKeys = ['name', 'category'].filter(k => k === 'name' ? name !== undefined : category !== undefined);
            const item = (0, packingService_1.updateItem)(tripId, itemId, { name, category }, bodyKeys);
            if (!item)
                return { content: [{ type: 'text', text: 'Packing item not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'packing:updated', { item });
            return (0, _shared_1.ok)({ item });
        });
    // --- PACKING ADVANCED ---
    if (W)
        server.registerTool('reorder_packing_items', {
            description: 'Set the display order of packing items within a trip.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                orderedIds: zod_1.z.array(zod_1.z.number().int().positive()).describe('Packing item IDs in desired order'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, orderedIds }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            (0, packingService_1.reorderItems)(tripId, orderedIds);
            (0, _shared_1.safeBroadcast)(tripId, 'packing:reordered', { orderedIds });
            return (0, _shared_1.ok)({ success: true });
        });
    if (R)
        server.registerTool('list_packing_bags', {
            description: 'List all packing bags for a trip.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ tripId }) => {
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            const bags = (0, packingService_1.listBags)(tripId);
            return (0, _shared_1.ok)({ bags });
        });
    if (W)
        server.registerTool('create_packing_bag', {
            description: 'Create a new packing bag (e.g. "Carry-on", "Checked bag").',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                name: zod_1.z.string().min(1).max(100),
                color: zod_1.z.string().optional(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, name, color }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            // createBag returns a bare row; hydrate with the empty members array that
            // listBags and the schema always carry, so the client/AI consumer matches.
            const bag = { ...(0, packingService_1.createBag)(tripId, { name, color }), members: [] };
            (0, _shared_1.safeBroadcast)(tripId, 'packing:bag-created', { bag });
            return (0, _shared_1.ok)({ bag });
        });
    if (W)
        server.registerTool('update_packing_bag', {
            description: 'Rename or recolor a packing bag.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                bagId: zod_1.z.number().int().positive(),
                name: zod_1.z.string().optional(),
                color: zod_1.z.string().optional(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, bagId, name, color }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const fields = {};
            const bodyKeys = [];
            if (name !== undefined) {
                fields.name = name;
                bodyKeys.push('name');
            }
            if (color !== undefined) {
                fields.color = color;
                bodyKeys.push('color');
            }
            const updated = (0, packingService_1.updateBag)(tripId, bagId, fields, bodyKeys);
            if (!updated)
                return { content: [{ type: 'text', text: 'Bag not found.' }], isError: true };
            // Hydrate with the members array (matches create_packing_bag, listBags, and the schema).
            const bag = (0, packingService_1.listBags)(tripId).find(b => b.id === updated.id) ?? { ...updated, members: [] };
            (0, _shared_1.safeBroadcast)(tripId, 'packing:bag-updated', { bag });
            return (0, _shared_1.ok)({ bag });
        });
    if (W)
        server.registerTool('delete_packing_bag', {
            description: 'Delete a packing bag (items in the bag are unassigned, not deleted).',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                bagId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ tripId, bagId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            (0, packingService_1.deleteBag)(tripId, bagId);
            (0, _shared_1.safeBroadcast)(tripId, 'packing:bag-deleted', { id: bagId });
            return (0, _shared_1.ok)({ success: true });
        });
    if (W)
        server.registerTool('set_bag_members', {
            description: 'Assign trip members to a packing bag (determines who packs what bag).',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                bagId: zod_1.z.number().int().positive(),
                userIds: zod_1.z.array(zod_1.z.number().int().positive()),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, bagId, userIds }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const members = (0, packingService_1.setBagMembers)(tripId, bagId, userIds);
            if (!members)
                return { content: [{ type: 'text', text: 'Bag not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'packing:bag-members-updated', { bagId, members });
            return (0, _shared_1.ok)({ members });
        });
    if (R)
        server.registerTool('get_packing_category_assignees', {
            description: 'Get which trip members are assigned to each packing category.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ tripId }) => {
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            const assignees = (0, packingService_1.getCategoryAssignees)(tripId);
            return (0, _shared_1.ok)({ assignees });
        });
    if (W)
        server.registerTool('set_packing_category_assignees', {
            description: 'Assign trip members to a packing category.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                categoryName: zod_1.z.string().min(1).max(100),
                userIds: zod_1.z.array(zod_1.z.number().int().positive()),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, categoryName, userIds }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const assignees = (0, packingService_1.updateCategoryAssignees)(tripId, categoryName, userIds);
            (0, _shared_1.safeBroadcast)(tripId, 'packing:assignees', { category: categoryName, assignees });
            return (0, _shared_1.ok)({ assignees });
        });
    if (W)
        server.registerTool('apply_packing_template', {
            description: 'Apply a packing template to a trip (adds items from the template).',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                templateId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, templateId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const items = (0, packingService_1.applyTemplate)(tripId, templateId);
            if (items === null)
                return { content: [{ type: 'text', text: 'Template not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'packing:template-applied', { items });
            return (0, _shared_1.ok)({ items, count: items.length });
        });
    if (R)
        server.registerTool('list_packing_templates', {
            description: 'List the reusable packing templates (id, name, item count) so one can be applied with apply_packing_template.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ tripId }) => {
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            return (0, _shared_1.ok)({ templates: (0, packingService_1.listTemplates)() });
        });
    if (W)
        server.registerTool('save_packing_template', {
            description: 'Save the current packing list as a reusable template. Returns the new template (id, name, category/item counts). Admin only.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                templateName: zod_1.z.string().min(1).max(100),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, templateName }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            // Templates are global; the REST route restricts saving to admins. Match it.
            if (!(0, _shared_1.isAdminUser)(userId))
                return (0, _shared_1.adminRequired)();
            const template = (0, packingService_1.saveAsTemplate)(tripId, userId, templateName);
            if (!template)
                return { content: [{ type: 'text', text: 'Nothing to save — the packing list is empty.' }], isError: true };
            return (0, _shared_1.ok)({ template });
        });
    if (W)
        server.registerTool('delete_packing_template', {
            description: 'Delete a reusable packing template. Templates are global, so deletion is admin only.',
            inputSchema: {
                templateId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ templateId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            // Templates are global; the REST route restricts management to admins. Match it.
            if (!(0, _shared_1.isAdminUser)(userId))
                return (0, _shared_1.adminRequired)();
            const result = (0, adminService_1.deletePackingTemplate)(String(templateId));
            if ('error' in result)
                return { content: [{ type: 'text', text: result.error }], isError: true };
            return (0, _shared_1.ok)({ success: true, name: result.name });
        });
    if (W)
        server.registerTool('bulk_import_packing', {
            description: 'Import multiple packing items at once from a list. Optionally assign each to a bag (by name — created if missing), set its weight, or pre-check it.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                items: zod_1.z.array(zod_1.z.object({
                    name: zod_1.z.string().min(1).max(200),
                    category: zod_1.z.string().optional(),
                    quantity: zod_1.z.number().int().positive().optional(),
                    bag: zod_1.z.string().max(100).optional().describe('Bag name to assign the item to; created if it does not exist'),
                    weight_grams: zod_1.z.number().nonnegative().optional(),
                    checked: zod_1.z.boolean().optional(),
                })).min(1),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, items }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const created = (0, packingService_1.bulkImport)(tripId, items);
            for (const item of created)
                (0, _shared_1.safeBroadcast)(tripId, 'packing:created', { item });
            return (0, _shared_1.ok)({ items: created, count: created.length });
        });
}
