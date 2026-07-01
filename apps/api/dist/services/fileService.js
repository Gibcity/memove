"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTripAccess = exports.filesDir = exports.BLOCKED_EXTENSIONS = exports.DEFAULT_ALLOWED_EXTENSIONS = exports.MAX_FILE_SIZE = void 0;
exports.getAllowedExtensions = getAllowedExtensions;
exports.formatFile = formatFile;
exports.resolveFilePath = resolveFilePath;
exports.authenticateDownload = authenticateDownload;
exports.getFileById = getFileById;
exports.getDeletedFile = getDeletedFile;
exports.listFiles = listFiles;
exports.createFile = createFile;
exports.updateFile = updateFile;
exports.toggleStarred = toggleStarred;
exports.softDeleteFile = softDeleteFile;
exports.restoreFile = restoreFile;
exports.permanentDeleteFile = permanentDeleteFile;
exports.emptyTrash = emptyTrash;
exports.createFileLink = createFileLink;
exports.deleteFileLink = deleteFileLink;
exports.getFileLinks = getFileLinks;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const database_1 = require("../db/database");
const ephemeralTokens_1 = require("./ephemeralTokens");
const auth_1 = require("../middleware/auth");
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
exports.MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
exports.DEFAULT_ALLOWED_EXTENSIONS = 'jpg,jpeg,png,gif,webp,heic,pdf,doc,docx,xls,xlsx,txt,csv,pkpass';
// Single authoritative blocklist for every file-upload surface (main
// file manager + collab attachments). When the admin setting
// `allowed_file_types` is `*`, this list is still enforced so the
// wildcard doesn't silently admit executables/scripts.
exports.BLOCKED_EXTENSIONS = [
    // Server-rendered / scripted content that could XSS a viewer
    '.svg', '.html', '.htm', '.xml', '.xhtml',
    // Scripts
    '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.php', '.py', '.rb', '.pl',
    // Executables
    '.exe', '.bat', '.sh', '.cmd', '.msi', '.dll', '.com', '.vbs', '.ps1', '.app',
];
exports.filesDir = path_1.default.join(__dirname, '../../uploads/files');
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
var tripAccess_1 = require("./tripAccess");
Object.defineProperty(exports, "verifyTripAccess", { enumerable: true, get: function () { return tripAccess_1.verifyTripAccess; } });
function getAllowedExtensions() {
    try {
        const row = database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'allowed_file_types'").get();
        return row?.value || exports.DEFAULT_ALLOWED_EXTENSIONS;
    }
    catch {
        return exports.DEFAULT_ALLOWED_EXTENSIONS;
    }
}
const FILE_SELECT = `
  SELECT f.*, r.title as reservation_title, u.username as uploaded_by_name, u.avatar as uploaded_by_avatar
  FROM trip_files f
  LEFT JOIN reservations r ON f.reservation_id = r.id
  LEFT JOIN users u ON f.uploaded_by = u.id
`;
function formatFile(file) {
    const tripId = file.trip_id;
    return {
        ...file,
        url: `/api/trips/${tripId}/files/${file.id}/download`,
        uploaded_by_avatar: file.uploaded_by_avatar ? `/uploads/avatars/${file.uploaded_by_avatar}` : null,
    };
}
// ---------------------------------------------------------------------------
// File path resolution & validation
// ---------------------------------------------------------------------------
function resolveFilePath(filename) {
    const safeName = path_1.default.basename(filename);
    const filePath = path_1.default.join(exports.filesDir, safeName);
    const resolved = path_1.default.resolve(filePath);
    const safe = resolved.startsWith(path_1.default.resolve(exports.filesDir));
    return { resolved, safe };
}
// ---------------------------------------------------------------------------
// Token-based download auth
// ---------------------------------------------------------------------------
function authenticateDownload(req) {
    const cookieToken = req.cookies?.memove_session;
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader ? (authHeader.split(' ')[1] || undefined) : undefined;
    const queryToken = req.query.token;
    // Cookie and Bearer both carry a full JWT — try them first (cookie wins).
    const jwtToken = cookieToken || bearerToken;
    if (jwtToken) {
        // Use the shared helper so the password_version gate applies here too;
        // previously this bypassed the check and stolen download tokens stayed
        // valid across a password reset.
        const user = (0, auth_1.verifyJwtAndLoadUser)(jwtToken);
        if (!user)
            return { error: 'Invalid or expired token', status: 401 };
        return { userId: user.id };
    }
    if (queryToken) {
        const uid = (0, ephemeralTokens_1.consumeEphemeralToken)(queryToken, 'download');
        if (!uid)
            return { error: 'Invalid or expired token', status: 401 };
        return { userId: uid };
    }
    return { error: 'Authentication required', status: 401 };
}
function getFileById(id, tripId) {
    return database_1.db.prepare('SELECT * FROM trip_files WHERE id = ? AND trip_id = ?').get(id, tripId);
}
function getDeletedFile(id, tripId) {
    return database_1.db.prepare('SELECT * FROM trip_files WHERE id = ? AND trip_id = ? AND deleted_at IS NOT NULL').get(id, tripId);
}
function listFiles(tripId, showTrash) {
    const where = showTrash ? 'f.trip_id = ? AND f.deleted_at IS NOT NULL' : 'f.trip_id = ? AND f.deleted_at IS NULL';
    const files = database_1.db.prepare(`${FILE_SELECT} WHERE ${where} ORDER BY f.starred DESC, f.created_at DESC`).all(tripId);
    const fileIds = files.map(f => f.id);
    const linksMap = {};
    if (fileIds.length > 0) {
        const placeholders = fileIds.map(() => '?').join(',');
        const links = database_1.db.prepare(`SELECT file_id, reservation_id, place_id FROM file_links WHERE file_id IN (${placeholders})`).all(...fileIds);
        for (const link of links) {
            if (!linksMap[link.file_id])
                linksMap[link.file_id] = [];
            linksMap[link.file_id].push(link);
        }
    }
    return files.map(f => {
        const fileLinks = linksMap[f.id] || [];
        return {
            ...formatFile(f),
            linked_reservation_ids: fileLinks.filter(l => l.reservation_id).map(l => l.reservation_id),
            linked_place_ids: fileLinks.filter(l => l.place_id).map(l => l.place_id),
        };
    });
}
function createFile(tripId, file, uploadedBy, opts) {
    const result = database_1.db.prepare(`
    INSERT INTO trip_files (trip_id, place_id, reservation_id, filename, original_name, file_size, mime_type, description, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tripId, opts.place_id || null, opts.reservation_id || null, file.filename, file.originalname, file.size, file.mimetype, opts.description || null, uploadedBy);
    const created = database_1.db.prepare(`${FILE_SELECT} WHERE f.id = ?`).get(result.lastInsertRowid);
    return formatFile(created);
}
function updateFile(id, current, updates) {
    database_1.db.prepare(`
    UPDATE trip_files SET
      description = ?,
      place_id = ?,
      reservation_id = ?
    WHERE id = ?
  `).run(updates.description !== undefined ? updates.description : current.description, updates.place_id !== undefined ? (updates.place_id || null) : current.place_id, updates.reservation_id !== undefined ? (updates.reservation_id || null) : current.reservation_id, id);
    const updated = database_1.db.prepare(`${FILE_SELECT} WHERE f.id = ?`).get(id);
    return formatFile(updated);
}
function toggleStarred(id, currentStarred) {
    const newStarred = currentStarred ? 0 : 1;
    database_1.db.prepare('UPDATE trip_files SET starred = ? WHERE id = ?').run(newStarred, id);
    const updated = database_1.db.prepare(`${FILE_SELECT} WHERE f.id = ?`).get(id);
    return formatFile(updated);
}
function softDeleteFile(id) {
    database_1.db.prepare('UPDATE trip_files SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}
function restoreFile(id) {
    database_1.db.prepare('UPDATE trip_files SET deleted_at = NULL WHERE id = ?').run(id);
    const restored = database_1.db.prepare(`${FILE_SELECT} WHERE f.id = ?`).get(id);
    return formatFile(restored);
}
async function permanentDeleteFile(file) {
    const { resolved } = resolveFilePath(file.filename);
    // `force: true` swallows ENOENT, replacing the prior existsSync+unlink
    // double-call that blocked the event loop twice per deletion. Only
    // drop the DB row when the on-disk unlink either succeeded or the
    // file was already gone — otherwise a permission / ENOSPC failure
    // would orphan the bytes on disk with no DB pointer left to clean it.
    try {
        await fs_1.default.promises.rm(resolved, { force: true });
    }
    catch (e) {
        console.error(`[files] unlink failed for ${file.filename}, keeping DB row:`, e);
        throw e;
    }
    database_1.db.prepare('DELETE FROM trip_files WHERE id = ?').run(file.id);
}
async function emptyTrash(tripId) {
    const trashed = database_1.db.prepare('SELECT * FROM trip_files WHERE trip_id = ? AND deleted_at IS NOT NULL').all(tripId);
    // Collect successful IDs separately so we only DELETE rows whose disk
    // content was actually removed — failing unlinks keep their DB row
    // and a retry via the single-file delete path can try again.
    const successfullyUnlinked = [];
    await Promise.all(trashed.map(async (file) => {
        const { resolved } = resolveFilePath(file.filename);
        try {
            await fs_1.default.promises.rm(resolved, { force: true });
            successfullyUnlinked.push(Number(file.id));
        }
        catch (e) {
            console.error(`[files] unlink failed for ${file.filename}, keeping DB row:`, e);
        }
    }));
    if (successfullyUnlinked.length > 0) {
        const placeholders = successfullyUnlinked.map(() => '?').join(',');
        database_1.db.prepare(`DELETE FROM trip_files WHERE id IN (${placeholders})`).run(...successfullyUnlinked);
    }
    return successfullyUnlinked.length;
}
// ---------------------------------------------------------------------------
// File links (many-to-many)
// ---------------------------------------------------------------------------
function createFileLink(fileId, opts) {
    try {
        database_1.db.prepare('INSERT OR IGNORE INTO file_links (file_id, reservation_id, assignment_id, place_id) VALUES (?, ?, ?, ?)').run(fileId, opts.reservation_id || null, opts.assignment_id || null, opts.place_id || null);
    }
    catch (err) {
        console.error('[Files] Error creating file link:', err instanceof Error ? err.message : err);
    }
    return database_1.db.prepare('SELECT * FROM file_links WHERE file_id = ?').all(fileId);
}
function deleteFileLink(linkId, fileId) {
    database_1.db.prepare('DELETE FROM file_links WHERE id = ? AND file_id = ?').run(linkId, fileId);
}
function getFileLinks(fileId) {
    return database_1.db.prepare(`
    SELECT fl.*, r.title as reservation_title
    FROM file_links fl
    LEFT JOIN reservations r ON fl.reservation_id = r.id
    WHERE fl.file_id = ?
  `).all(fileId);
}
