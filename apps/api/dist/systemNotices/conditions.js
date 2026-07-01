"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPredicate = registerPredicate;
exports.evaluate = evaluate;
const semver_1 = __importDefault(require("semver"));
const adminService_js_1 = require("../services/adminService.js");
// Custom predicate registry — extensible without modifying this file
const customPredicates = new Map();
function registerPredicate(id, fn) {
    customPredicates.set(id, fn);
}
function evaluateOne(condition, ctx) {
    switch (condition.kind) {
        case 'always':
            return true;
        case 'firstLogin':
            // login_count is incremented during login, so on the FIRST post-login fetch it's 1.
            return ctx.user.login_count <= 1;
        case 'noTrips':
            return ctx.user.noTrips === 0;
        case 'existingUserBeforeVersion': {
            // Show to users who existed BEFORE this version was released.
            // Backfilled users have first_seen_version='0.0.0', so all pass semver.lt.
            const userVersion = semver_1.default.valid(ctx.user.first_seen_version) ?? '0.0.0';
            const noticeVersion = semver_1.default.valid(condition.version);
            if (!noticeVersion)
                return false;
            // Strip prerelease/build metadata so '3.0.0-pre.42' is treated as '3.0.0'.
            const appVersion = semver_1.default.coerce(ctx.currentAppVersion)?.version ?? '0.0.0';
            return (semver_1.default.lt(userVersion, noticeVersion) &&
                semver_1.default.gte(appVersion, noticeVersion));
        }
        case 'dateWindow': {
            const start = new Date(condition.startsAt);
            const end = condition.endsAt ? new Date(condition.endsAt) : null;
            return ctx.now >= start && (end === null || ctx.now <= end);
        }
        case 'role':
            return condition.roles.includes(ctx.user.role);
        case 'addonEnabled':
            return (0, adminService_js_1.isAddonEnabled)(condition.addonId);
        case 'custom': {
            const fn = customPredicates.get(condition.id);
            if (!fn) {
                console.warn(`[systemNotices] unknown custom predicate: "${condition.id}"`);
                return false;
            }
            return fn(ctx);
        }
        default:
            return false;
    }
}
/** Returns true only if ALL conditions pass (AND logic). */
function evaluate(notice, ctx) {
    return notice.conditions.every(c => evaluateOne(c, ctx));
}
