"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULTABLE_USER_SETTING_KEYS = void 0;
exports.getAdminUserDefaults = getAdminUserDefaults;
exports.setAdminUserDefaults = setAdminUserDefaults;
exports.getUserSettings = getUserSettings;
exports.upsertSetting = upsertSetting;
exports.bulkUpsertSettings = bulkUpsertSettings;
const database_1 = require("../db/database");
const apiKeyCrypto_1 = require("./apiKeyCrypto");
const ENCRYPTED_SETTING_KEYS = new Set(['webhook_url', 'ntfy_token']);
// Encrypted keys that are masked (••••••••) when returned to the client.
// Keys not in this set but in ENCRYPTED_SETTING_KEYS are decrypted and returned.
const MASKED_SETTING_KEYS = new Set(['webhook_url', 'ntfy_token']);
exports.DEFAULTABLE_USER_SETTING_KEYS = [
    'temperature_unit',
    'dark_mode',
    'time_format',
    // Instance-wide default currency for Costs (new users inherit it until they
    // pick their own). Free-form ISO code, validated on the client.
    'default_currency',
    'blur_booking_codes',
    'map_tile_url',
];
const VALID_VALUES = {
    temperature_unit: ['fahrenheit', 'celsius'],
    time_format: ['12h', '24h'],
    dark_mode: [true, false, 'light', 'dark', 'auto'],
};
const BOOLEAN_KEYS = new Set(['blur_booking_codes']);
function parseValue(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return raw;
    }
}
function getAdminUserDefaults() {
    const rows = database_1.db.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'default_user_setting_%'").all();
    const defaults = {};
    for (const row of rows) {
        const settingKey = row.key.slice('default_user_setting_'.length);
        if (ENCRYPTED_SETTING_KEYS.has(settingKey)) {
            defaults[settingKey] = row.value ? ((0, apiKeyCrypto_1.decrypt_api_key)(row.value) ?? '') : '';
        }
        else {
            defaults[settingKey] = parseValue(row.value);
        }
    }
    return defaults;
}
function setAdminUserDefaults(partial) {
    const upsert = database_1.db.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
    const del = database_1.db.prepare("DELETE FROM app_settings WHERE key = ?");
    database_1.db.exec('BEGIN');
    try {
        for (const [key, value] of Object.entries(partial)) {
            if (!exports.DEFAULTABLE_USER_SETTING_KEYS.includes(key)) {
                throw new Error(`Invalid setting key: ${key}`);
            }
            const typedKey = key;
            const appKey = `default_user_setting_${key}`;
            // null/undefined means "reset to built-in default" — delete the row
            if (value === null || value === undefined) {
                del.run(appKey);
                continue;
            }
            if (BOOLEAN_KEYS.has(typedKey) && typeof value !== 'boolean') {
                throw new Error(`Setting ${key} must be a boolean`);
            }
            const allowed = VALID_VALUES[typedKey];
            if (allowed && !allowed.includes(value)) {
                throw new Error(`Invalid value for ${key}: ${value}`);
            }
            // Encrypt sensitive defaults (the shared Mapbox token) at rest, like the
            // per-user equivalents; everything else is stored as plain JSON.
            const stored = ENCRYPTED_SETTING_KEYS.has(key)
                ? ((0, apiKeyCrypto_1.maybe_encrypt_api_key)(String(value)) ?? String(value))
                : JSON.stringify(value);
            upsert.run(appKey, stored);
        }
        database_1.db.exec('COMMIT');
    }
    catch (err) {
        database_1.db.exec('ROLLBACK');
        throw err;
    }
}
function getUserSettings(userId) {
    const adminDefaults = getAdminUserDefaults();
    const rows = database_1.db.prepare('SELECT key, value FROM settings WHERE user_id = ?').all(userId);
    const userSettings = {};
    for (const row of rows) {
        if (MASKED_SETTING_KEYS.has(row.key)) {
            userSettings[row.key] = row.value ? '••••••••' : '';
            continue;
        }
        if (ENCRYPTED_SETTING_KEYS.has(row.key)) {
            userSettings[row.key] = row.value ? ((0, apiKeyCrypto_1.decrypt_api_key)(row.value) ?? '') : '';
            continue;
        }
        try {
            userSettings[row.key] = JSON.parse(row.value);
        }
        catch {
            userSettings[row.key] = row.value;
        }
    }
    // Admin defaults fill in only for keys the user hasn't explicitly set
    return { ...adminDefaults, ...userSettings };
}
function serializeValue(key, value) {
    const raw = typeof value === 'object' ? JSON.stringify(value) : String(value !== undefined ? value : '');
    if (ENCRYPTED_SETTING_KEYS.has(key))
        return (0, apiKeyCrypto_1.maybe_encrypt_api_key)(raw) ?? raw;
    return raw;
}
function upsertSetting(userId, key, value) {
    database_1.db.prepare(`
    INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `).run(userId, key, serializeValue(key, value));
}
function bulkUpsertSettings(userId, settings) {
    const upsert = database_1.db.prepare(`
    INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `);
    database_1.db.exec('BEGIN');
    try {
        for (const [key, value] of Object.entries(settings)) {
            upsert.run(userId, key, serializeValue(key, value));
        }
        database_1.db.exec('COMMIT');
    }
    catch (err) {
        database_1.db.exec('ROLLBACK');
        throw err;
    }
    return Object.keys(settings).length;
}
