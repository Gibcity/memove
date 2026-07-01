"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = get;
exports.getErrored = getErrored;
exports.markError = markError;
exports.put = put;
exports.getInFlight = getInFlight;
exports.setInFlight = setInFlight;
exports.serveFilePath = serveFilePath;
exports.removeIfUnreferenced = removeIfUnreferenced;
exports.sweepOrphans = sweepOrphans;
const database_1 = require("../db/database");
const jimp_1 = require("jimp");
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
// Overridable for tests (mirrors the MEMOVE_DB_FILE seam) so the suite never touches
// the real uploads tree.
const GOOGLE_PHOTO_DIR = process.env.MEMOVE_PLACE_PHOTO_DIR || node_path_1.default.join(__dirname, '../../uploads/photos/google');
const ERROR_TTL = 5 * 60 * 1000;
// Marker photos are displayed tiny — cap stored images so an oversized source
// (e.g. a Wikimedia Commons full-res original) can't bloat the cache. Matches
// THUMB_MAX/THUMB_QUALITY in memories/thumbnailService.ts.
const MAX_DIM = 800;
const JPEG_QUALITY = 80;
// In-flight dedup — prevents stampedes when multiple requests hit the same uncached placeId simultaneously
const inFlight = new Map();
// In-memory set of placeIds whose file is confirmed on disk this session.
// Avoids a synchronous fs.existsSync() call on every cache hit after the first verification.
const knownOnDisk = new Set();
// Ensure upload dir exists once at startup — avoids sync FS calls inside put() on every write.
try {
    node_fs_1.default.mkdirSync(GOOGLE_PHOTO_DIR, { recursive: true });
}
catch {
    /* already exists */
}
function filePath(placeId) {
    // Hash to avoid filename collisions — coords:lat:lng pseudo-IDs contain characters that
    // collapse identically under sanitization (e.g. ':' and '.' both → '_')
    const hash = node_crypto_1.default.createHash('sha1').update(placeId).digest('hex');
    return node_path_1.default.join(GOOGLE_PHOTO_DIR, `${hash}.jpg`);
}
function proxyUrl(placeId) {
    return `/api/maps/place-photo/${encodeURIComponent(placeId)}/bytes`;
}
function get(placeId) {
    const row = database_1.db
        .prepare('SELECT attribution FROM google_place_photo_meta WHERE place_id = ? AND error_at IS NULL')
        .get(placeId);
    if (!row)
        return null;
    const fp = filePath(placeId);
    if (!knownOnDisk.has(placeId)) {
        // First time this placeId is checked this session — verify the file exists on disk.
        // (Guards against volume wipes or manual deletion between server restarts.)
        if (!node_fs_1.default.existsSync(fp)) {
            database_1.db.prepare('DELETE FROM google_place_photo_meta WHERE place_id = ?').run(placeId);
            return null;
        }
        knownOnDisk.add(placeId);
    }
    return { photoUrl: proxyUrl(placeId), filePath: fp, attribution: row.attribution };
}
function getErrored(placeId) {
    const row = database_1.db
        .prepare('SELECT error_at FROM google_place_photo_meta WHERE place_id = ? AND error_at IS NOT NULL')
        .get(placeId);
    if (!row)
        return false;
    return Date.now() - row.error_at < ERROR_TTL;
}
function markError(placeId) {
    knownOnDisk.delete(placeId);
    database_1.db.prepare('INSERT OR REPLACE INTO google_place_photo_meta (place_id, attribution, fetched_at, error_at) VALUES (?, NULL, ?, ?)').run(placeId, Date.now(), Date.now());
}
// Downscale oversized images to MAX_DIM before caching, re-encoding to JPEG.
// Defense-in-depth: keeps the cache small regardless of what the fetch path hands
// us. Jimp auto-applies EXIF orientation on read. Falls back to the original bytes
// on any failure (corrupt/unsupported format) so behaviour is never worse than before.
async function downscale(bytes) {
    try {
        const img = await jimp_1.Jimp.read(bytes);
        if (img.bitmap.width <= MAX_DIM && img.bitmap.height <= MAX_DIM)
            return bytes;
        img.scaleToFit({ w: MAX_DIM, h: MAX_DIM });
        return await img.getBuffer(jimp_1.JimpMime.jpeg, { quality: JPEG_QUALITY });
    }
    catch {
        return bytes;
    }
}
async function put(placeId, bytes, attribution) {
    const fp = filePath(placeId);
    const tmp = fp + '.tmp';
    const resized = await downscale(bytes);
    await promises_1.default.writeFile(tmp, resized);
    await promises_1.default.rename(tmp, fp);
    knownOnDisk.add(placeId);
    database_1.db.prepare('INSERT OR REPLACE INTO google_place_photo_meta (place_id, attribution, fetched_at, error_at) VALUES (?, ?, ?, NULL)').run(placeId, attribution, Date.now());
    return { photoUrl: proxyUrl(placeId), filePath: fp, attribution };
}
function getInFlight(placeId) {
    return inFlight.get(placeId);
}
function setInFlight(placeId, promise) {
    inFlight.set(placeId, promise);
    promise
        .finally(() => inFlight.delete(placeId))
        .catch(() => {
        /* awaiter logs; this .catch only prevents unhandledRejection */
    });
}
function serveFilePath(placeId) {
    if (knownOnDisk.has(placeId))
        return filePath(placeId);
    const fp = filePath(placeId);
    if (!node_fs_1.default.existsSync(fp))
        return null;
    knownOnDisk.add(placeId);
    return fp;
}
// A cache entry is "referenced" while any place still points at it — either by the
// Google place_id (the dedup key) or by the stable proxy URL stored in image_url
// (covers coords: pseudo-ids, which never have a google_place_id).
function isReferenced(placeId) {
    const row = database_1.db
        .prepare('SELECT 1 FROM places WHERE google_place_id = ? OR image_url = ? LIMIT 1')
        .get(placeId, proxyUrl(placeId));
    return !!row;
}
function deleteEntry(placeId) {
    try {
        node_fs_1.default.unlinkSync(filePath(placeId));
    }
    catch {
        /* already gone */
    }
    database_1.db.prepare('DELETE FROM google_place_photo_meta WHERE place_id = ?').run(placeId);
    knownOnDisk.delete(placeId);
}
// Drop a cache entry if no place references it anymore. Called after a place delete
// for prompt reclamation; the nightly sweep is the catch-all for every other path.
function removeIfUnreferenced(placeId) {
    if (isReferenced(placeId))
        return;
    deleteEntry(placeId);
}
// Reclaim orphaned cache files + meta rows. Runs on startup and nightly (scheduler).
// Two passes: (1) meta rows no place references; (2) stray .jpg files with no meta row.
function sweepOrphans() {
    let removed = 0;
    const rows = database_1.db.prepare('SELECT place_id FROM google_place_photo_meta').all();
    const keepFiles = new Set();
    for (const { place_id } of rows) {
        if (isReferenced(place_id)) {
            keepFiles.add(`${node_crypto_1.default.createHash('sha1').update(place_id).digest('hex')}.jpg`);
        }
        else {
            deleteEntry(place_id);
            removed++;
        }
    }
    // Pass 2: files on disk that no surviving meta row maps to (e.g. left over from a
    // crash between writeFile and the DB upsert, or a meta row deleted out-of-band).
    let entries;
    try {
        entries = node_fs_1.default.readdirSync(GOOGLE_PHOTO_DIR);
    }
    catch {
        entries = [];
    }
    for (const entry of entries) {
        if (!entry.endsWith('.jpg') || keepFiles.has(entry))
            continue;
        try {
            node_fs_1.default.unlinkSync(node_path_1.default.join(GOOGLE_PHOTO_DIR, entry));
            removed++;
        }
        catch {
            /* race */
        }
    }
    return removed;
}
