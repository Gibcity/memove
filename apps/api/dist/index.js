"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
require("dotenv/config");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_http_1 = __importDefault(require("node:http"));
const bootstrap_1 = require("./bootstrap");
// Create upload and data directories on startup
const uploadsDir = node_path_1.default.join(__dirname, '../uploads');
const photosDir = node_path_1.default.join(uploadsDir, 'photos');
const filesDir = node_path_1.default.join(uploadsDir, 'files');
const coversDir = node_path_1.default.join(uploadsDir, 'covers');
const avatarsDir = node_path_1.default.join(uploadsDir, 'avatars');
const backupsDir = node_path_1.default.join(__dirname, '../data/backups');
const tmpDir = node_path_1.default.join(__dirname, '../data/tmp');
[uploadsDir, photosDir, filesDir, coversDir, avatarsDir, backupsDir, tmpDir].forEach(dir => {
    if (!node_fs_1.default.existsSync(dir))
        node_fs_1.default.mkdirSync(dir, { recursive: true });
});
const scheduler = __importStar(require("./scheduler"));
const notifications_1 = require("./services/notifications");
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST;
const APP_VERSION = process.env.APP_VERSION || require('../package.json').version;
const onListen = () => {
    const { logInfo: sLogInfo, logWarn: sLogWarn } = require('./services/auditLog');
    const LOG_LVL = (process.env.LOG_LEVEL || 'info').toLowerCase();
    const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const origins = process.env.ALLOWED_ORIGINS || '(same-origin)';
    const appUrl = (0, notifications_1.getAppUrl)();
    const resolvedAppUrl = (0, notifications_1.getMcpSafeUrl)();
    const banner = [
        '──────────────────────────────────────',
        '  memove API started',
        `  Version         ${APP_VERSION}`,
        ...(HOST ? [`  Host:           ${HOST}`] : []),
        `  Container Port: ${PORT}`,
        `  App URL:        ${appUrl}`,
        `  Environment:    ${process.env.NODE_ENV?.toLowerCase() || 'development'}`,
        `  Timezone:       ${tz}`,
        `  Origins:        ${origins}`,
        `  Log level:      ${LOG_LVL}`,
        `  Log file:       /app/data/logs/memove.log`,
        `  PID:            ${process.pid}`,
        `  User:           uid=${process.getuid?.()} gid=${process.getgid?.()}`,
        '──────────────────────────────────────',
    ];
    banner.forEach(l => console.log(l));
    sLogInfo('NestJS serving all routes (Express decommissioned)');
    if (process.env.APP_URL) {
        let parsedAppUrl = null;
        try {
            parsedAppUrl = new URL(process.env.APP_URL);
        }
        catch { /* invalid */ }
        if (!parsedAppUrl) {
            sLogWarn(`APP_URL: "${process.env.APP_URL}" is not a valid URL — it will be ignored.`);
        }
        const mcpSafe = parsedAppUrl !== null && (parsedAppUrl.protocol === 'https:' ||
            parsedAppUrl.hostname === 'localhost' ||
            parsedAppUrl.hostname === '127.0.0.1');
        if (!mcpSafe) {
            sLogWarn(`APP_URL: not MCP-safe (requires https:// or http://localhost) — MCP will use ${resolvedAppUrl}.`);
        }
    }
    if (process.env.DEMO_MODE?.toLowerCase() === 'true')
        sLogInfo('Demo mode: ENABLED');
    if (process.env.DEMO_MODE?.toLowerCase() === 'true' && process.env.NODE_ENV?.toLowerCase() === 'production') {
        sLogWarn('SECURITY WARNING: DEMO_MODE is enabled in production!');
    }
    scheduler.start();
    scheduler.startTripReminders();
    scheduler.startTodoReminders();
    scheduler.startVersionCheck();
    scheduler.startDemoReset();
    scheduler.startIdempotencyCleanup();
    scheduler.startMemovePhotoCacheCleanup();
    scheduler.startPlacePhotoCacheCleanup();
    scheduler.startAirTrailSync();
    scheduler.startAgentTasks();
    const { startTokenCleanup } = require('./services/ephemeralTokens');
    startTokenCleanup();
    Promise.resolve().then(() => __importStar(require('./websocket'))).then(({ setupWebSocket }) => {
        setupWebSocket(server);
    });
};
let server;
let nestApp;
// Strangler toggle: prefixes served by Nest (env-overridable, instant rollback).
async function bootstrap() {
    // The whole surface runs on the single NestJS app now (Express decommissioned):
    // global pipeline + /uploads + every /api domain + the platform/transport routes
    // (/mcp, /.well-known, OAuth SDK, SPA catch-all). buildApp() owns the composition
    // order; it is shared with the integration-test harness so they can't drift.
    nestApp = await (0, bootstrap_1.buildApp)();
    server = node_http_1.default.createServer(nestApp.getHttpAdapter().getInstance());
    if (HOST)
        server.listen(PORT, HOST, onListen);
    else
        server.listen(PORT, onListen);
}
bootstrap().catch((err) => {
    console.error('Fatal: failed to bootstrap server', err);
    process.exit(1);
});
// Graceful shutdown
function shutdown(signal) {
    const { logInfo: sLogInfo, logError: sLogError } = require('./services/auditLog');
    const { closeMcpSessions } = require('./mcp');
    sLogInfo(`${signal} received — shutting down gracefully...`);
    scheduler.stop();
    closeMcpSessions();
    void nestApp?.close();
    server.close(() => {
        sLogInfo('HTTP server closed');
        const { closeDb } = require('./db/database');
        closeDb();
        sLogInfo('Shutdown complete');
        process.exit(0);
    });
    setTimeout(() => {
        sLogError('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
