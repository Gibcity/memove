"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.demoUploadBlock = exports.adminOnly = exports.optionalAuth = exports.requireCookieAuth = exports.authenticate = void 0;
exports.extractToken = extractToken;
exports.verifyJwtAndLoadUser = verifyJwtAndLoadUser;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../db/database");
const config_1 = require("../config");
const idempotency_1 = require("./idempotency");
const demo_1 = require("../services/demo");
function extractToken(req) {
    // Prefer httpOnly cookie; fall back to Authorization: Bearer (MCP, API clients)
    const cookieToken = req.cookies?.memove_session;
    if (cookieToken)
        return cookieToken;
    const authHeader = req.headers['authorization'];
    return (authHeader && authHeader.split(' ')[1]) || null;
}
/**
 * Verify a JWT and load its user, enforcing the password_version gate.
 *
 * Exported so every auth surface in the codebase (MCP bearer tokens,
 * file download query tokens, the photo-serving route) goes through the
 * same check. A password reset bumps `users.password_version`, which
 * invalidates every JWT that embedded the prior value — but only if
 * every verify path actually compares the claim. Previously several
 * paths called `jwt.verify` directly and skipped the DB lookup, so a
 * stolen token kept working after the victim reset.
 */
function verifyJwtAndLoadUser(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, config_1.JWT_SECRET, { algorithms: ['HS256'] });
        // Purpose-scoped tokens (e.g. the short-lived mfa_login token) share this
        // secret but are not full session tokens — only their dedicated endpoint
        // may accept them, so reject any token carrying a purpose claim here.
        if (decoded.purpose)
            return null;
        const row = database_1.db.prepare('SELECT id, username, email, role, password_version FROM users WHERE id = ?').get(decoded.id);
        if (!row)
            return null;
        // Session invalidation: any token whose embedded password_version
        // predates the user's current one is rejected. Tokens issued before
        // the `pv` claim existed (decoded.pv === undefined) are treated as
        // version 0 so legacy sessions keep working until the user resets.
        const tokenPv = typeof decoded.pv === 'number' ? decoded.pv : 0;
        const currentPv = typeof row.password_version === 'number' ? row.password_version : 0;
        if (tokenPv !== currentPv)
            return null;
        // Don't leak password_version beyond the middleware.
        const { password_version: _pv, ...user } = row;
        return user;
    }
    catch {
        return null;
    }
}
const authenticate = (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
        res.status(401).json({ error: 'Access token required', code: 'AUTH_REQUIRED' });
        return;
    }
    const user = verifyJwtAndLoadUser(token);
    if (!user) {
        res.status(401).json({ error: 'Invalid or expired token', code: 'AUTH_REQUIRED' });
        return;
    }
    req.user = user;
    (0, idempotency_1.applyIdempotency)(req, res, next, user.id);
};
exports.authenticate = authenticate;
/** Like `authenticate` but rejects requests that don't carry an httpOnly session cookie.
 *  Used on state-mutating OAuth endpoints (consent POST, client CRUD, session revoke)
 *  to prevent Bearer JWT tokens obtained by other means from managing OAuth clients. */
const requireCookieAuth = (req, res, next) => {
    const cookieToken = req.cookies?.memove_session;
    if (!cookieToken) {
        res.status(401).json({ error: 'Cookie session required for this endpoint', code: 'COOKIE_AUTH_REQUIRED' });
        return;
    }
    const user = verifyJwtAndLoadUser(cookieToken);
    if (!user) {
        res.status(401).json({ error: 'Invalid or expired session', code: 'AUTH_REQUIRED' });
        return;
    }
    req.user = user;
    next();
};
exports.requireCookieAuth = requireCookieAuth;
const optionalAuth = (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
        req.user = null;
        return next();
    }
    req.user = verifyJwtAndLoadUser(token) || null;
    next();
};
exports.optionalAuth = optionalAuth;
const adminOnly = (req, res, next) => {
    const authReq = req;
    if (!authReq.user || authReq.user.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
};
exports.adminOnly = adminOnly;
const demoUploadBlock = (req, res, next) => {
    const authReq = req;
    if (process.env.DEMO_MODE?.toLowerCase() === 'true' && (0, demo_1.isDemoEmail)(authReq.user?.email)) {
        res.status(403).json({ error: 'Uploads are disabled in demo mode. Self-host memove for full functionality.' });
        return;
    }
    next();
};
exports.demoUploadBlock = demoUploadBlock;
