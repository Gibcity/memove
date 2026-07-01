"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_SCOPED_EVENTS = void 0;
exports.getActiveChannels = getActiveChannels;
exports.getAvailableChannels = getAvailableChannels;
exports.isEnabledForEvent = isEnabledForEvent;
exports.getPreferencesMatrix = getPreferencesMatrix;
exports.getAdminGlobalPref = getAdminGlobalPref;
exports.setPreferences = setPreferences;
exports.setAdminPreferences = setAdminPreferences;
exports.isSmtpConfigured = isSmtpConfigured;
exports.isWebhookConfigured = isWebhookConfigured;
const database_1 = require("../db/database");
// Which channels are implemented for each event type.
// Only implemented combos show toggles in the user preferences UI.
const IMPLEMENTED_COMBOS = {
    trip_invite: ['inapp', 'email', 'webhook', 'ntfy'],
    booking_change: ['inapp', 'email', 'webhook', 'ntfy'],
    trip_reminder: ['inapp', 'email', 'webhook', 'ntfy'],
    todo_due: ['inapp', 'email', 'webhook', 'ntfy'],
    vacay_invite: ['inapp', 'email', 'webhook', 'ntfy'],
    photos_shared: ['inapp', 'email', 'webhook', 'ntfy'],
    collab_message: ['inapp', 'email', 'webhook', 'ntfy'],
    packing_tagged: ['inapp', 'email', 'webhook', 'ntfy'],
    version_available: ['inapp', 'email', 'webhook', 'ntfy'],
    synology_session_cleared: ['inapp'],
};
/** Events that target admins only (shown in admin panel, not in user settings). */
exports.ADMIN_SCOPED_EVENTS = new Set(['version_available']);
// ── Helpers ────────────────────────────────────────────────────────────────
function getAppSetting(key) {
    return database_1.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key)?.value || null;
}
// ── Active channels (admin-configured) ────────────────────────────────────
/**
 * Returns which channels the admin has enabled (email and/or webhook).
 * Reads `notification_channels` (plural) with fallback to `notification_channel` (singular).
 * In-app is always considered active at the service level.
 */
function getActiveChannels() {
    const raw = getAppSetting('notification_channels') || getAppSetting('notification_channel') || 'none';
    if (raw === 'none')
        return [];
    return raw.split(',').map(c => c.trim()).filter((c) => c === 'email' || c === 'webhook' || c === 'ntfy');
}
/**
 * Returns which channels are configured (have valid credentials/URLs set).
 * In-app is always available. Email/webhook depend on configuration.
 */
function getAvailableChannels() {
    const hasSmtp = !!(process.env.SMTP_HOST || getAppSetting('smtp_host'));
    const activeChannels = getActiveChannels();
    return { email: hasSmtp, webhook: activeChannels.includes('webhook'), ntfy: activeChannels.includes('ntfy'), inapp: true };
}
// ── Per-user preference checks ─────────────────────────────────────────────
/**
 * Returns true if the user has this event+channel enabled.
 * Default (no row) = enabled. Only returns false if there's an explicit disabled row.
 */
function isEnabledForEvent(userId, eventType, channel) {
    const row = database_1.db.prepare('SELECT enabled FROM notification_channel_preferences WHERE user_id = ? AND event_type = ? AND channel = ?').get(userId, eventType, channel);
    return row === undefined || row.enabled === 1;
}
/**
 * Returns the preferences matrix for a user.
 * scope='user'  — excludes admin-scoped events (for user settings page)
 * scope='admin' — returns only admin-scoped events (for admin notifications tab)
 */
