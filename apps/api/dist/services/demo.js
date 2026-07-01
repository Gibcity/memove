"use strict";
// Central registry of demo-user email addresses.
//
// Historical: the demo account was seeded as "demo@memove.app" (see
// authService.demoLogin), but several guards — demoUploadBlock in
// middleware/auth.ts, the MFA/backup-code bypasses in authService —
// were still checking the pre-rename "demo@nomad.app" string, so they
// either never fired or silently diverged between call sites. Routing
// every check through this constant keeps them aligned.
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMO_EMAILS = exports.DEMO_EMAIL_PRIMARY = void 0;
exports.isDemoEmail = isDemoEmail;
exports.DEMO_EMAIL_PRIMARY = 'demo@memove.app';
/**
 * All email addresses that should be treated as the demo account.
 * Includes the historical `demo@nomad.app` identifier so instances that
 * upgraded in place without resetting the DB still hit demo-mode guards.
 */
exports.DEMO_EMAILS = new Set([
    exports.DEMO_EMAIL_PRIMARY,
    'demo@nomad.app',
]);
function isDemoEmail(email) {
    return !!email && exports.DEMO_EMAILS.has(email);
}
