"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCollabTools = registerCollabTools;
const zod_1 = require("zod");
const database_1 = require("../../db/database");
const authService_1 = require("../../services/authService");
const collabService_1 = require("../../services/collabService");
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
function registerCollabTools(server, userId, scopes) {
    const R = (0, scopes_1.canRead)(scopes, 'collab');
    const W = (0, scopes_1.canWrite)(scopes, 'collab');
    if (!(0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.COLLAB))
        return;
    const features = (0, adminService_1.getCollabFeatures)();
    // --- COLLAB NOTES ---
    if (features.notes && W)
        server.registerTool('create_collab_note', {
            description: 'Create a shared collaborative note on a trip (visible to all trip members in the Collab tab).',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                title: zod_1.z.string().min(1).max(200),
                content: zod_1.z.string().max(10000).optional(),
                category: zod_1.z.string().max(100).optional().describe('Note category (e.g. "Ideas", "To-do", "General")'),
                color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Hex color for the note card'),
                pinned: zod_1.z.boolean().optional().default(false).describe('Pin the note to the top'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, title, content, category, color, pinned }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('collab_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const note = (0, collabService_1.createNote)(tripId, userId, { title, content, category, color, pinned });
            (0, _shared_1.safeBroadcast)(tripId, 'collab:note:created', { note });
            return (0, _shared_1.ok)({ note });
        });
    if (features.notes && W)
        server.registerTool('update_collab_note', {
            description: 'Edit an existing collaborative note on a trip.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                noteId: zod_1.z.number().int().positive(),
                title: zod_1.z.string().min(1).max(200).optional(),
                content: zod_1.z.string().max(10000).optional(),
                category: zod_1.z.string().max(100).optional(),
                color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Hex color for the note card'),
                pinned: zod_1.z.boolean().optional().describe('Pin the note to the top'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, noteId, title, content, category, color, pinned }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('collab_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const note = (0, collabService_1.updateNote)(tripId, noteId, { title, content, category, color, pinned });
            if (!note)
                return { content: [{ type: 'text', text: 'Note not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'collab:note:updated', { note });
            return (0, _shared_1.ok)({ note });
        });
    if (features.notes && W)
        server.registerTool('delete_collab_note', {
            description: 'Delete a collaborative note from a trip.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                noteId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ tripId, noteId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('collab_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const deleted = (0, collabService_1.deleteNote)(tripId, noteId);
            if (!deleted)
                return { content: [{ type: 'text', text: 'Note not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'collab:note:deleted', { noteId });
            return (0, _shared_1.ok)({ success: true });
        });
    // --- COLLAB POLLS & CHAT ---
    if (features.polls && R)
        server.registerTool('list_collab_polls', {
            description: 'List all polls for a trip.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ tripId }) => {
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            const polls = (0, collabService_1.listPolls)(tripId);
            return (0, _shared_1.ok)({ polls });
        });
    if (features.polls && W)
        server.registerTool('create_collab_poll', {
            description: 'Create a new poll in the collab panel.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                question: zod_1.z.string().min(1),
                options: zod_1.z.array(zod_1.z.string()).min(2).describe('Poll answer options (at least 2)'),
                multiple: zod_1.z.boolean().optional().describe('Allow multiple choice'),
                deadline: zod_1.z.string().optional().describe('ISO date string for poll deadline'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, question, options, multiple, deadline }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('collab_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const poll = (0, collabService_1.createPoll)(tripId, userId, { question, options, multiple, deadline });
            (0, _shared_1.safeBroadcast)(tripId, 'collab:poll:created', { poll });
            return (0, _shared_1.ok)({ poll });
        });
    if (features.polls && W)
        server.registerTool('vote_collab_poll', {
            description: 'Vote on a poll option (or remove vote if already voted for that option).',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                pollId: zod_1.z.number().int().positive(),
                optionIndex: zod_1.z.number().int().min(0).describe('Zero-based index of the option to vote for'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, pollId, optionIndex }) => {
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('collab_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const result = (0, collabService_1.votePoll)(tripId, pollId, userId, optionIndex);
            if (result.error)
                return { content: [{ type: 'text', text: result.error }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'collab:poll:voted', { poll: result.poll });
            return (0, _shared_1.ok)({ poll: result.poll });
        });
    if (features.polls && W)
        server.registerTool('close_collab_poll', {
            description: 'Close a poll so no more votes can be cast.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                pollId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ tripId, pollId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('collab_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const poll = (0, collabService_1.closePoll)(tripId, pollId);
            if (!poll)
                return { content: [{ type: 'text', text: 'Poll not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'collab:poll:closed', { poll });
            return (0, _shared_1.ok)({ poll });
        });
    if (features.polls && W)
        server.registerTool('delete_collab_poll', {
            description: 'Delete a poll and all its votes.',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                pollId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ tripId, pollId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('collab_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const deleted = (0, collabService_1.deletePoll)(tripId, pollId);
            if (!deleted)
                return { content: [{ type: 'text', text: 'Poll not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'collab:poll:deleted', { pollId });
            return (0, _shared_1.ok)({ success: true });
        });
    if (features.chat && R)
        server.registerTool('list_collab_messages', {
            description: 'List chat messages for a trip (most recent 100, oldest-first).',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                before: zod_1.z.number().int().positive().optional().describe('Load messages with ID less than this (pagination)'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ tripId, before }) => {
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            const messages = (0, collabService_1.listMessages)(tripId, before);
            return (0, _shared_1.ok)({ messages });
        });
    if (features.chat && W)
        server.registerTool('send_collab_message', {
            description: "Send a chat message to a trip's collab channel.",
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                text: zod_1.z.string().min(1),
                replyTo: zod_1.z.number().int().positive().optional().describe('Reply to a specific message ID'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, text, replyTo }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('collab_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const result = (0, collabService_1.createMessage)(tripId, userId, text, replyTo ?? null);
            if (result.error)
                return { content: [{ type: 'text', text: result.error }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'collab:message:created', { message: result.message });
            return (0, _shared_1.ok)({ message: result.message });
        });
    if (features.chat && W)
        server.registerTool('delete_collab_message', {
            description: 'Delete a chat message (only the message owner can delete their own messages).',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                messageId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
        }, async ({ tripId, messageId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('collab_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const result = (0, collabService_1.deleteMessage)(tripId, messageId, userId);
            if (result.error)
                return { content: [{ type: 'text', text: result.error }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'collab:message:deleted', { messageId, username: result.username });
            return (0, _shared_1.ok)({ success: true });
        });
    if (features.chat && W)
        server.registerTool('react_collab_message', {
            description: 'Toggle a reaction emoji on a chat message (adds if not present, removes if already reacted).',
            inputSchema: {
                tripId: zod_1.z.number().int().positive(),
                messageId: zod_1.z.number().int().positive(),
                emoji: zod_1.z.string().describe('Single emoji character'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
        }, async ({ tripId, messageId, emoji }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            if (!(0, database_1.canAccessTrip)(tripId, userId))
                return (0, _shared_1.noAccess)();
            if (!(0, _shared_1.hasTripPermission)('collab_edit', tripId, userId))
                return (0, _shared_1.permissionDenied)();
            const result = (0, collabService_1.addOrRemoveReaction)(messageId, tripId, userId, emoji);
            if (!result.found)
                return { content: [{ type: 'text', text: 'Message not found.' }], isError: true };
            (0, _shared_1.safeBroadcast)(tripId, 'collab:message:reacted', { messageId, reactions: result.reactions });
            return (0, _shared_1.ok)({ reactions: result.reactions });
        });
}
