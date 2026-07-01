"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fail = fail;
exports.success = success;
exports.mapDbError = mapDbError;
exports.handleServiceResult = handleServiceResult;
exports.getPhotoProviderConfig = getPhotoProviderConfig;
exports.canAccessUserPhoto = canAccessUserPhoto;
exports.canAccessMemovePhoto = canAccessMemovePhoto;
exports.getAlbumIdFromLink = getAlbumIdFromLink;
exports.getAlbumLinkForSync = getAlbumLinkForSync;
exports.updateSyncTimeForAlbumLink = updateSyncTimeForAlbumLink;
exports.pipeAsset = pipeAsset;
const promises_1 = require("node:stream/promises");
const node_stream_1 = require("node:stream");
const database_1 = require("../../db/database");
const ssrfGuard_1 = require("../../utils/ssrfGuard");
const apiKeyCrypto_1 = require("../apiKeyCrypto");
function fail(error, status) {
    return { success: false, error: { message: error, status } };
}
function success(data) {
    return { success: true, data: data };
}
function mapDbError(error, fallbackMessage) {
    if (error && /unique|constraint/i.test(error.message)) {
        return fail('Resource already exists', 409);
    }
    return fail(error.message, 500);
}
function handleServiceResult(res, result) {
    if ('error' in result) {
        res.status(result.error.status).json({ error: result.error.message });
    }
    else {
        res.json(result.data);
    }
}
function getPhotoProviderConfig(providerId) {
    const prefix = `/integrations/memories/${providerId}`;
    return {
        settings_get: `${prefix}/settings`,
        settings_put: `${prefix}/settings`,
        status_get: `${prefix}/status`,
        test_post: `${prefix}/test`,
    };
}
//-----------------------------------------------
//access check helper
function canAccessUserPhoto(requestingUserId, ownerUserId, tripId, assetId, provider) {
    if (requestingUserId === ownerUserId) {
        return true;
    }
    // Journey photos use tripId=0 — check journey_photos + journey_contributors
    if (tripId === '0') {
        const journeyPhoto = database_1.db.prepare(`
            SELECT gp.journey_id
            FROM journey_photos gp
            JOIN memove_photos tkp ON tkp.id = gp.photo_id
            WHERE tkp.asset_id = ?
              AND tkp.provider = ?
              AND tkp.owner_id = ?
            LIMIT 1
        `).get(assetId, provider, ownerUserId);
        if (!journeyPhoto)
            return false;
        const access = database_1.db.prepare(`
            SELECT 1 FROM journeys WHERE id = ? AND user_id = ?
            UNION ALL
            SELECT 1 FROM journey_contributors WHERE journey_id = ? AND user_id = ?
            LIMIT 1
        `).get(journeyPhoto.journey_id, requestingUserId, journeyPhoto.journey_id, requestingUserId);
        return !!access;
    }
    // Regular trip photos — join through memove_photos
    const sharedAsset = database_1.db.prepare(`
    SELECT 1
    FROM trip_photos tp
    JOIN memove_photos tkp ON tkp.id = tp.photo_id
    WHERE tp.user_id = ?
      AND tkp.asset_id = ?
      AND tkp.provider = ?
      AND tp.trip_id = ?
      AND tp.shared = 1
    LIMIT 1
    `).get(ownerUserId, assetId, provider, tripId);
    if (!sharedAsset) {
        return false;
    }
    return !!(0, database_1.canAccessTrip)(tripId, requestingUserId);
}
// ── Unified photo access check (memove_photos based) ──────────────────────
function canAccessMemovePhoto(requestingUserId, memovePhotoId) {
    const photo = database_1.db.prepare('SELECT * FROM memove_photos WHERE id = ?').get(memovePhotoId);
    if (!photo)
        return false;
    // Owner always has access
    if (photo.owner_id === requestingUserId)
        return true;
    // Check trip_photos — is this photo shared in a trip the user has access to?
    const tripAccess = database_1.db.prepare(`
        SELECT 1 FROM trip_photos tp
        WHERE tp.photo_id = ?
          AND tp.shared = 1
          AND EXISTS (
            SELECT 1 FROM trip_members tm WHERE tm.trip_id = tp.trip_id AND tm.user_id = ?
            UNION ALL
            SELECT 1 FROM trips t WHERE t.id = tp.trip_id AND t.user_id = ?
          )
        LIMIT 1
    `).get(memovePhotoId, requestingUserId, requestingUserId);
    if (tripAccess)
        return true;
    // Check journey_photos — is this photo in a journey the user can access?
    const journeyAccess = database_1.db.prepare(`
        SELECT 1 FROM journey_photos gp
        WHERE gp.photo_id = ?
          AND EXISTS (
            SELECT 1 FROM journeys j WHERE j.id = gp.journey_id AND j.user_id = ?
            UNION ALL
            SELECT 1 FROM journey_contributors jc WHERE jc.journey_id = gp.journey_id AND jc.user_id = ?
          )
        LIMIT 1
    `).get(memovePhotoId, requestingUserId, requestingUserId);
    if (journeyAccess)
        return true;
    // Local photos without owner (uploaded files) — check if user has journey access
    if (photo.provider === 'local' && !photo.owner_id) {
        return !!journeyAccess;
    }
    return false;
}
// ----------------------------------------------
//helpers for album link syncing
function getAlbumIdFromLink(tripId, linkId, userId) {
    const access = (0, database_1.canAccessTrip)(tripId, userId);
    if (!access)
        return fail('Trip not found or access denied', 404);
    try {
        const row = database_1.db.prepare('SELECT album_id FROM trip_album_links WHERE id = ? AND trip_id = ? AND user_id = ?')
            .get(linkId, tripId, userId);
        return row ? success(row.album_id) : fail('Album link not found', 404);
    }
    catch {
        return fail('Failed to retrieve album link', 500);
    }
}
function getAlbumLinkForSync(tripId, linkId, userId) {
    const access = (0, database_1.canAccessTrip)(tripId, userId);
    if (!access)
        return fail('Trip not found or access denied', 404);
    try {
        const row = database_1.db.prepare('SELECT album_id, passphrase FROM trip_album_links WHERE id = ? AND trip_id = ? AND user_id = ?')
            .get(linkId, tripId, userId);
        if (!row)
            return fail('Album link not found', 404);
        const decrypted = row.passphrase ? (0, apiKeyCrypto_1.decrypt_api_key)(row.passphrase) ?? undefined : undefined;
        return success({ albumId: row.album_id, passphrase: decrypted || undefined });
    }
    catch {
        return fail('Failed to retrieve album link', 500);
    }
}
function updateSyncTimeForAlbumLink(linkId) {
    database_1.db.prepare('UPDATE trip_album_links SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?').run(linkId);
}
async function pipeAsset(url, response, headers, signal, defaultCacheControl) {
    try {
        const resp = await (0, ssrfGuard_1.safeFetch)(url, { headers, signal: signal });
        response.status(resp.status);
        if (resp.headers.get('content-type'))
            response.set('Content-Type', resp.headers.get('content-type'));
        if (!resp.ok) {
            response.set('Cache-Control', 'no-store, max-age=0');
        }
        else if (resp.headers.get('cache-control')) {
            response.set('Cache-Control', resp.headers.get('cache-control'));
        }
        else if (defaultCacheControl) {
            response.set('Cache-Control', defaultCacheControl);
        }
        if (resp.headers.get('content-length'))
            response.set('Content-Length', resp.headers.get('content-length'));
        if (resp.headers.get('content-disposition'))
            response.set('Content-Disposition', resp.headers.get('content-disposition'));
        if (!resp.body) {
            response.end();
        }
        else {
            await (0, promises_1.pipeline)(node_stream_1.Readable.fromWeb(resp.body), response);
        }
    }
    catch (error) {
        if (response.headersSent) {
            response.end();
            return;
        }
        if (error instanceof ssrfGuard_1.SsrfBlockedError) {
            response.status(400).json({ error: error.message });
        }
        else {
            response.status(500).json({ error: 'Failed to fetch asset' });
        }
    }
}
