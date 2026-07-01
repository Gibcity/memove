"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cookieOptions = cookieOptions;
exports.setAuthCookie = setAuthCookie;
exports.clearAuthCookie = clearAuthCookie;
const config_1 = require("../config");
const COOKIE_NAME = 'memove_session';
/**
 * Decide whether the session cookie should carry the `Secure` flag.
 *
 * We previously only derived this from `NODE_ENV=production` or
 * `FORCE_HTTPS=true`. That left behind a common self-host setup:
 * memove running behind Traefik / Caddy / Cloudflare Tunnel with
 * `NODE_ENV=development` locally and no `FORCE_HTTPS` — the cookie
 * went out without `Secure`, even though the public leg was https.
 *
 * Now we also honour `req.secure`, which Express derives from
 * `X-Forwarded-Proto` once `trust proxy` is set (memove sets it to `1`
 * in production automatically). If Express sees the request was TLS
 * on the outermost hop, the cookie is `Secure`. `COOKIE_SECURE=false`
 * remains the explicit escape hatch for plain-HTTP LAN testing.
 */
function cookieOptions(clear = false, req, remember) {
    if (process.env.COOKIE_SECURE?.toLowerCase() === 'false') {
        return buildOptions(clear, false, remember);
    }
    const envSecure = process.env.NODE_ENV?.toLowerCase() === 'production' || process.env.FORCE_HTTPS?.toLowerCase() === 'true';
    const requestSecure = req?.secure === true;
    return buildOptions(clear, envSecure || requestSecure, remember);
}
function resolveMaxAge(remember) {
    // false → session cookie (omit maxAge); true → the longer "remember me"
    // window; undefined → the historical default. Each maxAge matches the JWT exp.
    if (remember === false)
        return {};
    if (remember === true)
        return { maxAge: config_1.SESSION_DURATION_REMEMBER_MS };
    return { maxAge: config_1.SESSION_DURATION_MS };
}
function buildOptions(clear, secure, remember) {
    return {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        ...(clear ? {} : resolveMaxAge(remember)),
    };
}
function setAuthCookie(res, token, req, remember) {
    res.cookie(COOKIE_NAME, token, cookieOptions(false, req, remember));
}
function clearAuthCookie(res, req) {
    res.clearCookie(COOKIE_NAME, cookieOptions(true, req));
}
