"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTodoTools = registerTodoTools;
const zod_1 = require("zod");
const database_1 = require("../../db/database");
const authService_1 = require("../../services/authService");
const todoService_1 = require("../../services/todoService");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
function registerTodoTools(server, userId, scopes) {
    const R = (0, scopes_1.canRead)(scopes, 'todos');
    const W = (0, scopes_1.canWrite)(scopes, 'todos');
    if (!(0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.PACKING))
        return;
    // --- TODOS ---
    if (R)
        server.registerTool('list_todos', {
            description: 'List all to-do items for a trip, ordered by position.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ tripId }) => {
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            const items = (0, todoService_1.listItems)(tripId);
            return (0, _shared_1.ok)({ items });
        });
    if (W)
        server.registerTool('create_todo', {
            description: 'Create a new to-do item for a trip.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                name: zod_1.z.string().min(1).max(500).describe('To-do item name'),
                category: zod_1.z.string().max(100).optional().describe('Category (e.g. "Logistics", "Booking")'),
                due_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Due date (YYYY-MM-DD)'),
                description: zod_1.z.string().max(2000).optional().describe('Additional description'),
                assigned_user_id: zod_1.z.number().int().positive().optional().describe('User ID to assign this task to'),
                priority: zod_1.z.number().int().min(0).max(3).optional().describe('Priority: 0=none, 1=low, 2=medium, 3=high'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, name, category, due_date, description, assigned_user_id, priority }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const item = (0, todoService_1.createItem)(tripId, { name, category, due_date, description, assigned_user_id, priority });
            (0, _shared_1.safeBroadcast)(tripId, 'todo:created', { item });
            return (0, _shared_1.ok)({ item });
        });
    if (W)
        server.registerTool('update_todo', {
            description: 'Update an existing to-do item. Only provided fields are changed; omitted fields stay as-is. Pass null to clear a nullable field.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                itemId: zod_1.z.number().int().positive(),
                name: zod_1.z.string().min(1).max(500).optional(),
                category: zod_1.z.string().max(100).optional(),
                due_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().describe('Set to null to clear the due date'),
                description: zod_1.z.string().max(2000).nullable().optional().describe('Set to null to clear'),
                assigned_user_id: zod_1.z.number().int().positive().nullable().optional().describe('Set to null to unassign'),
                priority: zod_1.z.number().int().min(0).max(3).nullable().optional(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, itemId, name, category, due_date, description, assigned_user_id, priority }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            // Build bodyKeys to signal which nullable fields were explicitly provided
            const bodyKeys = [];
            if (due_date !== undefined)
                bodyKeys.push('due_date');
            if (description !== undefined)
                bodyKeys.push('description');
            if (assigned_user_id !== undefined)
                bodyKeys.push('assigned_user_id');
            if (priority !== undefined)
                bodyKeys.push('priority');
            const item = (0, todoService_1.updateItem)(tripId, itemId, { name, category, due_date, description, assigned_user_id, priority }, bodyKeys);
            if (!item)
                return { content: [{ type: 'text', text: 'To-do item not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'todo:updated', { item });
            return (0, _shared_1.ok)({ item });
        });
    if (W)
        server.registerTool('toggle_todo', {
            description: 'Mark a to-do item as checked (done) or unchecked.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                itemId: zod_1.z.number().int().positive(),
                checked: zod_1.z.boolean().describe('True to mark done, false to uncheck'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, itemId, checked }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const item = (0, todoService_1.updateItem)(tripId, itemId, { checked: checked ? 1 : 0 }, []);
            if (!item)
                return { content: [{ type: 'text', text: 'To-do item not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'todo:updated', { item });
            return (0, _shared_1.ok)({ item });
        });
    if (W)
        server.registerTool('delete_todo', {
            description: 'Delete a to-do item.',
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
            const deleted = (0, todoService_1.deleteItem)(tripId, itemId);
            if (!deleted)
                return { content: [{ type: 'text', text: 'To-do item not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'todo:deleted', { itemId });
            return (0, _shared_1.ok)({ success: true });
        });
    if (W)
        server.registerTool('reorder_todos', {
            description: 'Reorder to-do items within a trip by providing a new ordered list of item IDs.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                orderedIds: zod_1.z.array(zod_1.z.number().int().positive()).min(1).describe('All item IDs in the desired order'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, orderedIds }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            (0, todoService_1.reorderItems)(tripId, orderedIds);
            return (0, _shared_1.ok)({ success: true });
        });
    if (R)
        server.registerTool('get_todo_category_assignees', {
            description: 'Get the default assignees configured per to-do category for a trip.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ tripId }) => {
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            const assignees = (0, todoService_1.getCategoryAssignees)(tripId);
            return (0, _shared_1.ok)({ assignees });
        });
    if (W)
        server.registerTool('set_todo_category_assignees', {
            description: 'Set the default assignees for a to-do category on a trip. Pass an empty array to clear.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                categoryName: zod_1.z.string().min(1).max(100).describe('Category name'),
                userIds: zod_1.z.array(zod_1.z.number().int().positive()).describe('User IDs to assign as defaults for this category'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, categoryName, userIds }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('packing_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const assignees = (0, todoService_1.updateCategoryAssignees)(tripId, categoryName, userIds);
            (0, _shared_1.safeBroadcast)(tripId, 'todo:assignees', { category: categoryName, assignees });
            return (0, _shared_1.ok)({ assignees });
        });
}
