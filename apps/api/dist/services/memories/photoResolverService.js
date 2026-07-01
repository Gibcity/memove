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
exports.getOrCreateMemovePhoto = getOrCreateMemovePhoto;
exports.getOrCreateLocalMemovePhoto = getOrCreateLocalMemovePhoto;
exports.resolveMemovePhoto = resolveMemovePhoto;
exports.streamPhoto = streamPhoto;
exports.getPhotoInfo = getPhotoInfo;
exports.setMemovePhotoProvider = setMemovePhotoProvider;
exports.deleteMemovePhotoIfOrphan = deleteMemovePhotoIfOrphan;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const database_1 = require("../../db/database");
const immichService_1 = require("./immichService");
const synologyService_1 = require("./synologyService");
const helpersService_1 = require("./helpersService");
const apiKeyCrypto_1 = require("../apiKeyCrypto");
const photoCache = __importStar(require("./memovePhotoCache"));
const thumbnailService_1 = require("./thumbnailService");
// ── Lookup / Register ────────────────────────────────────────────────────
function getOrCreateMemovePhoto(provider, assetId, ownerId, passphrase) {
    const existing = database_1.db.prepare('SELECT id FROM memove_photos WHERE provider = ? AND asset_id = ? AND owner_id = ?').get(provider, assetId, ownerId);
    if (existing) {
        if (passphrase) {
            database_1.db.prepare('UPDATE memove_photos SET passphrase = ? WHERE id = ?')
                .run((0, apiKeyCrypto_1.encrypt_api_key)(passphrase), existing.id);
        }
        return existing.id;
    }
    const res = database_1.db.prepare('INSERT INTO memove_photos (provider, asset_id, owner_id, passphrase) VALUES (?, ?, ?, ?)').run(provider, assetId, ownerId, passphrase ? (0, apiKeyCrypto_1.encrypt_api_key)(passphrase) : null);
    return Number(res.lastInsertRowid);
}
function getOrCreateLocalMemovePhoto(filePath, thumbnailPath, width, height) {
    const existing = database_1.db.prepare("SELECT id FROM memove_photos WHERE provider = 'local' AND file_path = ?").get(filePath);
    if (existing)
        return existing.id;
    const res = database_1.db.prepare('INSERT INTO memove_photos (provider, file_path, thumbnail_path, width, height) VALUES (?, ?, ?, ?, ?)').run('local', filePath, thumbnailPath || null, width || null, height || null);
    return Number(res.lastInsertRowid);
}
function resolveMemovePhoto(photoId) {
    return database_1.db.prepare('SELECT * FROM memove_photos WHERE id = ?').get(photoId) || null;
}
// ── Streaming ────────────────────────────────────────────────────────────
async function streamCachedThumbnail(res, photo, fetchBytes, fallback) {
    const key = photoCache.cacheKey(photo.provider, photo.asset_id, 'thumbnail', photo.owner_id);
    if (photoCache.serveFresh(res, key))
        return;
    const existing = photoCache.getInFlight(key);
    if (existing) {
        const bytes = await existing;
        if (bytes && photoCache.serveFresh(res, key))
            return;
        await fallback();
        return;
    }
    const promise = fetchBytes().then(async (result) => {
        if ('error' in result)
            return null;
        await photoCache.put(key, result.bytes, result.contentType);
        return result.bytes;
    });
    photoCache.setInFlight(key, promise);
    const bytes = await promise;
    if (bytes && photoCache.serveFresh(res, key))
        return;
    await fallback();
}
async function streamPhoto(res, userId, photoId, kind) {
    const photo = resolveMemovePhoto(photoId);
    if (!photo) {
        res.status(404).json({ error: 'Photo not found' });
        return;
    }
    if (photo.file_path) {
        const uploadsRoot = path_1.default.join(__dirname, '../../../uploads');
        if (kind === 'thumbnail') {
            let thumbRel = photo.thumbnail_path ?? null;
            if (!thumbRel) {
                const result = await (0, thumbnailService_1.ensureLocalThumbnail)(uploadsRoot, photo.file_path);
                if (result) {
                    thumbRel = result.thumbnailRelPath;
                    database_1.db.prepare('UPDATE memove_photos SET thumbnail_path = ?, width = COALESCE(width, ?), height = COALESCE(height, ?) WHERE id = ?').run(thumbRel, result.width, result.height, photo.id);
                }
            }
            if (thumbRel) {
                const thumbAbs = path_1.default.join(uploadsRoot, thumbRel);
                if (fs_1.default.existsSync(thumbAbs)) {
                    res.set('Cache-Control', 'public, max-age=86400, immutable');
                    res.sendFile(thumbAbs);
                    return;
                }
            }
            // Fall through to original if thumbnail unavailable.
        }
        const localPath = path_1.default.join(uploadsRoot, photo.file_path);
        if (fs_1.default.existsSync(localPath)) {
            res.set('Cache-Control', 'public, max-age=86400');
            res.sendFile(localPath);
            return;
        }
    }
    switch (photo.provider) {
        case 'local': {
            res.status(404).json({ error: 'File not found' });
            return;
        }
        case 'immich': {
            if (kind === 'thumbnail') {
                await streamCachedThumbnail(res, photo, () => (0, immichService_1.fetchImmichThumbnailBytes)(userId, photo.asset_id, photo.owner_id), () => (0, immichService_1.streamImmichAsset)(res, userId, photo.asset_id, kind, photo.owner_id));
                return;
            }
            await (0, immichService_1.streamImmichAsset)(res, userId, photo.asset_id, kind, photo.owner_id);
            return;
        }
        case 'synologyphotos': {
            const passphrase = photo.passphrase ? ((0, apiKeyCrypto_1.decrypt_api_key)(photo.passphrase) || undefined) : undefined;
            if (kind === 'thumbnail') {
                await streamCachedThumbnail(res, photo, () => (0, synologyService_1.fetchSynologyThumbnailBytes)(userId, photo.owner_id, photo.asset_id, passphrase), () => (0, synologyService_1.streamSynologyAsset)(res, userId, photo.owner_id, photo.asset_id, kind, undefined, passphrase));
                return;
            }
            await (0, synologyService_1.streamSynologyAsset)(res, userId, photo.owner_id, photo.asset_id, kind, undefined, passphrase);
            return;
        }
        default:
            res.status(400).json({ error: `Unknown provider: ${photo.provider}` });
    }
}
// ── Asset Info ────────────────────────────────────────────────────────────
async function getPhotoInfo(userId, photoId) {
    const photo = resolveMemovePhoto(photoId);
    if (!photo)
        return (0, helpersService_1.fail)('Photo not found', 404);
    switch (photo.provider) {
        case 'local': {
            return (0, helpersService_1.success)({
                id: String(photo.id),
                takenAt: photo.created_at,
                city: null,
                country: null,
                width: photo.width,
                height: photo.height,
                fileName: photo.file_path?.split('/').pop() || null,
            });
        }
        case 'immich': {
            const result = await (0, immichService_1.getAssetInfo)(userId, photo.asset_id, photo.owner_id);
            if (result.error)
                return (0, helpersService_1.fail)(result.error, result.status || 500);
            return (0, helpersService_1.success)(result.data);
        }
        case 'synologyphotos': {
            const passphrase = photo.passphrase ? ((0, apiKeyCrypto_1.decrypt_api_key)(photo.passphrase) || undefined) : undefined;
            return (0, synologyService_1.getSynologyAssetInfo)(userId, photo.asset_id, photo.owner_id, passphrase);
        }
        default:
            return (0, helpersService_1.fail)(`Unknown provider: ${photo.provider}`, 400);
    }
}
// ── Update provider on existing memove_photo (for Immich upload sync) ─────
function setMemovePhotoProvider(memovePhotoId, provider, assetId, ownerId) {
    database_1.db.prepare('UPDATE memove_photos SET provider = ?, asset_id = ?, owner_id = ? WHERE id = ?').run(provider, assetId, ownerId, memovePhotoId);
}
// ── Orphan cleanup ───────────────────────────────────────────────────────
function deleteMemovePhotoIfOrphan(photoId) {
    const stillUsed = database_1.db.prepare(`
    SELECT 1 FROM trip_photos WHERE photo_id = ?
    UNION ALL
    SELECT 1 FROM journey_photos WHERE photo_id = ?
    LIMIT 1
  `).get(photoId, photoId);
    if (stillUsed)
        return;
    database_1.db.prepare("DELETE FROM memove_photos WHERE id = ? AND provider != 'local'").run(photoId);
}
