"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoveOAuthProvider = exports.memoveClientsStore = void 0;
const errors_1 = require("@modelcontextprotocol/sdk/server/auth/errors");
const database_1 = require("../db/database");
const oauthService_1 = require("../services/oauthService");
const scopes_1 = require("./scopes");
const notifications_1 = require("../services/notifications");
const auditLog_1 = require("../services/auditLog");
// ---------------------------------------------------------------------------
// Redirect URI validation (mirrors oauth.ts DCR checks)
// ---------------------------------------------------------------------------
const DANGEROUS_SCHEMES = new Set([
    'javascript:', 'data:', 'vbscript:', 'file:', 'blob:', 'about:', 'chrome:', 'chrome-extension:',
]);
function assertValidRedirectUris(uris) {
    for (const u of uris) {
        let url;
        try {
            url = new URL(u);
        }
        catch {
            throw new errors_1.InvalidClientMetadataError(`Invalid redirect URI: ${u}`);
        }
        if (DANGEROUS_SCHEMES.has(url.protocol))
            throw new errors_1.InvalidClientMetadataError(`Dangerous redirect URI scheme: ${u}`);
        if (url.protocol === 'https:')
            continue;
        if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'))
            continue;
        const scheme = url.protocol.slice(0, -1);
        if (/^[a-z][a-z0-9+.-]*$/i.test(scheme) && scheme.includes('.'))
            continue;
        throw new errors_1.InvalidClientMetadataError('redirect_uris must be HTTPS, loopback HTTP, or a private custom scheme');
    }
}
// ---------------------------------------------------------------------------
// Row → SDK client info shape
// ---------------------------------------------------------------------------
function rowToInfo(row) {
    return {
        client_id: row.client_id,
        client_name: row.name,
        redirect_uris: JSON.parse(row.redirect_uris),
        scope: JSON.parse(row.allowed_scopes).join(' '),
        token_endpoint_auth_method: row.is_public ? 'none' : 'client_secret_post',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
    };
}
// ---------------------------------------------------------------------------
// Clients store
// ---------------------------------------------------------------------------
exports.memoveClientsStore = {
    async getClient(clientId) {
        const row = database_1.db.prepare('SELECT client_id, name, redirect_uris, allowed_scopes, is_public, created_via FROM oauth_clients WHERE client_id = ?').get(clientId);
        return row ? rowToInfo(row) : undefined;
    },
    async registerClient(metadata) {
        const uris = metadata.redirect_uris;
        assertValidRedirectUris(uris);
        const isPublic = metadata.token_endpoint_auth_method === 'none';
        const name = (typeof metadata.client_name === 'string' ? metadata.client_name.trim() : '').slice(0, 100) || 'MCP Client';
        // When scope is absent (ChatGPT DCR), default to all scopes.
        // The user still grants only what they approve at the consent screen.
        const rawScopes = metadata.scope ? metadata.scope.split(' ') : scopes_1.ALL_SCOPES;
        const scopes = rawScopes.filter(s => scopes_1.ALL_SCOPES.includes(s));
        if (scopes.length === 0)
            throw new errors_1.InvalidClientMetadataError('No valid scopes requested');
        const result = (0, oauthService_1.createOAuthClient)(null, name, uris, scopes, null, { isPublic, createdVia: 'dcr' });
        if (result.error)
            throw new errors_1.InvalidClientMetadataError(result.error);
        const c = result.client;
        return {
            client_id: c.client_id,
            client_name: c.name,
            redirect_uris: c.redirect_uris,
            scope: c.allowed_scopes.join(' '),
            token_endpoint_auth_method: isPublic ? 'none' : 'client_secret_post',
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            ...(c.client_secret ? { client_secret: c.client_secret, client_secret_expires_at: 0 } : {}),
        };
    },
};
// ---------------------------------------------------------------------------
// OAuthServerProvider
// ---------------------------------------------------------------------------
exports.memoveOAuthProvider = {
    get clientsStore() { return exports.memoveClientsStore; },
    // Redirects browser to the SPA consent page with OAuth params forwarded.
    async authorize(client, params, res) {
        const mcpResource = `${(0, notifications_1.getMcpSafeUrl)().replace(/\/+$/, '')}/mcp`;
        const resource = params.resource ? params.resource.href.replace(/\/+$/, '') : mcpResource;
        if (resource !== mcpResource) {
            const url = new URL(params.redirectUri);
            url.searchParams.set('error', 'invalid_target');
            url.searchParams.set('error_description', 'Requested resource must be the memove MCP endpoint');
            if (params.state)
                url.searchParams.set('state', params.state);
            res.redirect(302, url.toString());
            return;
        }
        const qs = new URLSearchParams({
            client_id: client.client_id,
            redirect_uri: params.redirectUri,
            scope: params.scopes.join(' '),
            code_challenge: params.codeChallenge,
            code_challenge_method: 'S256',
        });
        if (params.state)
            qs.set('state', params.state);
        if (params.resource)
            qs.set('resource', params.resource.href);
        const base = (0, notifications_1.getMcpSafeUrl)().replace(/\/+$/, '');
        res.redirect(302, `${base}/oauth/consent?${qs.toString()}`);
    },
    // Not called because skipLocalPkceValidation = true.
    // PKCE verification is done inline in exchangeAuthorizationCode.
    skipLocalPkceValidation: true,
    async challengeForAuthorizationCode(_client, _code) {
        throw new errors_1.ServerError('PKCE validation is handled by the provider directly');
    },
    async exchangeAuthorizationCode(client, code, codeVerifier, redirectUri, resource) {
        const pending = (0, oauthService_1.consumeAuthCode)(code);
        if (!pending || pending.clientId !== client.client_id)
            throw new Error('Authorization grant is invalid.');
        if (redirectUri && pending.redirectUri !== redirectUri)
            throw new Error('Authorization grant is invalid.');
        const resourceStr = resource ? resource.href.replace(/\/+$/, '') : null;
        if (pending.resource && resourceStr && pending.resource !== resourceStr)
            throw new Error('Authorization grant is invalid.');
        if (codeVerifier && !(0, oauthService_1.verifyPKCE)(codeVerifier, pending.codeChallenge))
            throw new Error('Authorization grant is invalid.');
        const tokens = (0, oauthService_1.issueTokens)(client.client_id, pending.userId, pending.scopes, null, pending.resource ?? null);
        (0, auditLog_1.writeAudit)({
            userId: pending.userId,
            action: 'oauth.token.issue',
            details: { client_id: client.client_id, scopes: pending.scopes, audience: pending.resource ?? null },
            ip: null,
        });
        return tokens;
    },
    async exchangeRefreshToken(client, refreshToken, _scopes, _resource) {
        const result = (0, oauthService_1.refreshTokens)(refreshToken, client.client_id, client.client_secret, null);
        if (result.error)
            throw new Error(result.error === 'invalid_client' ? 'Invalid client credentials' : 'Refresh token is invalid or expired');
        return result.tokens;
    },
    async verifyAccessToken(token) {
        const info = (0, oauthService_1.getUserByAccessToken)(token);
        if (!info)
            throw new Error('Invalid or expired token');
        return {
            token,
            clientId: info.clientId,
            scopes: info.scopes,
            extra: { user: info.user },
        };
    },
    async revokeToken(client, request) {
        (0, oauthService_1.revokeToken)(request.token, client.client_id, undefined, null);
    },
};
