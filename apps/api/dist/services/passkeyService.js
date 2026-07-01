"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.passkeyRegisterOptions = passkeyRegisterOptions;
exports.passkeyRegisterVerify = passkeyRegisterVerify;
exports.passkeyLoginOptions = passkeyLoginOptions;
exports.passkeyLoginVerify = passkeyLoginVerify;
exports.listPasskeys = listPasskeys;
exports.renamePasskey = renamePasskey;
exports.deletePasskey = deletePasskey;
exports.adminResetPasskeys = adminResetPasskeys;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const server_1 = require("@simplewebauthn/server");
const database_1 = require("../db/database");
const webauthnConfig_1 = require("./webauthnConfig");
const authService_1 = require("./authService");
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// Short single-use challenge lifetime — a ceremony is a few seconds of user
// interaction. Kept tight so a stray row can't be replayed and the table can't
// accumulate. Mirrors the spirit of the OIDC state TTL.
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
// Pinned COSE algorithms: EdDSA (-8), ES256 (-7), RS256 (-257). We never want a
// future library default to silently widen what we accept.
const SUPPORTED_ALGORITHM_IDS = [-8, -7, -257];
const NOT_CONFIGURED = { error: 'Passkey login is not configured for this server.', status: 400 };
// One generic message for every authentication failure so the endpoint can't be
// used to tell "no such credential" apart from "bad signature" (CWE-203).
const AUTH_FAILED = { error: 'Authentication failed', status: 401 };
// ---------------------------------------------------------------------------
// Challenge store (DB-backed, single-use, TTL'd)
// ---------------------------------------------------------------------------
function purgeExpiredChallenges(now) {
    database_1.db.prepare('DELETE FROM webauthn_challenges WHERE expires_at < ?').run(now);
}
function storeChallenge(challenge, userId, type, now) {
    database_1.db.prepare('INSERT INTO webauthn_challenges (challenge, user_id, type, expires_at) VALUES (?, ?, ?, ?)')
        .run(challenge, userId, type, now + CHALLENGE_TTL_MS);
}
/**
 * Atomically claim a challenge by its EXACT bytes + type. This is a single
 * DELETE ... RETURNING statement that runs BEFORE any async verification, so a
 * concurrent double-submit of the same assertion can never spend one challenge
 * twice (the replay window a SELECT→await→DELETE ordering would open).
 */
