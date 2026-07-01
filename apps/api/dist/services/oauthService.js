"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.listOAuthClients = listOAuthClients;
exports.createOAuthClient = createOAuthClient;
exports.rotateOAuthClientSecret = rotateOAuthClientSecret;
exports.deleteOAuthClient = deleteOAuthClient;
exports.createAuthCode = createAuthCode;
exports.consumeAuthCode = consumeAuthCode;
exports.getConsent = getConsent;
exports.saveConsent = saveConsent;
exports.isConsentSufficient = isConsentSufficient;
exports.issueTokens = issueTokens;
exports.issueClientCredentialsToken = issueClientCredentialsToken;
exports.getUserByAccessToken = getUserByAccessToken;
exports.refreshTokens = refreshTokens;
exports.revokeToken = revokeToken;
exports.listOAuthSessions = listOAuthSessions;
exports.revokeSession = revokeSession;
exports.validateAuthorizeRequest = validateAuthorizeRequest;
exports.verifyPKCE = verifyPKCE;
exports.authenticateClient = authenticateClient;
const crypto_1 = __importStar(require("crypto"));
const database_1 = require("../db/database");
const adminService_1 = require("./adminService");
const scopes_1 = require("../mcp/scopes");
const addons_1 = require("../addons");
const auditLog_1 = require("./auditLog");
const sessionManager_1 = require("../mcp/sessionManager");
const notifications_1 = require("./notifications");
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ACCESS_TOKEN_TTL_S = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days rolling
const AUTH_CODE_TTL_MS = 2 * 60 * 1000; // 2 minutes
// PKCE format (RFC 7636)
const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
const CODE_VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const MAX_PENDING_CODES = 500;
const pendingCodes = new Map();
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of pendingCodes) {
        if (now > entry.expiresAt)
            pendingCodes.delete(key);
    }
}, 60_000).unref();
// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------
function hashToken(raw) {
    return (0, crypto_1.createHash)('sha256').update(raw).digest('hex');
}
/** Constant-time comparison of two hex-encoded SHA-256 hashes. */
function timingSafeEqualHex(a, b) {
    if (a.length !== b.length)
        return false;
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
    }
    catch {
        return false;
    }
}
function generateAccessToken() {
    return 'memove_oa_' + (0, crypto_1.randomBytes)(32).toString('hex');
}
function generateRefreshToken() {
    return 'memove_rf_' + (0, crypto_1.randomBytes)(32).toString('hex');
}
// ---------------------------------------------------------------------------
// Client management (self-service, gated by MCP addon)
// ---------------------------------------------------------------------------
function listOAuthClients(userId) {
    const rows = database_1.db.prepare('SELECT id, user_id, name, client_id, redirect_uris, allowed_scopes, created_at, is_public, created_via, allows_client_credentials FROM oauth_clients WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    return rows.map(r => ({
        ...r,
        is_public: Boolean(r.is_public),
        allows_client_credentials: Boolean(r.allows_client_credentials),
        redirect_uris: JSON.parse(r.redirect_uris),
        allowed_scopes: JSON.parse(r.allowed_scopes),
    }));
}
function createOAuthClient(userId, name, redirectUris, allowedScopes, ip, options) {
    if (!name?.trim())
        return { error: 'Name is required', status: 400 };
    if (name.trim().length > 100)
        return { error: 'Name must be 100 characters or less', status: 400 };
    const isMachineClient = Boolean(options?.allowsClientCredentials);
    if (!isMachineClient && (!redirectUris || redirectUris.length === 0))
        return { error: 'At least one redirect URI is required', status: 400 };
    if (redirectUris.length > 10)
        return { error: 'Maximum 10 redirect URIs per client', status: 400 };
    for (const uri of redirectUris) {
        let parsed;
        try {
            parsed = new URL(uri);
        }
        catch {
            return { error: `Invalid redirect URI: ${uri}`, status: 400 };
        }
        if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
            return { error: `Redirect URI must use HTTPS (localhost exempt): ${uri}`, status: 400 };
        }
    }
    if (!allowedScopes || allowedScopes.length === 0)
        return { error: 'At least one scope is required', status: 400 };
    const { valid, invalid } = (0, scopes_1.validateScopes)(allowedScopes);
    if (!valid)
        return { error: `Invalid scopes: ${invalid.join(', ')}`, status: 400 };
    if (userId !== null) {
        const count = database_1.db.prepare('SELECT COUNT(*) as count FROM oauth_clients WHERE user_id = ?').get(userId).count;
        if (count >= 10)
            return { error: 'Maximum of 10 OAuth clients per user', status: 400 };
    }
    else {
        // Anonymous DCR clients: enforce a global cap to prevent unbounded registration abuse
        const count = database_1.db.prepare('SELECT COUNT(*) as count FROM oauth_clients WHERE user_id IS NULL').get().count;
        if (count >= 500)
            return { error: 'server_error', status: 503 };
    }
    // Machine clients (client_credentials) must always be confidential — ignore isPublic for them.
    const isPublic = isMachineClient ? false : (options?.isPublic ?? false);
    const createdVia = options?.createdVia ?? 'settings_ui';
    const id = (0, crypto_1.randomUUID)();
    const clientId = (0, crypto_1.randomUUID)();
    // Public clients have no usable secret; store an opaque random value to satisfy NOT NULL.
    const rawSecret = isPublic ? null : 'memove_cs_' + (0, crypto_1.randomBytes)(24).toString('hex');
    const secretHash = rawSecret ? hashToken(rawSecret) : (0, crypto_1.randomBytes)(32).toString('hex');
    database_1.db.prepare('INSERT INTO oauth_clients (id, user_id, name, client_id, client_secret_hash, redirect_uris, allowed_scopes, is_public, created_via, allows_client_credentials) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, userId, name.trim(), clientId, secretHash, JSON.stringify(redirectUris), JSON.stringify(allowedScopes), isPublic ? 1 : 0, createdVia, isMachineClient ? 1 : 0);
    const row = database_1.db.prepare('SELECT id, user_id, name, client_id, redirect_uris, allowed_scopes, created_at, is_public, created_via, allows_client_credentials FROM oauth_clients WHERE id = ?').get(id);
    (0, auditLog_1.writeAudit)({ userId, action: 'oauth.client.create', details: { client_id: clientId, name: name.trim(), is_public: isPublic, allows_client_credentials: isMachineClient }, ip });
    return {
        client: {
            id: row.id,
            user_id: row.user_id,
            name: row.name,
            client_id: row.client_id,
            redirect_uris: JSON.parse(row.redirect_uris),
            allowed_scopes: JSON.parse(row.allowed_scopes),
            created_at: row.created_at,
            is_public: Boolean(row.is_public),
            allows_client_credentials: Boolean(row.allows_client_credentials),
            created_via: row.created_via,
            // client_secret only present for confidential clients — shown once, not stored in plain text
            ...(rawSecret ? { client_secret: rawSecret } : {}),
        },
    };
}
function rotateOAuthClientSecret(userId, clientRowId, ip) {
    const row = database_1.db.prepare('SELECT id, client_id, is_public FROM oauth_clients WHERE id = ? AND user_id = ?').get(clientRowId, userId);
    if (!row)
        return { error: 'Client not found', status: 404 };
    if (row.is_public)
        return { error: 'Public clients do not use a client secret', status: 400 };
    const rawSecret = 'memove_cs_' + (0, crypto_1.randomBytes)(24).toString('hex');
    const secretHash = hashToken(rawSecret);
    database_1.db.prepare('UPDATE oauth_clients SET client_secret_hash = ? WHERE id = ?').run(secretHash, clientRowId);
    // Revoke all existing tokens for this client so old sessions are invalidated
    database_1.db.prepare("UPDATE oauth_tokens SET revoked_at = datetime('now') WHERE client_id = ? AND revoked_at IS NULL").run(row.client_id);
    // Terminate active MCP sessions for this (user, client) pair
    (0, sessionManager_1.revokeUserSessionsForClient)(userId, row.client_id);
    (0, auditLog_1.writeAudit)({ userId, action: 'oauth.client.rotate_secret', details: { client_id: row.client_id }, ip });
    return { client_secret: rawSecret };
}
function deleteOAuthClient(userId, clientRowId, ip) {
    const row = database_1.db.prepare('SELECT id, client_id FROM oauth_clients WHERE id = ? AND user_id = ?').get(clientRowId, userId);
    if (!row)
        return { error: 'Client not found', status: 404 };
    database_1.db.prepare('DELETE FROM oauth_clients WHERE id = ?').run(clientRowId);
    (0, auditLog_1.writeAudit)({ userId, action: 'oauth.client.delete', details: { client_id: row.client_id }, ip });
    return { success: true };
}
// ---------------------------------------------------------------------------
// Auth code (in-memory, 2-minute TTL)
// ---------------------------------------------------------------------------
function createAuthCode(params) {
    if (pendingCodes.size >= MAX_PENDING_CODES)
        return null;
    const rawCode = (0, crypto_1.randomBytes)(32).toString('hex');
    pendingCodes.set(rawCode, { ...params, expiresAt: Date.now() + AUTH_CODE_TTL_MS });
    return rawCode;
}
function consumeAuthCode(code) {
    const entry = pendingCodes.get(code);
    if (!entry)
        return null;
    pendingCodes.delete(code);
    if (Date.now() > entry.expiresAt)
        return null;
    return entry;
}
// ---------------------------------------------------------------------------
// Consent management
// ---------------------------------------------------------------------------
function getConsent(clientId, userId) {
    const row = database_1.db.prepare('SELECT scopes FROM oauth_consents WHERE client_id = ? AND user_id = ?').get(clientId, userId);
    return row ? JSON.parse(row.scopes) : null;
}
function saveConsent(clientId, userId, scopes, ip) {
    // Union existing consent with newly approved scopes (M5: never narrow stored consent)
    const existing = getConsent(clientId, userId) ?? [];
    const merged = Array.from(new Set([...existing, ...scopes]));
    database_1.db.prepare('INSERT OR REPLACE INTO oauth_consents (client_id, user_id, scopes, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)').run(clientId, userId, JSON.stringify(merged));
    (0, auditLog_1.writeAudit)({ userId, action: 'oauth.consent.grant', details: { client_id: clientId, scopes: merged }, ip });
}
function isConsentSufficient(existingScopes, requestedScopes) {
    return requestedScopes.every(s => existingScopes.includes(s));
}
// ---------------------------------------------------------------------------
// Token issuance
// ---------------------------------------------------------------------------
function issueTokens(clientId, userId, scopes, parentTokenId = null, audience = null) {
    const rawAccess = generateAccessToken();
    const rawRefresh = generateRefreshToken();
    const accessHash = hashToken(rawAccess);
    const refreshHash = hashToken(rawRefresh);
    const now = new Date();
    const accessExpiry = new Date(now.getTime() + ACCESS_TOKEN_TTL_S * 1000);
    const refreshExpiry = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
    database_1.db.prepare(`
    INSERT INTO oauth_tokens
      (client_id, user_id, access_token_hash, refresh_token_hash, scopes, audience, access_token_expires_at, refresh_token_expires_at, parent_token_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(clientId, userId, accessHash, refreshHash, JSON.stringify(scopes), audience, accessExpiry.toISOString(), refreshExpiry.toISOString(), parentTokenId);
    return {
        access_token: rawAccess,
        refresh_token: rawRefresh,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_S,
        scope: scopes.join(' '),
    };
}
// Issues an access token only — no refresh token (RFC 6749 §4.4.3).
// Used exclusively for the client_credentials grant. A random opaque hash is
// stored in refresh_token_hash to satisfy the NOT NULL/UNIQUE constraint; it
// can never be presented as a valid refresh token (same precedent as public
// client secret hashes stored in client_secret_hash).
function issueClientCredentialsToken(clientId, userId, scopes, audience) {
    const rawAccess = generateAccessToken();
    const accessHash = hashToken(rawAccess);
    const placeholderHash = (0, crypto_1.randomBytes)(32).toString('hex');
    const now = new Date();
    const accessExpiry = new Date(now.getTime() + ACCESS_TOKEN_TTL_S * 1000);
    database_1.db.prepare(`
    INSERT INTO oauth_tokens
      (client_id, user_id, access_token_hash, refresh_token_hash, scopes, audience, access_token_expires_at, refresh_token_expires_at, parent_token_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(clientId, userId, accessHash, placeholderHash, JSON.stringify(scopes), audience, accessExpiry.toISOString(), now.toISOString(), null);
    return {
        access_token: rawAccess,
        token_type: 'Bearer',
        expires_in: ACCESS_TOKEN_TTL_S,
        scope: scopes.join(' '),
    };
}
function getUserByAccessToken(rawToken) {
    const hash = hashToken(rawToken);
    const row = database_1.db.prepare(`
    SELECT ot.scopes, ot.audience, ot.revoked_at, ot.access_token_expires_at,
           ot.user_id, ot.client_id, u.username, u.email, u.role
    FROM oauth_tokens ot
    JOIN users u ON ot.user_id = u.id
    WHERE ot.access_token_hash = ?
  `).get(hash);
    if (!row)
        return null;
    if (row.revoked_at)
        return null;
    if (new Date(row.access_token_expires_at) < new Date())
        return null;
    return {
        user: { id: row.user_id, username: row.username, email: row.email, role: row.role },
        scopes: JSON.parse(row.scopes),
        clientId: row.client_id,
        audience: row.audience ?? null,
    };
}
// ---------------------------------------------------------------------------
// Token refresh (rotation + replay detection)
// ---------------------------------------------------------------------------
/** Walk parent_token_id upward to find the root token id of this rotation chain. */
function findChainRoot(tokenId) {
    let current = tokenId;
    for (let i = 0; i < 100; i++) {
        const row = database_1.db.prepare('SELECT id, parent_token_id FROM oauth_tokens WHERE id = ?').get(current);
        if (!row || row.parent_token_id === null)
            return current;
        current = row.parent_token_id;
    }
    return current;
}
/** Revoke all tokens in the rotation chain rooted at rootId. Returns affected ids. */
function revokeChain(rootId) {
    const rows = database_1.db.prepare(`
    WITH RECURSIVE chain(id) AS (
      SELECT id FROM oauth_tokens WHERE id = ?
      UNION ALL
      SELECT t.id FROM oauth_tokens t JOIN chain c ON t.parent_token_id = c.id
    )
    SELECT id FROM chain
  `).all(rootId);
    const ids = rows.map(r => r.id);
    if (ids.length > 0) {
        database_1.db.prepare(`UPDATE oauth_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id IN (${ids.map(() => '?').join(',')}) AND revoked_at IS NULL`).run(...ids);
    }
    return ids;
}
function refreshTokens(rawRefreshToken, clientId, clientSecret, ip) {
    const client = database_1.db.prepare('SELECT client_id, client_secret_hash, is_public FROM oauth_clients WHERE client_id = ?').get(clientId);
    if (!client)
        return { error: 'invalid_client', status: 401 };
    if (!client.is_public) {
        if (!clientSecret || !timingSafeEqualHex(hashToken(clientSecret), client.client_secret_hash)) {
            return { error: 'invalid_client', status: 401 };
        }
    }
    const hash = hashToken(rawRefreshToken);
    const row = database_1.db.prepare(`
    SELECT id, client_id, user_id, scopes, audience, refresh_token_expires_at, revoked_at, parent_token_id
    FROM oauth_tokens WHERE refresh_token_hash = ?
  `).get(hash);
    if (!row)
        return { error: 'invalid_grant', status: 400 };
    if (row.client_id !== clientId)
        return { error: 'invalid_grant', status: 400 };
    // ---- Replay detection (C3) ----
    if (row.revoked_at) {
        // A revoked refresh token was replayed — assume token theft. Cascade-revoke the chain.
        const rootId = findChainRoot(row.id);
        revokeChain(rootId);
        (0, sessionManager_1.revokeUserSessionsForClient)(row.user_id, clientId);
        (0, auditLog_1.writeAudit)({
            userId: row.user_id,
            action: 'oauth.token.replay_detected',
            details: { client_id: clientId },
            ip,
        });
        (0, auditLog_1.logWarn)(`[OAuth] Refresh token replay detected for user=${row.user_id} client=${clientId} ip=${ip ?? '-'}`);
        return { error: 'invalid_grant', status: 400 };
    }
    if (new Date(row.refresh_token_expires_at) < new Date())
        return { error: 'invalid_grant', status: 400 };
    // Revoke old pair immediately (rotation) and issue new pair linked to old row
    database_1.db.prepare('UPDATE oauth_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
    // Terminate active MCP sessions for the old token's client so client must re-authenticate
    (0, sessionManager_1.revokeUserSessionsForClient)(row.user_id, clientId);
    const tokens = issueTokens(clientId, row.user_id, JSON.parse(row.scopes), row.id, row.audience ?? null);
    (0, auditLog_1.writeAudit)({ userId: row.user_id, action: 'oauth.token.refresh', details: { client_id: clientId }, ip });
    return { tokens };
}
// ---------------------------------------------------------------------------
// Token revocation
// ---------------------------------------------------------------------------
function revokeToken(rawToken, clientId, userId, ip) {
    const hash = hashToken(rawToken);
    // Get the user_id for the token so we can revoke its MCP sessions
    const row = database_1.db.prepare('SELECT user_id FROM oauth_tokens WHERE (access_token_hash = ? OR refresh_token_hash = ?) AND client_id = ?').get(hash, hash, clientId);
    database_1.db.prepare(`
    UPDATE oauth_tokens
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE (access_token_hash = ? OR refresh_token_hash = ?) AND client_id = ?
  `).run(hash, hash, clientId);
    const affectedUserId = row?.user_id ?? userId;
    if (affectedUserId) {
        (0, sessionManager_1.revokeUserSessionsForClient)(affectedUserId, clientId);
        (0, auditLog_1.writeAudit)({ userId: affectedUserId, action: 'oauth.token.revoke', details: { client_id: clientId, method: 'token' }, ip });
    }
}
// ---------------------------------------------------------------------------
// Active session listing (for user settings page)
// ---------------------------------------------------------------------------
function listOAuthSessions(userId) {
    const rows = database_1.db.prepare(`
    SELECT ot.id, ot.client_id, oc.name AS client_name, ot.scopes,
           ot.access_token_expires_at, ot.refresh_token_expires_at, ot.created_at
    FROM oauth_tokens ot
    JOIN oauth_clients oc ON ot.client_id = oc.client_id
    WHERE ot.user_id = ?
      AND ot.revoked_at IS NULL
      AND ot.refresh_token_expires_at > CURRENT_TIMESTAMP
    ORDER BY ot.created_at DESC
  `).all(userId);
    return rows.map(r => ({ ...r, scopes: JSON.parse(r.scopes) }));
}
function revokeSession(userId, sessionId, ip) {
    const row = database_1.db.prepare('SELECT id, client_id FROM oauth_tokens WHERE id = ? AND user_id = ?').get(sessionId, userId);
    if (!row)
        return { error: 'Session not found', status: 404 };
    database_1.db.prepare('UPDATE oauth_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
    (0, sessionManager_1.revokeUserSessionsForClient)(userId, row.client_id);
    (0, auditLog_1.writeAudit)({ userId, action: 'oauth.token.revoke', details: { client_id: row.client_id, method: 'session' }, ip });
    return { success: true };
}
function validateAuthorizeRequest(params, userId) {
    if (!(0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.MCP)) {
        return { valid: false, error: 'mcp_disabled', error_description: 'MCP is not enabled on this server' };
    }
    if (params.response_type !== 'code') {
        return { valid: false, error: 'unsupported_response_type', error_description: 'Only response_type=code is supported' };
    }
    if (!params.code_challenge || params.code_challenge_method !== 'S256') {
        return { valid: false, error: 'invalid_request', error_description: 'PKCE with code_challenge_method=S256 is required (OAuth 2.1)' };
    }
    // H1: Enforce code_challenge format (RFC 7636 §4.2)
    if (!CODE_CHALLENGE_RE.test(params.code_challenge)) {
        return { valid: false, error: 'invalid_request', error_description: 'code_challenge must be 43 base64url characters (S256)' };
    }
    if (!params.client_id) {
        return { valid: false, error: 'invalid_request', error_description: 'client_id is required' };
    }
    const client = database_1.db.prepare('SELECT * FROM oauth_clients WHERE client_id = ?').get(params.client_id);
    if (!client) {
        return { valid: false, error: 'invalid_client', error_description: 'Unknown client_id' };
    }
    const allowedUris = JSON.parse(client.redirect_uris);
    if (!params.redirect_uri || !allowedUris.includes(params.redirect_uri)) {
        return { valid: false, error: 'invalid_redirect_uri', error_description: 'redirect_uri does not match any registered URI' };
    }
    // RFC 8707 resource indicator: if provided, must identify the memove
    // MCP endpoint exactly. If the client didn't supply `resource`, we
    // bind the token to the MCP endpoint by default — previously this
    // left `audience = null`, and the audience-bind check on MCP requests
    // then treated a null audience as "valid for any resource".
    const mcpResource = `${(0, notifications_1.getMcpSafeUrl)().replace(/\/+$/, '')}/mcp`;
    const resource = params.resource
        ? params.resource.replace(/\/+$/, '')
        : mcpResource;
    if (resource !== mcpResource) {
        return { valid: false, error: 'invalid_target', error_description: 'Requested resource must be the memove MCP endpoint' };
    }
    const requestedScopes = (params.scope || '').split(' ').filter(Boolean);
    if (requestedScopes.length === 0) {
        return { valid: false, error: 'invalid_scope', error_description: 'At least one scope is required' };
    }
    const allowedScopes = JSON.parse(client.allowed_scopes);
    // Narrow to the intersection: drop scopes the client isn't permitted for rather
    // than rejecting the whole request (per OAuth 2.0 §3.3 scope narrowing).
    const grantedScopes = requestedScopes.filter(s => allowedScopes.includes(s));
    if (grantedScopes.length === 0) {
        return { valid: false, error: 'invalid_scope', error_description: 'None of the requested scopes are permitted for this client' };
    }
    if (userId === null) {
        // H3: return only the minimum required fields — do NOT expose scopes, client.name, or
        // allowed_scopes to unauthenticated callers to prevent client enumeration.
        return { valid: true, loginRequired: true };
    }
    const existingConsent = getConsent(params.client_id, userId);
    const consentRequired = !existingConsent || !isConsentSufficient(existingConsent, grantedScopes);
    return {
        valid: true,
        client: { name: client.name, allowed_scopes: allowedScopes },
        scopes: grantedScopes,
        resource: resource ?? mcpResource,
        consentRequired,
        scopeSelectable: client.created_via === 'dcr',
    };
}
// ---------------------------------------------------------------------------
// PKCE verification
// ---------------------------------------------------------------------------
function verifyPKCE(codeVerifier, codeChallenge) {
    // H1: validate code_verifier format before hashing
    if (!CODE_VERIFIER_RE.test(codeVerifier))
        return false;
    const expected = crypto_1.default.createHash('sha256').update(codeVerifier).digest('base64url');
    // Constant-time compare (both are base64url strings of equal length for S256)
    if (expected.length !== codeChallenge.length)
        return false;
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(expected), Buffer.from(codeChallenge));
    }
    catch {
        return false;
    }
}
// ---------------------------------------------------------------------------
// Client authentication (for token endpoint)
// ---------------------------------------------------------------------------
function authenticateClient(clientId, clientSecret) {
    const client = database_1.db.prepare('SELECT * FROM oauth_clients WHERE client_id = ?').get(clientId);
    if (!client)
        return null;
    if (client.is_public) {
        // Public clients are identified by client_id alone — PKCE provides the security guarantee.
        return client;
    }
    // H4: constant-time comparison to prevent timing side-channel
    if (!clientSecret)
        return null;
    if (!timingSafeEqualHex(hashToken(clientSecret), client.client_secret_hash))
        return null;
    return client;
}
