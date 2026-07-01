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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getImmichCredentials = getImmichCredentials;
exports.isValidAssetId = isValidAssetId;
exports.getConnectionSettings = getConnectionSettings;
exports.setImmichAutoUpload = setImmichAutoUpload;
exports.saveImmichSettings = saveImmichSettings;
exports.testConnection = testConnection;
exports.getConnectionStatus = getConnectionStatus;
exports.browseTimeline = browseTimeline;
exports.searchPhotos = searchPhotos;
exports.getAssetInfo = getAssetInfo;
exports.fetchImmichThumbnailBytes = fetchImmichThumbnailBytes;
exports.streamImmichAsset = streamImmichAsset;
exports.listAlbums = listAlbums;
exports.getAlbumPhotos = getAlbumPhotos;
exports.syncAlbumAssets = syncAlbumAssets;
exports.uploadToImmich = uploadToImmich;
const database_1 = require("../../db/database");
const apiKeyCrypto_1 = require("../apiKeyCrypto");
const ssrfGuard_1 = require("../../utils/ssrfGuard");
const auditLog_1 = require("../auditLog");
const unifiedService_1 = require("./unifiedService");
const helpersService_1 = require("./helpersService");
// ── Credentials ────────────────────────────────────────────────────────────
function getImmichCredentials(userId) {
    const user = database_1.db.prepare('SELECT immich_url, immich_api_key FROM users WHERE id = ?').get(userId);
    if (!user?.immich_url || !user?.immich_api_key)
        return null;
    const apiKey = (0, apiKeyCrypto_1.decrypt_api_key)(user.immich_api_key);
    if (!apiKey)
        return null;
    return { immich_url: user.immich_url, immich_api_key: apiKey };
}
/** Validate that an asset ID is a safe UUID-like string (no path traversal). */
function isValidAssetId(id) {
    return /^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 100;
}
// ── Connection Settings ────────────────────────────────────────────────────
function getConnectionSettings(userId) {
    const creds = getImmichCredentials(userId);
    const prefs = database_1.db.prepare('SELECT immich_auto_upload FROM users WHERE id = ?').get(userId);
    return {
        immich_url: creds?.immich_url || '',
        connected: !!(creds?.immich_url && creds?.immich_api_key),
        auto_upload: !!(prefs?.immich_auto_upload),
    };
}
function setImmichAutoUpload(userId, enabled) {
    database_1.db.prepare('UPDATE users SET immich_auto_upload = ? WHERE id = ?').run(enabled ? 1 : 0, userId);
}
async function saveImmichSettings(userId, immichUrl, immichApiKey, clientIp) {
    if (immichUrl) {
        const ssrf = await (0, ssrfGuard_1.checkSsrf)(immichUrl.trim());
        if (!ssrf.allowed) {
            return { success: false, error: `Invalid Immich URL: ${ssrf.error}` };
        }
        database_1.db.prepare('UPDATE users SET immich_url = ?, immich_api_key = ? WHERE id = ?').run(immichUrl.trim(), (0, apiKeyCrypto_1.maybe_encrypt_api_key)(immichApiKey), userId);
        if (ssrf.isPrivate) {
            (0, auditLog_1.writeAudit)({
                userId,
                action: 'immich.private_ip_configured',
                ip: clientIp,
                details: { immich_url: immichUrl.trim(), resolved_ip: ssrf.resolvedIp },
            });
            return {
                success: true,
                warning: `Immich URL resolves to a private IP address (${ssrf.resolvedIp}). Make sure this is intentional.`,
            };
        }
    }
    else {
        database_1.db.prepare('UPDATE users SET immich_url = ?, immich_api_key = ? WHERE id = ?').run(null, (0, apiKeyCrypto_1.maybe_encrypt_api_key)(immichApiKey), userId);
    }
    return { success: true };
}
// ── Connection Test / Status ───────────────────────────────────────────────
async function testConnection(immichUrl, immichApiKey) {
    const ssrf = await (0, ssrfGuard_1.checkSsrf)(immichUrl);
    if (!ssrf.allowed)
        return { connected: false, error: ssrf.error ?? 'Invalid Immich URL' };
    try {
        const resp = await (0, ssrfGuard_1.safeFetch)(`${immichUrl}/api/users/me`, {
            headers: { 'x-api-key': immichApiKey, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok)
            return { connected: false, error: `HTTP ${resp.status}` };
        const data = await resp.json();
        // Detect http → https upgrade only: same host/port, protocol changed to https
        let canonicalUrl;
        if (resp.url) {
            const finalUrl = new URL(resp.url);
            const inputUrl = new URL(immichUrl);
            if (inputUrl.protocol === 'http:' &&
                finalUrl.protocol === 'https:' &&
                finalUrl.hostname === inputUrl.hostname &&
                finalUrl.port === inputUrl.port) {
                canonicalUrl = finalUrl.origin;
            }
        }
        return { connected: true, user: { name: data.name, email: data.email }, canonicalUrl };
    }
    catch (err) {
        return { connected: false, error: err instanceof Error ? err.message : 'Connection failed' };
    }
}
async function getConnectionStatus(userId) {
    const creds = getImmichCredentials(userId);
    if (!creds)
        return { connected: false, error: 'Not configured' };
    try {
        const resp = await (0, ssrfGuard_1.safeFetch)(`${creds.immich_url}/api/users/me`, {
            headers: { 'x-api-key': creds.immich_api_key, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok)
            return { connected: false, error: `HTTP ${resp.status}` };
        const data = await resp.json();
        return { connected: true, user: { name: data.name, email: data.email } };
    }
    catch (err) {
        return { connected: false, error: err instanceof Error ? err.message : 'Connection failed' };
    }
}
// ── Browse Timeline / Search ───────────────────────────────────────────────
async function browseTimeline(userId) {
    const creds = getImmichCredentials(userId);
    if (!creds)
        return { error: 'Immich not configured', status: 400 };
    try {
        const resp = await (0, ssrfGuard_1.safeFetch)(`${creds.immich_url}/api/timeline/buckets`, {
            method: 'GET',
            headers: { 'x-api-key': creds.immich_api_key, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok)
            return { error: 'Failed to fetch from Immich', status: resp.status };
        const buckets = await resp.json();
        return { buckets };
    }
    catch {
        return { error: 'Could not reach Immich', status: 502 };
    }
}
async function searchPhotos(userId, from, to, page = 1, size = 50) {
    const creds = getImmichCredentials(userId);
    if (!creds)
        return { error: 'Immich not configured', status: 400 };
    try {
        const resp = await (0, ssrfGuard_1.safeFetch)(`${creds.immich_url}/api/search/metadata`, {
            method: 'POST',
            headers: { 'x-api-key': creds.immich_api_key, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                takenAfter: from ? `${from}T00:00:00.000Z` : undefined,
                takenBefore: to ? `${to}T23:59:59.999Z` : undefined,
                type: 'IMAGE',
                size,
                page,
            }),
            signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok)
            return { error: 'Search failed', status: resp.status };
        const data = await resp.json();
        const items = data.assets?.items || [];
        const assets = items.map((a) => ({
            id: a.id,
            takenAt: a.fileCreatedAt || a.createdAt,
            city: a.exifInfo?.city || null,
            country: a.exifInfo?.country || null,
        }));
        return { assets, hasMore: items.length >= size };
    }
    catch {
        return { error: 'Could not reach Immich', status: 502 };
    }
}
// ── Asset Info / Proxy ─────────────────────────────────────────────────────
async function getAssetInfo(userId, assetId, ownerUserId) {
    const effectiveUserId = ownerUserId ?? userId;
    const creds = getImmichCredentials(effectiveUserId);
    if (!creds)
        return { error: 'Not found', status: 404 };
    try {
        const resp = await (0, ssrfGuard_1.safeFetch)(`${creds.immich_url}/api/assets/${assetId}`, {
            headers: { 'x-api-key': creds.immich_api_key, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok)
            return { error: 'Failed', status: resp.status };
        const asset = await resp.json();
        return {
            data: {
                id: asset.id,
                takenAt: asset.fileCreatedAt || asset.createdAt,
                width: asset.exifInfo?.exifImageWidth || null,
                height: asset.exifInfo?.exifImageHeight || null,
                camera: asset.exifInfo?.make && asset.exifInfo?.model ? `${asset.exifInfo.make} ${asset.exifInfo.model}` : null,
                lens: asset.exifInfo?.lensModel || null,
                focalLength: asset.exifInfo?.focalLength ? `${asset.exifInfo.focalLength}mm` : null,
                aperture: asset.exifInfo?.fNumber ? `f/${asset.exifInfo.fNumber}` : null,
                shutter: asset.exifInfo?.exposureTime || null,
                iso: asset.exifInfo?.iso || null,
                city: asset.exifInfo?.city || null,
                state: asset.exifInfo?.state || null,
                country: asset.exifInfo?.country || null,
                lat: asset.exifInfo?.latitude || null,
                lng: asset.exifInfo?.longitude || null,
                fileSize: asset.exifInfo?.fileSizeInByte || null,
                fileName: asset.originalFileName || null,
            },
        };
    }
    catch {
        return { error: 'Proxy error', status: 502 };
    }
}
async function fetchImmichThumbnailBytes(userId, assetId, ownerUserId) {
    const effectiveUserId = ownerUserId ?? userId;
    const creds = getImmichCredentials(effectiveUserId);
    if (!creds)
        return { error: 'Not found', status: 404 };
    const url = `${creds.immich_url}/api/assets/${assetId}/thumbnail?size=thumbnail`;
    try {
        const resp = await (0, ssrfGuard_1.safeFetch)(url, {
            headers: { 'x-api-key': creds.immich_api_key },
            signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok)
            return { error: 'Upstream error', status: resp.status };
        const contentType = resp.headers.get('content-type') || 'image/jpeg';
        const bytes = Buffer.from(await resp.arrayBuffer());
        return { bytes, contentType };
    }
    catch {
        return { error: 'Proxy error', status: 502 };
    }
}
async function streamImmichAsset(response, userId, assetId, kind, ownerUserId) {
    const effectiveUserId = ownerUserId ?? userId;
    const creds = getImmichCredentials(effectiveUserId);
    if (!creds)
        return { error: 'Not found', status: 404 };
    const timeout = kind === 'thumbnail' ? 10000 : 30000;
    const url = kind === 'thumbnail'
        ? `${creds.immich_url}/api/assets/${assetId}/thumbnail?size=thumbnail`
        : `${creds.immich_url}/api/assets/${assetId}/thumbnail?size=fullsize`;
    await (0, helpersService_1.pipeAsset)(url, response, { 'x-api-key': creds.immich_api_key }, AbortSignal.timeout(timeout), 'public, max-age=86400');
}
// ── Albums ──────────────────────────────────────────────────────────────────
async function listAlbums(userId) {
    const creds = getImmichCredentials(userId);
    if (!creds)
        return { error: 'Immich not configured', status: 400 };
    try {
        // Fetch both owned and shared albums
        const [ownResp, sharedResp] = await Promise.all([
            (0, ssrfGuard_1.safeFetch)(`${creds.immich_url}/api/albums`, {
                headers: { 'x-api-key': creds.immich_api_key, 'Accept': 'application/json' },
                signal: AbortSignal.timeout(10000),
            }),
            (0, ssrfGuard_1.safeFetch)(`${creds.immich_url}/api/albums?shared=true`, {
                headers: { 'x-api-key': creds.immich_api_key, 'Accept': 'application/json' },
                signal: AbortSignal.timeout(10000),
            }),
        ]);
        if (!ownResp.ok)
            return { error: 'Failed to fetch albums', status: ownResp.status };
        const ownAlbums = await ownResp.json();
        const sharedAlbums = sharedResp.ok ? await sharedResp.json() : [];
        const seenIds = new Set();
        const allAlbums = [...ownAlbums, ...sharedAlbums].filter((a) => {
            if (seenIds.has(a.id))
                return false;
            seenIds.add(a.id);
            return true;
        });
        const albums = allAlbums.map((a) => ({
            id: a.id,
            albumName: a.albumName,
            assetCount: a.assetCount || 0,
            startDate: a.startDate,
            endDate: a.endDate,
            albumThumbnailAssetId: a.albumThumbnailAssetId,
            shared: a.shared || a.sharedUsers?.length > 0,
        }));
        return { albums };
    }
    catch {
        return { error: 'Could not reach Immich', status: 502 };
    }
}
async function getAlbumPhotos(userId, albumId) {
    const creds = getImmichCredentials(userId);
    if (!creds)
        return { error: 'Immich not configured', status: 400 };
    try {
        const resp = await (0, ssrfGuard_1.safeFetch)(`${creds.immich_url}/api/albums/${albumId}`, {
            headers: { 'x-api-key': creds.immich_api_key, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok)
            return { error: 'Failed to fetch album', status: resp.status };
        const albumData = await resp.json();
        const assets = (albumData.assets || []).filter((a) => a.type === 'IMAGE').map((a) => ({
            id: a.id,
            takenAt: a.fileCreatedAt || a.createdAt,
            city: a.exifInfo?.city || null,
            country: a.exifInfo?.country || null,
        }));
        return { assets };
    }
    catch {
        return { error: 'Could not reach Immich', status: 502 };
    }
}
async function syncAlbumAssets(tripId, linkId, userId, sid) {
    const response = (0, helpersService_1.getAlbumIdFromLink)(tripId, linkId, userId);
    if (!response.success)
        return { error: 'Album link not found', status: 404 };
    const creds = getImmichCredentials(userId);
    if (!creds)
        return { error: 'Immich not configured', status: 400 };
    try {
        const resp = await (0, ssrfGuard_1.safeFetch)(`${creds.immich_url}/api/albums/${response.data}`, {
            headers: { 'x-api-key': creds.immich_api_key, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok)
            return { error: 'Failed to fetch album', status: resp.status };
        const albumData = await resp.json();
        const assets = (albumData.assets || []).filter((a) => a.type === 'IMAGE');
        const selection = {
            provider: 'immich',
            asset_ids: assets.map((a) => a.id),
        };
        const result = await (0, unifiedService_1.addTripPhotos)(tripId, userId, true, [selection], sid, linkId);
        if ('error' in result)
            return { error: result.error.message, status: result.error.status };
        (0, helpersService_1.updateSyncTimeForAlbumLink)(linkId);
        return { success: true, added: result.data.added, total: assets.length };
    }
    catch {
        return { error: 'Could not reach Immich', status: 502 };
    }
}
// ── Upload to Immich ──────────────────────────────────────────────────────
async function uploadToImmich(userId, filePath, fileName) {
    const creds = getImmichCredentials(userId);
    if (!creds)
        return null;
    const fs = await Promise.resolve().then(() => __importStar(require('node:fs')));
    const path = await Promise.resolve().then(() => __importStar(require('node:path')));
    const fullPath = path.join(__dirname, '../../../uploads', filePath);
    if (!fs.existsSync(fullPath))
        return null;
    try {
        const fileBuffer = fs.readFileSync(fullPath);
        const boundary = '----ImmichUpload' + Date.now();
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
            '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        const now = new Date().toISOString();
        const parts = [];
        const addField = (name, value) => {
            parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
        };
        addField('deviceAssetId', `memove-${Date.now()}`);
        addField('deviceId', 'memove');
        addField('fileCreatedAt', now);
        addField('fileModifiedAt', now);
        parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="assetData"; filename="${fileName}"\r\nContent-Type: ${contentType}\r\n\r\n`));
        parts.push(fileBuffer);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
        const body = Buffer.concat(parts);
        const res = await (0, ssrfGuard_1.safeFetch)(`${creds.immich_url}/api/assets`, {
            method: 'POST',
            headers: {
                'x-api-key': creds.immich_api_key,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': String(body.length),
            },
            body,
        });
        if (res.ok) {
            const data = await res.json();
            return data.id || null;
        }
        return null;
    }
    catch {
        return null;
    }
}