function getPreferencesMatrix(userId, userRole, scope = 'user') {
    const rows = database_1.db.prepare('SELECT event_type, channel, enabled FROM notification_channel_preferences WHERE user_id = ?').all(userId);
    // Build a lookup from stored rows
    const stored = {};
    for (const row of rows) {
        if (!stored[row.event_type])
            stored[row.event_type] = {};
        stored[row.event_type][row.channel] = row.enabled === 1;
    }
    // Build the full matrix with defaults (true when no row exists)
    const preferences = {};
    const allEvents = Object.keys(IMPLEMENTED_COMBOS);
    for (const eventType of allEvents) {
        const channels = IMPLEMENTED_COMBOS[eventType];
        preferences[eventType] = {};
        for (const channel of channels) {
            // Admin-scoped events use global settings for email/webhook/ntfy
            if (scope === 'admin' && exports.ADMIN_SCOPED_EVENTS.has(eventType) && (channel === 'email' || channel === 'webhook' || channel === 'ntfy')) {
                preferences[eventType][channel] = getAdminGlobalPref(eventType, channel);
            }
            else {
                preferences[eventType][channel] = stored[eventType]?.[channel] ?? true;
            }
        }
    }
    // Filter event types by scope
    const event_types = scope === 'admin'
        ? allEvents.filter(e => exports.ADMIN_SCOPED_EVENTS.has(e))
        : allEvents.filter(e => !exports.ADMIN_SCOPED_EVENTS.has(e));
    // Available channels depend on scope
    let available_channels;
    if (scope === 'admin') {
        const hasSmtp = !!(process.env.SMTP_HOST || getAppSetting('smtp_host'));
        const hasAdminWebhook = !!(getAppSetting('admin_webhook_url'));
        const hasAdminNtfy = !!(getAppSetting('admin_ntfy_topic'));
        available_channels = { email: hasSmtp, webhook: hasAdminWebhook, ntfy: hasAdminNtfy, inapp: true };
    }
    else {
        const activeChannels = getActiveChannels();
        available_channels = {
            email: activeChannels.includes('email'),
            webhook: activeChannels.includes('webhook'),
            ntfy: activeChannels.includes('ntfy'),
            inapp: true,
        };
    }
    return {
        preferences,
        available_channels,
        event_types,
        implemented_combos: IMPLEMENTED_COMBOS,
        ...(scope === 'user' && { defaults: { ntfyServer: getAppSetting('admin_ntfy_server') || null } }),
    };
}
// ── Admin global preferences (stored in app_settings) ─────────────────────
const ADMIN_GLOBAL_CHANNELS = ['email', 'webhook', 'ntfy'];
/**
 * Returns the global admin preference for an event+channel.
 * Stored in app_settings as `admin_notif_pref_{event}_{channel}`.
 * Defaults to true (enabled) when no row exists.
 */
function getAdminGlobalPref(event, channel) {
    const val = getAppSetting(`admin_notif_pref_${event}_${channel}`);
    return val !== '0';
}
function setAdminGlobalPref(event, channel, enabled) {
    database_1.db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(`admin_notif_pref_${event}_${channel}`, enabled ? '1' : '0');
}
// ── Preferences update ─────────────────────────────────────────────────────
// ── Shared helper for per-user channel preference upserts ─────────────────
function applyUserChannelPrefs(userId, prefs, upsert, del) {
    for (const [eventType, channels] of Object.entries(prefs)) {
        if (!channels)
            continue;
        for (const [channel, enabled] of Object.entries(channels)) {
            if (enabled) {
                // Remove explicit row — default is enabled
                del.run(userId, eventType, channel);
            }
            else {
                upsert.run(userId, eventType, channel, 0);
            }
        }
    }
}
/**
 * Bulk-update preferences from the matrix UI.
 * Inserts disabled rows (enabled=0) and removes rows that are enabled (default).
 */
function setPreferences(userId, prefs) {
    const upsert = database_1.db.prepare('INSERT OR REPLACE INTO notification_channel_preferences (user_id, event_type, channel, enabled) VALUES (?, ?, ?, ?)');
    const del = database_1.db.prepare('DELETE FROM notification_channel_preferences WHERE user_id = ? AND event_type = ? AND channel = ?');
    database_1.db.transaction(() => applyUserChannelPrefs(userId, prefs, upsert, del))();
}
/**
 * Bulk-update admin notification preferences.
 * email/webhook channels are stored globally in app_settings (not per-user).
 * inapp channel remains per-user in notification_channel_preferences.
 */
function setAdminPreferences(userId, prefs) {
    const upsert = database_1.db.prepare('INSERT OR REPLACE INTO notification_channel_preferences (user_id, event_type, channel, enabled) VALUES (?, ?, ?, ?)');
    const del = database_1.db.prepare('DELETE FROM notification_channel_preferences WHERE user_id = ? AND event_type = ? AND channel = ?');
    // Split global (email/webhook) from per-user (inapp) prefs
    const globalPrefs = {};
    const userPrefs = {};
    for (const [eventType, channels] of Object.entries(prefs)) {
        if (!channels)
            continue;
        for (const [channel, enabled] of Object.entries(channels)) {
            if (ADMIN_GLOBAL_CHANNELS.includes(channel)) {
                if (!globalPrefs[eventType])
                    globalPrefs[eventType] = {};
                globalPrefs[eventType][channel] = enabled;
            }
            else {
                if (!userPrefs[eventType])
                    userPrefs[eventType] = {};
                userPrefs[eventType][channel] = enabled;
            }
        }
    }
    // Apply global prefs outside the transaction (they write to app_settings)
    for (const [eventType, channels] of Object.entries(globalPrefs)) {
        if (!channels)
            continue;
        for (const [channel, enabled] of Object.entries(channels)) {
            setAdminGlobalPref(eventType, channel, enabled);
        }
    }
    // Apply per-user (inapp) prefs in a transaction
    database_1.db.transaction(() => applyUserChannelPrefs(userId, userPrefs, upsert, del))();
}
// ── SMTP availability helper (for authService) ─────────────────────────────
function isSmtpConfigured() {
    return !!(process.env.SMTP_HOST || getAppSetting('smtp_host'));
}
function isWebhookConfigured() {
    return getActiveChannels().includes('webhook');
}
