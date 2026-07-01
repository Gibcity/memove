"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRecipients = resolveRecipients;
exports.createNotificationForRecipient = createNotificationForRecipient;
exports.createNotification = createNotification;
exports.getNotifications = getNotifications;
exports.getUnreadCount = getUnreadCount;
exports.markRead = markRead;
exports.markUnread = markUnread;
exports.markAllRead = markAllRead;
exports.deleteNotification = deleteNotification;
exports.deleteAll = deleteAll;
exports.respondToBoolean = respondToBoolean;
const database_1 = require("../db/database");
const websocket_1 = require("../websocket");
const inAppNotificationActions_1 = require("./inAppNotificationActions");
const notificationPreferencesService_1 = require("./notificationPreferencesService");
// SQLite's CURRENT_TIMESTAMP is UTC but the string ('YYYY-MM-DD HH:MM:SS') has
// no 'T'/'Z', so `new Date(...)` parses it as LOCAL time. Normalize to ISO-UTC
// so the client renders notification times in the viewer's own timezone (#1149).
function toUtcIso(ts) {
    return ts.endsWith('Z') ? ts : ts.replace(' ', 'T') + 'Z';
}
function resolveRecipients(scope, target, excludeUserId) {
    let userIds = [];
    if (scope === 'trip') {
        const owner = database_1.db.prepare('SELECT user_id FROM trips WHERE id = ?').get(target);
        const members = database_1.db.prepare('SELECT user_id FROM trip_members WHERE trip_id = ?').all(target);
        const ids = new Set();
        if (owner)
            ids.add(owner.user_id);
        for (const m of members)
            ids.add(m.user_id);
        userIds = Array.from(ids);
    }
    else if (scope === 'user') {
        userIds = [target];
    }
    else if (scope === 'admin') {
        const admins = database_1.db.prepare('SELECT id FROM users WHERE role = ?').all('admin');
        userIds = admins.map(a => a.id);
    }
    // Only exclude sender for group scopes (trip/admin) — for user scope, the target is explicit
    if (excludeUserId != null && scope !== 'user') {
        userIds = userIds.filter(id => id !== excludeUserId);
    }
    return userIds;
}
function createNotification(input) {
    const recipients = resolveRecipients(input.scope, input.target, input.sender_id);
    if (recipients.length === 0)
        return [];
    const titleParams = JSON.stringify(input.title_params ?? {});
    const textParams = JSON.stringify(input.text_params ?? {});
    // Track inserted id → recipientId pairs (some recipients may be skipped by pref check)
    const insertedPairs = [];
    const insert = database_1.db.transaction(() => {
        const stmt = database_1.db.prepare(`
      INSERT INTO notifications (
        type, scope, target, sender_id, recipient_id,
        title_key, title_params, text_key, text_params,
        positive_text_key, negative_text_key, positive_callback, negative_callback,
        navigate_text_key, navigate_target
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        for (const recipientId of recipients) {
            // Check per-user in-app preference if an event_type is provided
            if (input.event_type && !(0, notificationPreferencesService_1.isEnabledForEvent)(recipientId, input.event_type, 'inapp')) {
                continue;
            }
            let positiveTextKey = null;
            let negativeTextKey = null;
            let positiveCallback = null;
            let negativeCallback = null;
            let navigateTextKey = null;
            let navigateTarget = null;
            if (input.type === 'boolean') {
                positiveTextKey = input.positive_text_key;
                negativeTextKey = input.negative_text_key;
                positiveCallback = JSON.stringify(input.positive_callback);
                negativeCallback = JSON.stringify(input.negative_callback);
            }
            else if (input.type === 'navigate') {
                navigateTextKey = input.navigate_text_key;
                navigateTarget = input.navigate_target;
            }
            const result = stmt.run(input.type, input.scope, input.target, input.sender_id, recipientId, input.title_key, titleParams, input.text_key, textParams, positiveTextKey, negativeTextKey, positiveCallback, negativeCallback, navigateTextKey, navigateTarget);
            insertedPairs.push({ id: result.lastInsertRowid, recipientId });
        }
    });
    insert();
    // Fetch sender info once for WS payloads
    const sender = input.sender_id
        ? database_1.db.prepare('SELECT username, avatar FROM users WHERE id = ?').get(input.sender_id)
        : null;
    // Broadcast to each recipient
    for (const { id: notificationId, recipientId } of insertedPairs) {
        const row = database_1.db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId);
        if (!row)
            continue;
        (0, websocket_1.broadcastToUser)(recipientId, {
            type: 'notification:new',
            notification: {
                ...row,
                sender_username: sender?.username ?? null,
                sender_avatar: sender?.avatar ? `/uploads/avatars/${sender.avatar}` : null,
            },
        });
    }
    return insertedPairs.map(p => p.id);
}
/**
 * Insert a single in-app notification for one pre-resolved recipient and broadcast via WebSocket.
 * Used by notificationService.send() which handles recipient resolution externally.
 */
function createNotificationForRecipient(input, recipientId, sender) {
    const titleParams = JSON.stringify(input.title_params ?? {});
    const textParams = JSON.stringify(input.text_params ?? {});
    let positiveTextKey = null;
    let negativeTextKey = null;
    let positiveCallback = null;
    let negativeCallback = null;
    let navigateTextKey = null;
    let navigateTarget = null;
    if (input.type === 'boolean') {
        positiveTextKey = input.positive_text_key;
        negativeTextKey = input.negative_text_key;
        positiveCallback = JSON.stringify(input.positive_callback);
        negativeCallback = JSON.stringify(input.negative_callback);
    }
    else if (input.type === 'navigate') {
        navigateTextKey = input.navigate_text_key;
        navigateTarget = input.navigate_target;
    }
    const result = database_1.db.prepare(`
    INSERT INTO notifications (
      type, scope, target, sender_id, recipient_id,
      title_key, title_params, text_key, text_params,
      positive_text_key, negative_text_key, positive_callback, negative_callback,
      navigate_text_key, navigate_target
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(input.type, input.scope, input.target, input.sender_id, recipientId, input.title_key, titleParams, input.text_key, textParams, positiveTextKey, negativeTextKey, positiveCallback, negativeCallback, navigateTextKey, navigateTarget);
    const notificationId = result.lastInsertRowid;
    const row = database_1.db.prepare('SELECT * FROM notifications WHERE id = ?').get(notificationId);
    if (!row)
        return null;
    (0, websocket_1.broadcastToUser)(recipientId, {
        type: 'notification:new',
        notification: {
            ...row,
            created_at: toUtcIso(row.created_at),
            sender_username: sender?.username ?? null,
            sender_avatar: sender?.avatar ? `/uploads/avatars/${sender.avatar}` : null,
        },
    });
    return notificationId;
}
function getNotifications(userId, options = {}) {
    const limit = Math.min(options.limit ?? 20, 50);
    const offset = options.offset ?? 0;
    const unreadOnly = options.unreadOnly ?? false;
    const whereAliased = unreadOnly ? 'WHERE n.recipient_id = ? AND n.is_read = 0' : 'WHERE n.recipient_id = ?';
    const wherePlain = unreadOnly ? 'WHERE recipient_id = ? AND is_read = 0' : 'WHERE recipient_id = ?';
    const rows = database_1.db.prepare(`
    SELECT n.*, u.username AS sender_username, u.avatar AS sender_avatar
    FROM notifications n
    LEFT JOIN users u ON n.sender_id = u.id
    ${whereAliased}
    ORDER BY n.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
    const { total } = database_1.db.prepare(`SELECT COUNT(*) as total FROM notifications ${wherePlain}`).get(userId);
    const { unread_count } = database_1.db.prepare('SELECT COUNT(*) as unread_count FROM notifications WHERE recipient_id = ? AND is_read = 0').get(userId);
    const mapped = rows.map(r => ({
        ...r,
        created_at: toUtcIso(r.created_at),
        sender_avatar: r.sender_avatar ? `/uploads/avatars/${r.sender_avatar}` : null,
    }));
    return { notifications: mapped, total, unread_count };
}
function getUnreadCount(userId) {
    const row = database_1.db.prepare('SELECT COUNT(*) as count FROM notifications WHERE recipient_id = ? AND is_read = 0').get(userId);
    return row.count;
}
function markRead(notificationId, userId) {
    const result = database_1.db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_id = ?').run(notificationId, userId);
    return result.changes > 0;
}
function markUnread(notificationId, userId) {
    const result = database_1.db.prepare('UPDATE notifications SET is_read = 0 WHERE id = ? AND recipient_id = ?').run(notificationId, userId);
    return result.changes > 0;
}
function markAllRead(userId) {
    const result = database_1.db.prepare('UPDATE notifications SET is_read = 1 WHERE recipient_id = ? AND is_read = 0').run(userId);
    return result.changes;
}
function deleteNotification(notificationId, userId) {
    const result = database_1.db.prepare('DELETE FROM notifications WHERE id = ? AND recipient_id = ?').run(notificationId, userId);
    return result.changes > 0;
}
function deleteAll(userId) {
    const result = database_1.db.prepare('DELETE FROM notifications WHERE recipient_id = ?').run(userId);
    return result.changes;
}
async function respondToBoolean(notificationId, userId, response) {
    const notification = database_1.db.prepare('SELECT * FROM notifications WHERE id = ? AND recipient_id = ?').get(notificationId, userId);
    if (!notification)
        return { success: false, error: 'Notification not found' };
    if (notification.type !== 'boolean')
        return { success: false, error: 'Not a boolean notification' };
    if (notification.response !== null)
        return { success: false, error: 'Already responded' };
    const callbackJson = response === 'positive' ? notification.positive_callback : notification.negative_callback;
    if (!callbackJson)
        return { success: false, error: 'No callback defined' };
    let callback;
    try {
        callback = JSON.parse(callbackJson);
    }
    catch {
        return { success: false, error: 'Invalid callback format' };
    }
    const handler = (0, inAppNotificationActions_1.getAction)(callback.action);
    if (!handler)
        return { success: false, error: `Unknown action: ${callback.action}` };
    try {
        await handler(callback.payload, userId);
    }
    catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Action failed' };
    }
    // Atomic update — only updates if response is still NULL (prevents double-response)
    const result = database_1.db.prepare('UPDATE notifications SET response = ?, is_read = 1 WHERE id = ? AND recipient_id = ? AND response IS NULL').run(response, notificationId, userId);
    if (result.changes === 0)
        return { success: false, error: 'Already responded' };
    const updated = database_1.db.prepare(`
    SELECT n.*, u.username AS sender_username, u.avatar AS sender_avatar
    FROM notifications n
    LEFT JOIN users u ON n.sender_id = u.id
    WHERE n.id = ?
  `).get(notificationId);
    const mappedUpdated = {
        ...updated,
        sender_avatar: updated.sender_avatar ? `/uploads/avatars/${updated.sender_avatar}` : null,
    };
    (0, websocket_1.broadcastToUser)(userId, { type: 'notification:updated', notification: mappedUpdated });
    return { success: true, notification: mappedUpdated };
}
