"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOG_LEVEL = void 0;
exports.getClientIp = getClientIp;
exports.writeAudit = writeAudit;
exports.logInfo = logInfo;
exports.logDebug = logDebug;
exports.logError = logError;
exports.logWarn = logWarn;
const database_1 = require("../db/database");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
exports.LOG_LEVEL = LOG_LEVEL;
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_LOG_FILES = 5;
const C = {
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m',
};
// ── File logger with rotation ─────────────────────────────────────────────
const logsDir = path_1.default.join(process.cwd(), 'data/logs');
try {
    fs_1.default.mkdirSync(logsDir, { recursive: true });
}
catch { }
const logFilePath = path_1.default.join(logsDir, 'memove.log');
function rotateIfNeeded() {
    try {
        if (!fs_1.default.existsSync(logFilePath))
            return;
        const stat = fs_1.default.statSync(logFilePath);
        if (stat.size < MAX_LOG_SIZE)
            return;
        for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
            const src = i === 1 ? logFilePath : `${logFilePath}.${i - 1}`;
            const dst = `${logFilePath}.${i}`;
            if (fs_1.default.existsSync(src))
                fs_1.default.renameSync(src, dst);
        }
    }
    catch { }
}
function writeToFile(line) {
    try {
        rotateIfNeeded();
        fs_1.default.appendFileSync(logFilePath, line + '\n');
    }
    catch { }
}
// ── Public log helpers ────────────────────────────────────────────────────
function formatTs() {
    const tz = process.env.TZ || 'UTC';
    return new Date().toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T');
}
function logInfo(msg) {
    const ts = formatTs();
    console.log(`${C.blue}[INFO]${C.reset} ${ts} ${msg}`);
    writeToFile(`[INFO] ${ts} ${msg}`);
}
function logDebug(msg) {
    if (LOG_LEVEL !== 'debug')
        return;
    const ts = formatTs();
    console.log(`${C.cyan}[DEBUG]${C.reset} ${ts} ${msg}`);
    writeToFile(`[DEBUG] ${ts} ${msg}`);
}
function logError(msg) {
    const ts = formatTs();
    console.error(`${C.red}[ERROR]${C.reset} ${ts} ${msg}`);
    writeToFile(`[ERROR] ${ts} ${msg}`);
}
function logWarn(msg) {
    const ts = formatTs();
    console.warn(`${C.yellow}[WARN]${C.reset} ${ts} ${msg}`);
    writeToFile(`[WARN] ${ts} ${msg}`);
}
// ── IP + audit ────────────────────────────────────────────────────────────
function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string') {
        const first = xff.split(',')[0]?.trim();
        return first || null;
    }
    if (Array.isArray(xff) && xff[0])
        return String(xff[0]).trim() || null;
    return req.socket?.remoteAddress || null;
}
function resolveUserEmail(userId) {
    if (!userId)
        return 'anonymous';
    try {
        const row = database_1.db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
        return row?.email || `uid:${userId}`;
    }
    catch {
        return `uid:${userId}`;
    }
}
const ACTION_LABELS = {
    'user.register': 'registered',
    'user.login': 'logged in',
    'user.login_failed': 'login failed',
    'user.password_change': 'changed password',
    'user.account_delete': 'deleted account',
    'user.mfa_enable': 'enabled MFA',
    'user.mfa_disable': 'disabled MFA',
    'settings.app_update': 'updated settings',
    'trip.create': 'created trip',
    'trip.delete': 'deleted trip',
    'admin.user_role_change': 'changed user role',
    'admin.user_delete': 'deleted user',
    'admin.invite_create': 'created invite',
    'immich.private_ip_configured': 'configured Immich with private IP',
};
/** Best-effort; never throws — failures are logged only. */
function writeAudit(entry) {
    try {
        const detailsJson = entry.details && Object.keys(entry.details).length > 0 ? JSON.stringify(entry.details) : null;
        database_1.db.prepare(`INSERT INTO audit_log (user_id, action, resource, details, ip) VALUES (?, ?, ?, ?, ?)`).run(entry.userId, entry.action, entry.resource ?? null, detailsJson, entry.ip ?? null);
        const email = resolveUserEmail(entry.userId);
        const label = ACTION_LABELS[entry.action] || entry.action;
        const brief = buildInfoSummary(entry.action, entry.details);
        logInfo(`${email} ${label}${brief} ip=${entry.ip || '-'}`);
        if (entry.debugDetails && Object.keys(entry.debugDetails).length > 0) {
            logDebug(`AUDIT ${entry.action} userId=${entry.userId} ${JSON.stringify(entry.debugDetails)}`);
        }
        else if (detailsJson) {
            logDebug(`AUDIT ${entry.action} userId=${entry.userId} ${detailsJson}`);
        }
    }
    catch (e) {
        logError(`Audit write failed: ${e instanceof Error ? e.message : e}`);
    }
}
function buildInfoSummary(action, details) {
    if (!details || Object.keys(details).length === 0)
        return '';
    if (action === 'trip.create')
        return ` "${details.title}"`;
    if (action === 'trip.delete')
        return ` tripId=${details.tripId}`;
    if (action === 'user.register')
        return ` ${details.email}`;
    if (action === 'user.login')
        return '';
    if (action === 'user.login_failed')
        return ` reason=${details.reason}`;
    if (action === 'settings.app_update') {
        const parts = [];
        if (details.notification_channel)
            parts.push(`channel=${details.notification_channel}`);
        if (details.smtp_settings_updated)
            parts.push('smtp');
        if (details.notification_events_updated)
            parts.push('events');
        if (details.webhook_url_updated)
            parts.push('webhook_url');
        if (details.allowed_file_types_updated)
            parts.push('file_types');
        if (details.allow_registration !== undefined)
            parts.push(`registration=${details.allow_registration}`);
        if (details.require_mfa !== undefined)
            parts.push(`mfa=${details.require_mfa}`);
        return parts.length ? ` (${parts.join(', ')})` : '';
    }
    if (action === 'immich.private_ip_configured') {
        return details.resolved_ip ? ` url=${details.immich_url} ip=${details.resolved_ip}` : '';
    }
    return '';
}
