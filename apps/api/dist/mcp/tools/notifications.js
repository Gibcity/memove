"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerNotificationTools = registerNotificationTools;
const zod_1 = require("zod");
const authService_1 = require("../../services/authService");
const inAppNotifications_1 = require("../../services/inAppNotifications");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
function registerNotificationTools(server, userId, scopes) {
    const R = (0, scopes_1.canRead)(scopes, 'notifications');
    const W = (0, scopes_1.canWrite)(scopes, 'notifications');
    // --- NOTIFICATIONS ---
    if (R)
        server.registerTool('list_notifications', {
            description: 'List in-app notifications for the current user.',
            inputSchema: {
                limit: zod_1.z.number().int().positive().optional().default(20),
                offset: zod_1.z.number().int().min(0).optional().default(0),
                unread_only: zod_1.z.boolean().optional().default(false),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ limit, offset, unread_only }) => {
            const result = (0, inAppNotifications_1.getNotifications)(userId, { limit: limit ?? 20, offset: offset ?? 0, unreadOnly: unread_only ?? false });
            return (0, _shared_1.ok)(result);
        });
    if (R)
        server.registerTool('get_unread_notification_count', {
            description: 'Get the number of unread in-app notifications.',
            inputSchema: {},
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async () => {
            const count = (0, inAppNotifications_1.getUnreadCount)(userId);
            return (0, _shared_1.ok)({ count });
        });
    if (W)
        server.registerTool('mark_notification_read', {
            description: 'Mark a single notification as read.',
            inputSchema: {
                notificationId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ notificationId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const success = (0, inAppNotifications_1.markRead)(notificationId, userId);
            if (!success)
                return { content: [{ type: 'text', text: 'Notification not found.' }], isError: true };
            return (0, _shared_1.ok)({ success: true });
        });
    if (W)
        server.registerTool('mark_notification_unread', {
            description: 'Mark a single notification as unread.',
            inputSchema: {
                notificationId: zod_1.z.number().int().positive(),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async ({ notificationId }) => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const success = (0, inAppNotifications_1.markUnread)(notificationId, userId);
            if (!success)
                return { content: [{ type: 'text', text: 'Notification not found.' }], isError: true };
            return (0, _shared_1.ok)({ success: true });
        });
    if (W)
        server.registerTool('mark_all_notifications_read', {
            description: "Mark all of the current user's notifications as read.",
            inputSchema: {},
            annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
        }, async () => {
            if ((0, authService_1.isDemoUser)(userId))
                return (0, _shared_1.demoDenied)();
            const count = (0, inAppNotifications_1.markAllRead)(userId);
            return (0, _shared_1.ok)({ success: true, count });
        });
}
