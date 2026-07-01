"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessions = void 0;
exports.revokeUserSessions = revokeUserSessions;
exports.revokeUserSessionsForClient = revokeUserSessionsForClient;
exports.sessions = new Map();
/** Terminate all active MCP sessions for a specific user (e.g. on token revocation). */
function revokeUserSessions(userId) {
    for (const [sid, session] of exports.sessions) {
        if (session.userId === userId) {
            try {
                session.server.close();
            }
            catch { /* ignore */ }
            try {
                session.transport.close();
            }
            catch { /* ignore */ }
            exports.sessions.delete(sid);
        }
    }
}
/** Terminate MCP sessions for a specific (user, OAuth client) pair.
 *  Used when an OAuth token or session is revoked so only the affected client's
 *  sessions are closed, not sessions from other clients for the same user. */
function revokeUserSessionsForClient(userId, clientId) {
    for (const [sid, session] of exports.sessions) {
        if (session.userId === userId && session.clientId === clientId) {
            try {
                session.server.close();
            }
            catch { /* ignore */ }
            try {
                session.transport.close();
            }
            catch { /* ignore */ }
            exports.sessions.delete(sid);
        }
    }
}
