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
exports.BACKUP_RATE_WINDOW = exports.MAX_BACKUP_DECOMPRESSED_SIZE = exports.MAX_BACKUP_UPLOAD_SIZE = void 0;
exports.ensureBackupsDir = ensureBackupsDir;
exports.formatSize = formatSize;
exports.parseIntField = parseIntField;
exports.parseAutoBackupBody = parseAutoBackupBody;
exports.isValidBackupFilename = isValidBackupFilename;
exports.backupFilePath = backupFilePath;
exports.backupFileExists = backupFileExists;
exports.checkRateLimit = checkRateLimit;
exports.listBackups = listBackups;
exports.createBackup = createBackup;
exports.restoreFromZip = restoreFromZip;
exports.getAutoSettings = getAutoSettings;
exports.updateAutoSettings = updateAutoSettings;
exports.deleteBackup = deleteBackup;
exports.getUploadTmpDir = getUploadTmpDir;
const archiver_1 = __importDefault(require("archiver"));
const unzipper_1 = __importDefault(require("unzipper"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const database_1 = require("../db/database");
const scheduler = __importStar(require("../scheduler"));
const permissions_1 = require("./permissions");
// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const dataDir = path_1.default.join(__dirname, '../../data');
const backupsDir = path_1.default.join(dataDir, 'backups');
const uploadsDir = path_1.default.join(__dirname, '../../uploads');
// Compressed upload cap for restore archives. Defaults to 500 MB, raisable via
// BACKUP_UPLOAD_LIMIT_MB for instances whose backups (uploads/ included) grow
// past that. Invalid values warn and fall back to the default.
const DEFAULT_BACKUP_UPLOAD_LIMIT_MB = 500;
const rawBackupUploadLimit = process.env.BACKUP_UPLOAD_LIMIT_MB?.trim();
let backupUploadLimitMb = DEFAULT_BACKUP_UPLOAD_LIMIT_MB;
if (rawBackupUploadLimit) {
    const parsed = Number(rawBackupUploadLimit);
    if (Number.isFinite(parsed) && parsed > 0) {
        backupUploadLimitMb = parsed;
    }
    else {
        console.warn(`BACKUP_UPLOAD_LIMIT_MB="${rawBackupUploadLimit}" is not a positive number. Falling back to ${DEFAULT_BACKUP_UPLOAD_LIMIT_MB} MB.`);
    }
}
exports.MAX_BACKUP_UPLOAD_SIZE = backupUploadLimitMb * 1024 * 1024; // compressed
// Upper bound on the TOTAL decompressed size of a restore archive (the upload
// limit only caps the compressed bytes). Generous enough for any real backup.
exports.MAX_BACKUP_DECOMPRESSED_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ensureBackupsDir() {
    if (!fs_1.default.existsSync(backupsDir))
        fs_1.default.mkdirSync(backupsDir, { recursive: true });
}
function formatSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function parseIntField(raw, fallback) {
    if (typeof raw === 'number' && Number.isFinite(raw))
        return Math.floor(raw);
    if (typeof raw === 'string' && raw.trim() !== '') {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n))
            return n;
    }
    return fallback;
}
function parseAutoBackupBody(body) {
    const enabled = body.enabled === true || body.enabled === 'true' || body.enabled === 1;
    const rawInterval = body.interval;
    const interval = typeof rawInterval === 'string' && scheduler.VALID_INTERVALS.includes(rawInterval)
        ? rawInterval
        : 'daily';
    const keep_days = Math.max(0, parseIntField(body.keep_days, 7));
    const hour = Math.min(23, Math.max(0, parseIntField(body.hour, 2)));
    const day_of_week = Math.min(6, Math.max(0, parseIntField(body.day_of_week, 0)));
    const day_of_month = Math.min(28, Math.max(1, parseIntField(body.day_of_month, 1)));
    return { enabled, interval, keep_days, hour, day_of_week, day_of_month };
}
function isValidBackupFilename(filename) {
    return /^(?:auto-)?backup-[\w-]+\.zip$/.test(filename);
}
function backupFilePath(filename) {
    return path_1.default.join(backupsDir, filename);
}
function backupFileExists(filename) {
    return fs_1.default.existsSync(path_1.default.join(backupsDir, filename));
}
// ---------------------------------------------------------------------------
// Rate limiter state (shared across requests)
// ---------------------------------------------------------------------------
exports.BACKUP_RATE_WINDOW = 60 * 60 * 1000; // 1 hour
const backupAttempts = new Map();
/** Returns true if the request is allowed, false if rate-limited. */
function checkRateLimit(key, maxAttempts, windowMs) {
    const now = Date.now();
    const record = backupAttempts.get(key);
    if (record && record.count >= maxAttempts && now - record.first < windowMs) {
        return false;
    }
    if (!record || now - record.first >= windowMs) {
        backupAttempts.set(key, { count: 1, first: now });
    }
    else {
        record.count++;
    }
    return true;
}
function listBackups() {
    ensureBackupsDir();
    return fs_1.default.readdirSync(backupsDir)
        .filter(f => f.endsWith('.zip'))
        .map(filename => {
        const filePath = path_1.default.join(backupsDir, filename);
        const stat = fs_1.default.statSync(filePath);
        return {
            filename,
            size: stat.size,
            sizeText: formatSize(stat.size),
            created_at: stat.mtime.toISOString(),
        };
    })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
// ---------------------------------------------------------------------------
// Create backup
// ---------------------------------------------------------------------------
async function createBackup() {
    ensureBackupsDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `backup-${timestamp}.zip`;
    const outputPath = path_1.default.join(backupsDir, filename);
    try {
        try {
            database_1.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        }
        catch (e) { }
        await new Promise((resolve, reject) => {
            const output = fs_1.default.createWriteStream(outputPath);
            const archive = (0, archiver_1.default)('zip', { zlib: { level: 9 } });
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);
            const dbPath = path_1.default.join(dataDir, 'travel.db');
            if (fs_1.default.existsSync(dbPath)) {
                archive.file(dbPath, { name: 'travel.db' });
            }
            // Bundle the at-rest encryption key so the backup is self-contained: the
            // DB stores secrets (API keys, MFA, SMTP/OIDC) encrypted with this key, so
            // a restore onto a different install would otherwise be unable to decrypt
            // them. NOTE: this makes the backup file as sensitive as the key itself —
            // store/transfer it securely. Skipped when ENCRYPTION_KEY is provided via
            // env, since in that case the file is not the source of truth.
            const encKeyPath = path_1.default.join(dataDir, '.encryption_key');
            if (!process.env.ENCRYPTION_KEY && fs_1.default.existsSync(encKeyPath)) {
                archive.file(encKeyPath, { name: '.encryption_key' });
            }
            if (fs_1.default.existsSync(uploadsDir)) {
                // Exclude the place-photo and memove-memory caches: both are re-derivable
                // (re-fetched on demand, keyed on stable ids) and would otherwise dominate
                // backup size. Restores self-heal — the cache dirs are recreated at startup.
                archive.glob('**/*', { cwd: uploadsDir, ignore: ['photos/google/**', 'photos/memove/**'], nodir: true, dot: true }, { prefix: 'uploads' });
            }
            archive.finalize();
        });
        const stat = fs_1.default.statSync(outputPath);
        return {
            filename,
            size: stat.size,
            sizeText: formatSize(stat.size),
            created_at: stat.birthtime.toISOString(),
        };
    }
    catch (err) {
        console.error('Backup error:', err);
        if (fs_1.default.existsSync(outputPath))
            fs_1.default.unlinkSync(outputPath);
        throw err;
    }
}
async function restoreFromZip(zipPath) {
    const extractDir = path_1.default.join(dataDir, `restore-${Date.now()}`);
    let reinitFailed = null;
    try {
        // Check the declared uncompressed size from the central directory and bail
        // if it exceeds the cap, before extracting anything.
        const directory = await unzipper_1.default.Open.file(zipPath);
        const claimedSize = directory.files.reduce((sum, f) => sum + (f.uncompressedSize || 0), 0);
        if (claimedSize > exports.MAX_BACKUP_DECOMPRESSED_SIZE) {
            return { success: false, error: 'Backup exceeds the maximum decompressed size.', status: 400 };
        }
        await fs_1.default.createReadStream(zipPath)
            .pipe(unzipper_1.default.Extract({ path: extractDir }))
            .promise();
        const extractedDb = path_1.default.join(extractDir, 'travel.db');
        if (!fs_1.default.existsSync(extractedDb)) {
            fs_1.default.rmSync(extractDir, { recursive: true, force: true });
            return { success: false, error: 'Invalid backup: travel.db not found', status: 400 };
        }
        let uploadedDb = null;
        try {
            uploadedDb = new better_sqlite3_1.default(extractedDb, { readonly: true });
            const integrityResult = uploadedDb.prepare('PRAGMA integrity_check').get();
            if (integrityResult.integrity_check !== 'ok') {
                fs_1.default.rmSync(extractDir, { recursive: true, force: true });
                return { success: false, error: `Uploaded database failed integrity check: ${integrityResult.integrity_check}`, status: 400 };
            }
            const requiredTables = ['users', 'trips', 'trip_members', 'places', 'days'];
            const existingTables = uploadedDb
                .prepare("SELECT name FROM sqlite_master WHERE type='table'")
                .all();
            const tableNames = new Set(existingTables.map(t => t.name));
            for (const table of requiredTables) {
                if (!tableNames.has(table)) {
                    fs_1.default.rmSync(extractDir, { recursive: true, force: true });
                    return { success: false, error: `Uploaded database is missing required table: ${table}. This does not appear to be a memove backup.`, status: 400 };
                }
            }
        }
        catch (err) {
            fs_1.default.rmSync(extractDir, { recursive: true, force: true });
            return { success: false, error: 'Uploaded file is not a valid SQLite database', status: 400 };
        }
        finally {
            uploadedDb?.close();
        }
        (0, database_1.closeDb)();
        try {
            const dbDest = path_1.default.join(dataDir, 'travel.db');
            for (const ext of ['', '-wal', '-shm']) {
                try {
                    fs_1.default.unlinkSync(dbDest + ext);
                }
                catch (e) { }
            }
            fs_1.default.copyFileSync(extractedDb, dbDest);
            // Restore the bundled at-rest encryption key (if the archive carries one)
            // so the restored DB's encrypted secrets can be decrypted. Only the file
            // is swapped here; the in-memory key was read at startup, so a restart is
            // required for it to take effect (and an explicit ENCRYPTION_KEY env var
            // still overrides the file).
            const extractedEncKey = path_1.default.join(extractDir, '.encryption_key');
            if (fs_1.default.existsSync(extractedEncKey)) {
                fs_1.default.copyFileSync(extractedEncKey, path_1.default.join(dataDir, '.encryption_key'));
            }
            const extractedUploads = path_1.default.join(extractDir, 'uploads');
            if (fs_1.default.existsSync(extractedUploads)) {
                for (const sub of fs_1.default.readdirSync(uploadsDir)) {
                    const subPath = path_1.default.join(uploadsDir, sub);
                    if (fs_1.default.statSync(subPath).isDirectory()) {
                        for (const file of fs_1.default.readdirSync(subPath)) {
                            try {
                                fs_1.default.unlinkSync(path_1.default.join(subPath, file));
                            }
                            catch (e) { }
                        }
                    }
                }
                // Copy into the real directory behind uploadsDir. In Docker, uploadsDir
                // (/app/server/uploads) is a symlink to the mounted /app/uploads volume;
                // cpSync(dereference:false) would otherwise try to overwrite the symlink
                // node with a directory and throw ERR_FS_CP_DIR_TO_NON_DIR. realpathSync
                // is a no-op when uploadsDir is a plain directory (dev/non-Docker).
                fs_1.default.cpSync(extractedUploads, fs_1.default.realpathSync(uploadsDir), { recursive: true, force: true });
            }
        }
        finally {
            // Reopening the DB must always run (even if the copy above threw) so the
            // process is never left without a connection. Capture a reopen failure
            // instead of letting it propagate as a generic error — a backup whose
            // files already landed on disk but whose connection failed to reopen
            // needs to be reported as "restart required", not swallowed.
            try {
                (0, database_1.reinitialize)();
            }
            catch (reinitErr) {
                reinitFailed = reinitErr;
            }
            // The restored DB has different permission-override rows from
            // the pre-restore DB, but our process-local permissions cache
            // still holds the pre-restore state. Any request using a cached
            // permission would decide against the wrong grants until the
            // next restart. Dropping the cache forces a fresh read.
            (0, permissions_1.invalidatePermissionsCache)();
        }
        fs_1.default.rmSync(extractDir, { recursive: true, force: true });
        if (reinitFailed) {
            console.error('Restore: database reopen failed after file swap:', reinitFailed);
            return { success: false, error: 'Backup files were restored but the database connection could not be reopened. Restart the server to finish the restore.', status: 500 };
        }
        return { success: true };
    }
    catch (err) {
        console.error('Restore error:', err);
        if (fs_1.default.existsSync(extractDir))
            fs_1.default.rmSync(extractDir, { recursive: true, force: true });
        // Belt-and-braces: the inner `finally` already drops the permissions
        // cache after a successful swap, but if the extraction/copy step
        // itself threw before the DB swap even started, the cache wasn't
        // stale anyway. Invalidating here too costs nothing and guarantees
        // we never serve cached permissions that don't match the DB state
        // we leave the process in after a failed restore.
        try {
            (0, permissions_1.invalidatePermissionsCache)();
        }
        catch { /* best-effort */ }
        throw err;
    }
}
// ---------------------------------------------------------------------------
// Auto-backup settings
// ---------------------------------------------------------------------------
function getAutoSettings() {
    const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return { settings: scheduler.loadSettings(), timezone: tz };
}
function updateAutoSettings(body) {
    const settings = parseAutoBackupBody(body);
    scheduler.saveSettings(settings);
    scheduler.start();
    return settings;
}
// ---------------------------------------------------------------------------
// Delete backup
// ---------------------------------------------------------------------------
function deleteBackup(filename) {
    const filePath = path_1.default.join(backupsDir, filename);
    fs_1.default.unlinkSync(filePath);
}
// ---------------------------------------------------------------------------
// Upload config (multer dest)
// ---------------------------------------------------------------------------
function getUploadTmpDir() {
    return path_1.default.join(dataDir, 'tmp/');
}
