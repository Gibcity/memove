"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTagTools = registerTagTools;
const zod_1 = require("zod");
const authService_1 = require("../../services/authService");
const tagService_1 = require("../../services/tagService");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
function registerTagTools(server, userId, scopes) {
    const R = (0, scopes_1.canRead)(scopes, 'places');
    const W = (0, scopes_1.canWrite)(scopes, 'places');
    // --- TAGS ---
    if (R)
        server.registerTool('list_tags', {
            description: 'List all tags belonging to the current user.',
            inputSchema: {},
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async () => {
            const tags = (0, tagService_1.listTags)(userId);
            return (0, _shared_1.ok)({ tags });
        });
    if (W)
        server.registerTool('create_tag', {
            description: 'Create a new tag (user-scoped label for places).',
            inputSchema: {
                name: zod_1.z.string().min(1).max(100),
                color: zod_1.z.string().optional().describe('Hex color string e.g. #6366f1'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ name, color }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const tag = (0, tagService_1.createTag)(userId, name, color);
            return (0, _shared_1.ok)({ tag });
        });
    if (W)
        server.registerTool('update_tag', {
            description: 'Update the name or color of an existing tag.',
            inputSchema: {
                tagId: zod_1.z.number().int().positive(),
                name: zod_1.z.string().optional(),
                color: zod_1.z.string().optional(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tagId, name, color }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, tagService_1.getTagByIdAndUser)(tagId, userId))
                return { content: [{ type: 'text', text: 'Tag not found.' }], isError: true };
            const tag = (0, tagService_1.updateTag)(tagId, name, color);
            if (!tag)
                return { content: [{ type: 'text', text: 'Tag not found.' }], isError: true };
            return (0, _shared_1.ok)({ tag });
        });
    if (W)
        server.registerTool('delete_tag', {
            description: 'Delete a tag (removes it from all places it was attached to).',
            inputSchema: {
                tagId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ tagId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, tagService_1.getTagByIdAndUser)(tagId, userId))
                return { content: [{ type: 'text', text: 'Tag not found.' }], isError: true };
            (0, tagService_1.deleteTag)(tagId);
            return (0, _shared_1.ok)({ success: true });
        });
}