function claimChallenge(challenge, type, now) {
    const row = database_1.db.prepare('DELETE FROM webauthn_challenges WHERE challenge = ? AND type = ? AND expires_at > ? RETURNING user_id').get(challenge, type, now);
    return row ?? null;
}
/** Decode the challenge the authenticator echoed back inside clientDataJSON. */
function challengeFromResponse(resp) {
    try {
        const cdj = resp?.response?.clientDataJSON;
        if (typeof cdj !== 'string')
            return null;
        const parsed = JSON.parse(Buffer.from(cdj, 'base64url').toString('utf8'));
        return typeof parsed.challenge === 'string' ? parsed.challenge : null;
    }
    catch {
        return null;
    }
}
function parseTransports(raw) {
    if (!raw)
        return undefined;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
function sanitizeName(raw) {
    if (typeof raw !== 'string')
        return null;
    const trimmed = raw.trim().slice(0, 60);
    return trimmed || null;
}
function defaultCredentialName(deviceType) {
    return deviceType === 'multiDevice' ? 'Passkey (synced)' : 'Passkey';
}
// ---------------------------------------------------------------------------
// Registration (authenticated — from Settings, password re-auth required)
// ---------------------------------------------------------------------------
async function passkeyRegisterOptions(userId, password) {
    const cfg = (0, webauthnConfig_1.resolveWebauthnConfig)();
    if (!cfg)
        return { ...NOT_CONFIGURED };
    const user = database_1.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user)
        return { error: 'User not found', status: 404 };
    // Re-authentication: a hijacked session must not be able to silently plant an
    // attacker-controlled passkey. Require the current password (parity with the
    // change-password / disable-MFA step-up).
    if (!password || !user.password_hash || !bcryptjs_1.default.compareSync(password, user.password_hash)) {
        return { error: 'Incorrect password', status: 401 };
    }
    const existing = database_1.db.prepare('SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = ?')
        .all(userId);
    const now = Date.now();
    purgeExpiredChallenges(now);
    const options = await (0, server_1.generateRegistrationOptions)({
        rpName: cfg.rpName,
        rpID: cfg.rpID,
        userName: user.email,
        userDisplayName: user.username,
        userID: new TextEncoder().encode(String(user.id)),
        attestationType: 'none',
        // Stop the same authenticator from enrolling twice on this account.
        excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: parseTransports(c.transports) })),
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        supportedAlgorithmIDs: SUPPORTED_ALGORITHM_IDS,
    });
    storeChallenge(options.challenge, userId, 'registration', now);
    return { options };
}
async function passkeyRegisterVerify(userId, body) {
    const cfg = (0, webauthnConfig_1.resolveWebauthnConfig)();
    if (!cfg)
        return { ...NOT_CONFIGURED };
    const resp = body?.attestationResponse;
    if (!resp)
        return { error: 'Invalid registration response', status: 400 };
    const challenge = challengeFromResponse(resp);
    if (!challenge)
        return { error: 'Invalid registration response', status: 400 };
    const now = Date.now();
    const claimed = claimChallenge(challenge, 'registration', now);
    if (!claimed || claimed.user_id !== userId) {
        return { error: 'Registration challenge expired. Please try again.', status: 400 };
    }
    let verification;
    try {
        verification = await (0, server_1.verifyRegistrationResponse)({
            response: resp,
            expectedChallenge: challenge,
            expectedOrigin: cfg.origins,
            expectedRPID: cfg.rpID,
            requireUserVerification: true,
        });
    }
    catch {
        return { error: 'Could not register this passkey.', status: 400 };
    }
    if (!verification.verified || !verification.registrationInfo) {
        return { error: 'Could not register this passkey.', status: 400 };
    }
    // Persist ONLY the values the verifier vouches for — never anything parsed
    // from the raw client payload.
    const { credential, credentialDeviceType, credentialBackedUp, aaguid } = verification.registrationInfo;
    if (database_1.db.prepare('SELECT id FROM webauthn_credentials WHERE credential_id = ?').get(credential.id)) {
        return { error: 'This passkey is already registered.', status: 409 };
    }
    const name = sanitizeName(body?.name) || defaultCredentialName(credentialDeviceType);
    try {
        database_1.db.prepare(`INSERT INTO webauthn_credentials
         (user_id, credential_id, public_key, counter, transports, device_type, backed_up, name, aaguid, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`).run(userId, credential.id, Buffer.from(credential.publicKey), credential.counter ?? 0, credential.transports ? JSON.stringify(credential.transports) : null, credentialDeviceType ?? null, credentialBackedUp ? 1 : 0, name, aaguid ?? null);
    }
    catch {
        return { error: 'Could not register this passkey.', status: 400 };
    }
    const created = database_1.db.prepare('SELECT id, name, device_type, backed_up, created_at, last_used_at FROM webauthn_credentials WHERE credential_id = ?').get(credential.id);
    return { success: true, credential: { ...created, backed_up: created.backed_up === 1 } };
}
// ---------------------------------------------------------------------------
// Authentication (public — primary, discoverable-credential login)
// ---------------------------------------------------------------------------
async function passkeyLoginOptions() {
    const cfg = (0, webauthnConfig_1.resolveWebauthnConfig)();
    if (!cfg)
        return { ...NOT_CONFIGURED };
    const now = Date.now();
    purgeExpiredChallenges(now);
    const options = await (0, server_1.generateAuthenticationOptions)({
        rpID: cfg.rpID,
        userVerification: 'required',
        // Empty allowCredentials → discoverable flow. The server never echoes which
        // accounts have passkeys, so the endpoint can't be used to enumerate users.
    });
    storeChallenge(options.challenge, null, 'authentication', now);
    return { options };
}
async function passkeyLoginVerify(body) {
    const cfg = (0, webauthnConfig_1.resolveWebauthnConfig)();
    if (!cfg)
        return { ...NOT_CONFIGURED };
    const resp = body?.assertionResponse;
    if (!resp)
        return { ...AUTH_FAILED };
    const challenge = challengeFromResponse(resp);
    if (!challenge)
        return { ...AUTH_FAILED };
    // Claim the challenge (single-use) BEFORE looking anything up or verifying.
    const now = Date.now();
    if (!claimChallenge(challenge, 'authentication', now))
        return { ...AUTH_FAILED };
    const credId = resp.id ?? resp.rawId;
    if (typeof credId !== 'string')
        return { ...AUTH_FAILED };
    const cred = database_1.db.prepare('SELECT * FROM webauthn_credentials WHERE credential_id = ?').get(credId);
    if (!cred)
        return { ...AUTH_FAILED };
    let verification;
    try {
        verification = await (0, server_1.verifyAuthenticationResponse)({
            response: resp,
            expectedChallenge: challenge,
            expectedOrigin: cfg.origins,
            expectedRPID: cfg.rpID,
            requireUserVerification: true,
            credential: {
                id: cred.credential_id,
                publicKey: new Uint8Array(cred.public_key),
                counter: cred.counter,
                transports: parseTransports(cred.transports),
            },
        });
    }
    catch {
        return { ...AUTH_FAILED };
    }
    if (!verification.verified)
        return { ...AUTH_FAILED };
    const { newCounter } = verification.authenticationInfo;
    // Clone detection only makes sense for authenticators that actually increment.
    // Synced passkeys legitimately report a counter that stays 0 — never treat
    // that as a clone. A regression from a previously NON-ZERO counter rejects
    // THIS assertion (and is audited) but does not disable the credential.
    if (cred.counter > 0 && newCounter <= cred.counter) {
        return { ...AUTH_FAILED, auditUserId: cred.user_id, auditAction: 'user.passkey_clone_suspected' };
    }
    const user = database_1.db.prepare('SELECT * FROM users WHERE id = ?').get(cred.user_id);
    if (!user)
        return { ...AUTH_FAILED };
    // Persist the new counter + last-used and bump login bookkeeping atomically.
    database_1.db.transaction(() => {
        database_1.db.prepare('UPDATE webauthn_credentials SET counter = ?, last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(newCounter, cred.id);
        database_1.db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP, login_count = login_count + 1 WHERE id = ?').run(user.id);
    })();
    // A user-verified passkey is phishing-resistant and inherently two-factor
    // (device possession + biometric/PIN), so it mints the real session directly
    // — the SAME path as password and OIDC login (no new token shape).
    const token = (0, authService_1.generateToken)(user);
    const userSafe = (0, authService_1.stripUserForClient)(user);
    return { token, user: { ...userSafe, avatar_url: (0, authService_1.avatarUrl)(user) }, auditUserId: Number(user.id) };
}
// ---------------------------------------------------------------------------
// Management (authenticated, owner-scoped)
// ---------------------------------------------------------------------------
function listPasskeys(userId) {
    const rows = database_1.db.prepare('SELECT id, name, device_type, backed_up, created_at, last_used_at FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at DESC').all(userId);
    return rows.map((r) => ({ ...r, backed_up: r.backed_up === 1 }));
}
function renamePasskey(userId, id, name) {
    const cleanName = sanitizeName(name);
    if (!cleanName)
        return { error: 'Name is required', status: 400 };
    // Ownership enforced in SQL (404 on miss, never a 403 that leaks existence).
    const result = database_1.db.prepare('UPDATE webauthn_credentials SET name = ? WHERE id = ? AND user_id = ?').run(cleanName, Number(id), userId);
    if (result.changes === 0)
        return { error: 'Passkey not found', status: 404 };
    return { success: true };
}
function deletePasskey(userId, id, password) {
    // Re-auth before removing a credential (a hijacked session must not be able to
    // strip the victim's passkeys). Deleting is always allowed because every
    // account keeps a usable password as recovery fallback — losing all passkeys
    // can never lock anyone out.
    const user = database_1.db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);
    if (!user || !user.password_hash || !password || !bcryptjs_1.default.compareSync(password, user.password_hash)) {
        return { error: 'Incorrect password', status: 401 };
    }
    const result = database_1.db.prepare('DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?').run(Number(id), userId);
    if (result.changes === 0)
        return { error: 'Passkey not found', status: 404 };
    return { success: true };
}
/** Admin: clear all of a user's passkeys (e.g. on suspected compromise). */
function adminResetPasskeys(targetUserId) {
    const target = database_1.db.prepare('SELECT id, email FROM users WHERE id = ?').get(targetUserId);
    if (!target)
        return { error: 'User not found', status: 404 };
    const result = database_1.db.prepare('DELETE FROM webauthn_credentials WHERE user_id = ?').run(targetUserId);
    return { success: true, deleted: result.changes, email: target.email };
}
