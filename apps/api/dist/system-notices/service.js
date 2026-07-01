"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNoticeVersionActive = isNoticeVersionActive;
exports.getActiveNoticesFor = getActiveNoticesFor;
exports.dismissNotice = dismissNotice;
const semver_1 = __importDefault(require("semver"));
const database_js_1 = require("../db/database.js");
const registry_js_1 = require("./registry.js");
const conditions_js_1 = require("./conditions.js");
function getCurrentAppVersion() {
    const fromEnv = semver_1.default.valid(process.env.APP_VERSION ?? '');
    if (fromEnv)
        return fromEnv;
    try {
        const pkg = require('../../package.json');
        return semver_1.default.valid(pkg.version ?? '') ?? '0.0.0';
    }
    catch {
        return '0.0.0';
    }
}
function isNoticeVersionActive(n, currentAppVersion) {
    const appVersion = semver_1.default.coerce(currentAppVersion)?.version ?? '0.0.0';
    if (n.minVersion !== undefined) {
        const min = semver_1.default.valid(n.minVersion);
        if (!min) {
            console.warn(`[systemNotices] "${n.id}" invalid minVersion "${n.minVersion}" — skipping`);
            return false;
        }
        if (semver_1.default.lt(appVersion, min))
            return false;
    }
    if (n.maxVersion !== undefined) {
        const max = semver_1.default.valid(n.maxVersion);
        if (!max) {
            console.warn(`[systemNotices] "${n.id}" invalid maxVersion "${n.maxVersion}" — skipping`);
            return false;
        }
        if (semver_1.default.gte(appVersion, max))
            return false;
    }
    return true;
}
function severityWeight(s) {
    return s === 'critical' ? 2 : s === 'warn' ? 1 : 0;
}
function getActiveNoticesFor(userId) {
    const user = database_js_1.db.prepare('SELECT login_count, first_seen_version, role FROM users WHERE id = ?').get(userId);
    if (!user)
        return [];
    const { count: tripCount } = database_js_1.db.prepare('SELECT COUNT(*) AS count FROM trips WHERE user_id = ?').get(userId);
    const dismissedIds = new Set(database_js_1.db.prepare('SELECT notice_id FROM user_notice_dismissals WHERE user_id = ?')
        .all(userId)
        .map(r => r.notice_id));
    const now = new Date();
    const currentAppVersion = getCurrentAppVersion();
    const ctx = { user: { ...user, noTrips: tripCount }, currentAppVersion, now };
    return registry_js_1.SYSTEM_NOTICES
        .filter(n => {
        if (dismissedIds.has(n.id))
            return false;
        if (!isNoticeVersionActive(n, currentAppVersion))
            return false;
        return (0, conditions_js_1.evaluate)(n, ctx);
    })
        .sort((a, b) => {
        const pw = (b.priority ?? 0) - (a.priority ?? 0);
        if (pw !== 0)
            return pw;
        const sw = severityWeight(b.severity) - severityWeight(a.severity);
        if (sw !== 0)
            return sw;
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    })
        .map(({ conditions: _c, publishedAt: _p, minVersion: _mn, maxVersion: _mx, priority: _pr, ...dto }) => dto);
}
function dismissNotice(userId, noticeId) {
    const exists = registry_js_1.SYSTEM_NOTICES.some(n => n.id === noticeId);
    if (!exists)
        return false;
    database_js_1.db.prepare(`
    INSERT OR IGNORE INTO user_notice_dismissals (user_id, notice_id, dismissed_at)
    VALUES (?, ?, ?)
  `).run(userId, noticeId, Date.now());
    return true;
}
