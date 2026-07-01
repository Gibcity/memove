"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CACHE_TTL = void 0;
exports.cacheKey = cacheKey;
exports.getFresh = getFresh;
exports.put = put;
exports.serveFresh = serveFresh;
exports.getInFlight = getInFlight;
exports.setInFlight = setInFlight;
exports.sweepExpired = sweepExpired;
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const database_1 = require("../../db/database");
const MEMOVE_PHOTO_DIR = node_path_1.default.join(__dirname, '../../../uploads/photos/memove');
exports.CACHE_TTL = 60 * 60 * 1000; // 1 hour
const inFlight = new Map();
function cacheKey(provider, assetId, kind, ownerId) {
    return node_crypto_1.default.createHash('sha1').update(`${provider}:${assetId}:${kind}:${ownerId}`).digest('hex');
}
function ensureDir() {
    if (!node_fs_1.default.existsSync(MEMOVE_PHOTO_DIR)) {
        node_fs_1.default.mkdirSync(MEMOVE_PHOTO_DIR, { recursive: true });
    }
}
function cachedFilePath(key) {
    return node_path_1.default.join(MEMOVE_PHOTO_DIR, `${key}.bin`);
}
function getFresh(key) {
    const row = database_1.db.prepare('SELECT content_type, fetched_at FROM memove_photo_cache_meta WHERE cache_key = ?').get(key);
    if (!row)
        return null;
    if (Date.now() - row.fetched_at >= exports.CACHE_TTL) {
        database_1.db.prepare('DELETE FROM memove_photo_cache_meta WHERE cache_key = ?').run(key);
        return null;
    }
    const fp = cachedFilePath(key);
    if (!node_fs_1.default.existsSync(fp)) {
        database_1.db.prepare('DELETE FROM memove_photo_cache_meta WHERE cache_key = ?').run(key);
        return null;
    }
    return { filePath: fp, contentType: row.content_type };
}
async function put(key, bytes, contentType) {
    ensureDir();
    const fp = cachedFilePath(key);
    const tmp = fp + '.tmp';
    await promises_1.default.writeFile(tmp, bytes);
    await promises_1.default.rename(tmp, fp);
    database_1.db.prepare('INSERT OR REPLACE INTO memove_photo_cache_meta (cache_key, content_type, fetched_at) VALUES (?, ?, ?)').run(key, contentType, Date.now());
}
function serveFresh(res, key) {
    const entry = getFresh(key);
    if (!entry)
        return false;
    res.set('Content-Type', entry.contentType);
    res.set('Cache-Control', 'public, max-age=3600');
    res.sendFile(entry.filePath);
    return true;
}
function getInFlight(key) {
    return inFlight.get(key);
}
function setInFlight(key, promise) {
    inFlight.set(key, promise);
    promise.finally(() => inFlight.delete(key));
}
function sweepExpired() {
    const cutoff = Date.now() - exports.CACHE_TTL * 2;
    const stale = database_1.db.prepare('SELECT cache_key FROM memove_photo_cache_meta WHERE fetched_at < ?').all(cutoff);
    for (const row of stale) {
        database_1.db.prepare('DELETE FROM memove_photo_cache_meta WHERE cache_key = ?').run(row.cache_key);
        const fp = cachedFilePath(row.cache_key);
        if (node_fs_1.default.existsSync(fp))
            node_fs_1.default.unlinkSync(fp);
    }
}
