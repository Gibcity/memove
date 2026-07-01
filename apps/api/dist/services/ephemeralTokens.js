"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEphemeralToken = createEphemeralToken;
exports.consumeEphemeralToken = consumeEphemeralToken;
exports.consumeEphemeralTokenWithMeta = consumeEphemeralTokenWithMeta;
exports.startTokenCleanup = startTokenCleanup;
exports.stopTokenCleanup = stopTokenCleanup;
const crypto_1 = __importDefault(require("crypto"));
const TTL = {
    ws: 30_000,
    download: 60_000,
};
const MAX_STORE_SIZE = 10_000;
const store = new Map();
function createEphemeralToken(userId, purpose, meta) {
    if (store.size >= MAX_STORE_SIZE)
        return null;
    const token = crypto_1.default.randomBytes(32).toString('hex');
    const ttl = TTL[purpose] ?? 60_000;
    store.set(token, { userId, purpose, expiresAt: Date.now() + ttl, pv: meta?.pv });
    return token;
}
function consumeEphemeralToken(token, purpose) {
    const entry = store.get(token);
    if (!entry)
        return null;
    store.delete(token);
    if (entry.purpose !== purpose || Date.now() > entry.expiresAt)
        return null;
    return entry.userId;
}
/**
 * Like `consumeEphemeralToken`, but also returns the `password_version` the
 * token was minted with. Used by the WebSocket handshake so a token issued
 * before a password change can be rejected even within its short TTL.
 */
function consumeEphemeralTokenWithMeta(token, purpose) {
    const entry = store.get(token);
    if (!entry)
        return null;
    store.delete(token);
    if (entry.purpose !== purpose || Date.now() > entry.expiresAt)
        return null;
    return { userId: entry.userId, pv: entry.pv };
}
let cleanupInterval = null;
function startTokenCleanup() {
    if (cleanupInterval)
        return;
    cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [token, entry] of store) {
            if (now > entry.expiresAt)
                store.delete(token);
        }
    }, 60_000);
    // Allow process to exit even if interval is active
    if (cleanupInterval.unref)
        cleanupInterval.unref();
}
function stopTokenCleanup() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
}
