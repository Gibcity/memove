"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAirtrailWriteEnabled = isAirtrailWriteEnabled;
exports.getAirtrailCredentials = getAirtrailCredentials;
exports.getConnectionSettings = getConnectionSettings;
exports.saveSettings = saveSettings;
exports.getConnectionStatus = getConnectionStatus;
exports.testConnection = testConnection;
exports.getFlightsForPicker = getFlightsForPicker;
const database_1 = require("../../db/database");
const apiKeyCrypto_1 = require("../apiKeyCrypto");
const ssrfGuard_1 = require("../../utils/ssrfGuard");
const auditLog_1 = require("../auditLog");
const airtrailClient_1 = require("./airtrailClient");
const airtrailMapper_1 = require("./airtrailMapper");
const KEY_MASK = '••••••••';
function readRow(userId) {
    return database_1.db
        .prepare('SELECT airtrail_url, airtrail_api_key, airtrail_allow_insecure_tls, airtrail_write_enabled FROM users WHERE id = ?')
        .get(userId);
}
/** Has this user opted in to memove writing their flight edits back to AirTrail? (#1240) */
function isAirtrailWriteEnabled(userId) {
    const row = database_1.db.prepare('SELECT airtrail_write_enabled FROM users WHERE id = ?').get(userId);
    return !!row?.airtrail_write_enabled;
}
/** Decrypted creds for outbound calls, or null when the user has no connection. */
function getAirtrailCredentials(userId) {
    const row = readRow(userId);
    if (!row?.airtrail_url || !row?.airtrail_api_key)
        return null;
    const apiKey = (0, apiKeyCrypto_1.decrypt_api_key)(row.airtrail_api_key);
    if (!apiKey)
        return null;
    return {
        baseUrl: row.airtrail_url,
        apiKey,
        allowInsecureTls: !!row.airtrail_allow_insecure_tls,
    };
}
/** Settings as shown in the UI — the key is never echoed, only masked. */
function getConnectionSettings(userId) {
    const row = readRow(userId);
    return {
        url: row?.airtrail_url || '',
        apiKeyMasked: row?.airtrail_api_key ? KEY_MASK : '',
        allowInsecureTls: !!row?.airtrail_allow_insecure_tls,
        writeEnabled: !!row?.airtrail_write_enabled,
        connected: !!(row?.airtrail_url && row?.airtrail_api_key),
    };
}
async function saveSettings(userId, url, apiKey, allowInsecureTls, writeEnabled, clientIp) {
    const trimmedUrl = (url || '').trim();
    let warning;
    if (trimmedUrl) {
        const ssrf = await (0, ssrfGuard_1.checkSsrf)(trimmedUrl);
        // Reject only genuinely unusable URLs (malformed, unresolvable, non-http,
        // loopback). Private/LAN instances are the common self-hosted case, so we
        // persist them with a warning rather than blocking — the outbound calls
        // still need ALLOW_INTERNAL_NETWORK=true to actually reach them.
        if (!ssrf.allowed && !ssrf.isPrivate) {
            return { success: false, error: ssrf.error ?? 'Invalid AirTrail URL' };
        }
        if (ssrf.isPrivate) {
            (0, auditLog_1.writeAudit)({
                userId,
                action: 'airtrail.private_ip_configured',
                ip: clientIp,
                details: { airtrail_url: trimmedUrl, resolved_ip: ssrf.resolvedIp },
            });
            warning = `AirTrail URL resolves to a private IP (${ssrf.resolvedIp}). Make sure this is intentional — the server may need ALLOW_INTERNAL_NETWORK=true to reach it.`;
        }
    }
    // Only overwrite the stored key when a genuinely new value is supplied;
    // a blank field or the mask means "keep the existing key".
    const provided = (apiKey || '').trim();
    const newKey = provided && provided !== KEY_MASK ? (0, apiKeyCrypto_1.maybe_encrypt_api_key)(provided) : undefined;
    if (newKey !== undefined) {
        database_1.db.prepare('UPDATE users SET airtrail_url = ?, airtrail_api_key = ?, airtrail_allow_insecure_tls = ?, airtrail_write_enabled = ? WHERE id = ?').run(trimmedUrl || null, newKey, allowInsecureTls ? 1 : 0, writeEnabled ? 1 : 0, userId);
    }
    else {
        database_1.db.prepare('UPDATE users SET airtrail_url = ?, airtrail_allow_insecure_tls = ?, airtrail_write_enabled = ? WHERE id = ?').run(trimmedUrl || null, allowInsecureTls ? 1 : 0, writeEnabled ? 1 : 0, userId);
        // Clearing the URL with no key left makes the connection meaningless — drop the key too.
        if (!trimmedUrl) {
            database_1.db.prepare('UPDATE users SET airtrail_api_key = NULL WHERE id = ?').run(userId);
        }
    }
    return { success: true, warning };
}
async function probe(creds) {
    try {
        const flights = await (0, airtrailClient_1.listFlights)(creds);
        return { connected: true, flightCount: flights.length };
    }
    catch (err) {
        if (err instanceof airtrailClient_1.AirtrailAuthError)
            return { connected: false, error: 'Invalid API key' };
        return { connected: false, error: err instanceof Error ? err.message : 'Connection failed' };
    }
}
/** Live check using the stored connection. */
async function getConnectionStatus(userId) {
    const creds = getAirtrailCredentials(userId);
    if (!creds)
        return { connected: false, error: 'Not configured' };
    return probe(creds);
}
/**
 * "Test connection" from the settings form. Uses the typed URL/key when given;
 * falls back to the stored key when the key field still shows the mask.
 */
async function testConnection(userId, url, apiKey, allowInsecureTls) {
    const trimmedUrl = (url || '').trim();
    const provided = (apiKey || '').trim();
    const stored = getAirtrailCredentials(userId);
    const effectiveUrl = trimmedUrl || stored?.baseUrl;
    const effectiveKey = provided && provided !== KEY_MASK ? provided : stored?.apiKey;
    if (!effectiveUrl || !effectiveKey) {
        return { connected: false, error: 'URL and API key required' };
    }
    const ssrf = await (0, ssrfGuard_1.checkSsrf)(effectiveUrl);
    if (!ssrf.allowed && !ssrf.isPrivate) {
        return { connected: false, error: ssrf.error ?? 'Invalid AirTrail URL' };
    }
    return probe({ baseUrl: effectiveUrl, apiKey: effectiveKey, allowInsecureTls });
}
/** The user's AirTrail flights, normalized for the import picker. */
async function getFlightsForPicker(userId) {
    const creds = getAirtrailCredentials(userId);
    if (!creds)
        throw new airtrailClient_1.AirtrailRequestError('AirTrail is not connected', 400);
    const raw = await (0, airtrailClient_1.listFlights)(creds);
    return raw.map(airtrailMapper_1.normalizeFlight);
}
