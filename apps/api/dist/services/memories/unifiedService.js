"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTripPhotos = listTripPhotos;
exports.listTripAlbumLinks = listTripAlbumLinks;
exports.addTripPhotos = addTripPhotos;
exports.setTripPhotoSharing = setTripPhotoSharing;
exports.removeTripPhoto = removeTripPhoto;
exports.createTripAlbumLink = createTripAlbumLink;
exports.removeAlbumLink = removeAlbumLink;
const database_1 = require("../../db/database");
const notificationService_1 = require("../notificationService");
const websocket_1 = require("../../websocket");
const helpersService_1 = require("./helpersService");
const photoResolverService_1 = require("./photoResolverService");
const apiKeyCrypto_1 = require("../apiKeyCrypto");
function _providers() {
    const rows = database_1.db.prepare('SELECT id, enabled FROM photo_providers').all();
    return rows.map(r => ({ id: r.id, enabled: r.enabled === 1 }));
}
function _validProvider(provider) {
    const providers = _providers();
    const found = providers.find(p => p.id === provider);
    if (!found) {
        return (0, helpersService_1.fail)(`Provider: "${provider}" is not supported`, 400);
    }
    if (!found.enabled) {
        return (0, helpersService_1.fail)(`Provider: "${provider}" is not enabled, contact server administrator`, 400);
    }
    return (0, helpersService_1.success)(provider);
}
function listTripPhotos(tripId, userId) {
    const access = (0, database_1.canAccessTrip)(tripId, userId);
    if (!access) {
        return (0, helpersService_1.fail)('Trip not found or access denied', 404);
    }
    try {
        const enabledProviders = _providers().filter(p => p.enabled).map(p => p.id);
        if (enabledProviders.length === 0) {
            return (0, helpersService_1.fail)('No photo providers enabled', 400);
        }
        const photos = database_1.db.prepare(`
      SELECT tp.photo_id, tkp.asset_id, tkp.provider, tp.user_id, tp.shared, tp.added_at,
             u.username, u.avatar
      FROM trip_photos tp
      JOIN memove_photos tkp ON tkp.id = tp.photo_id
      JOIN users u ON tp.user_id = u.id
      WHERE tp.trip_id = ?
        AND (tp.user_id = ? OR tp.shared = 1)
        AND tkp.provider IN (${enabledProviders.map(() => '?').join(',')})
      ORDER BY tp.added_at ASC
    `).all(tripId, userId, ...enabledProviders);
        return (0, helpersService_1.success)(photos);
    }
    catch (error) {
        return (0, helpersService_1.mapDbError)(error, 'Failed to list trip photos');
    }
}
function listTripAlbumLinks(tripId, userId) {
    const access = (0, database_1.canAccessTrip)(tripId, userId);
    if (!access) {
        return (0, helpersService_1.fail)('Trip not found or access denied', 404);
    }
    const enabledProviders = _providers().filter(p => p.enabled).map(p => p.id);
    if (enabledProviders.length === 0) {
        return (0, helpersService_1.fail)('No photo providers enabled', 400);
    }
    try {
        const links = database_1.db.prepare(`
      SELECT tal.id,
             tal.trip_id,
             tal.user_id,
             tal.provider,
             tal.album_id,
             tal.album_name,
             tal.sync_enabled,
             tal.last_synced_at,
             tal.created_at,
             u.username
      FROM trip_album_links tal
      JOIN users u ON tal.user_id = u.id
      WHERE tal.trip_id = ?
        AND tal.provider IN (${enabledProviders.map(() => '?').join(',')})
      ORDER BY tal.created_at ASC
    `).all(tripId, ...enabledProviders);
        return (0, helpersService_1.success)(links);
    }
    catch (error) {
        return (0, helpersService_1.mapDbError)(error, 'Failed to list trip album links');
    }
}
//-----------------------------------------------
// managing photos in trip
function _addTripPhoto(tripId, userId, provider, assetId, shared, albumLinkId, passphrase) {
    const providerResult = _validProvider(provider);
    if (!providerResult.success) {
        return providerResult;
    }
    try {
        const photoId = (0, photoResolverService_1.getOrCreateMemovePhoto)(provider, assetId, userId, passphrase);
        const result = database_1.db.prepare('INSERT OR IGNORE INTO trip_photos (trip_id, user_id, photo_id, shared, album_link_id) VALUES (?, ?, ?, ?, ?)').run(tripId, userId, photoId, shared ? 1 : 0, albumLinkId || null);
        return (0, helpersService_1.success)(result.changes > 0);
    }
    catch (error) {
        return (0, helpersService_1.mapDbError)(error, 'Failed to add photo to trip');
    }
}
async function addTripPhotos(tripId, userId, shared, selections, sid, albumLinkId) {
    const access = (0, database_1.canAccessTrip)(tripId, userId);
    if (!access) {
        return (0, helpersService_1.fail)('Trip not found or access denied', 404);
    }
    if (selections.length === 0) {
        return (0, helpersService_1.fail)('No photos selected', 400);
    }
    let added = 0;
    for (const selection of selections) {
        const providerResult = _validProvider(selection.provider);
        if (!providerResult.success) {
            return providerResult;
        }
        for (const raw of selection.asset_ids) {
            const assetId = String(raw || '').trim();
            if (!assetId)
                continue;
            const result = _addTripPhoto(tripId, userId, selection.provider, assetId, shared, albumLinkId, selection.passphrase);
            if (!result.success) {
                return result;
            }
            if (result.data) {
                added++;
            }
        }
    }
    await _notifySharedTripPhotos(tripId, userId, added);
    (0, websocket_1.broadcast)(tripId, 'memories:updated', { userId }, sid);
    return (0, helpersService_1.success)({ added, shared });
}
async function setTripPhotoSharing(tripId, userId, photoId, shared, sid) {
    const access = (0, database_1.canAccessTrip)(tripId, userId);
    if (!access) {
        return (0, helpersService_1.fail)('Trip not found or access denied', 404);
    }
    try {
        database_1.db.prepare(`
      UPDATE trip_photos
      SET shared = ?
      WHERE trip_id = ?
        AND user_id = ?
        AND photo_id = ?
    `).run(shared ? 1 : 0, tripId, userId, photoId);
        await _notifySharedTripPhotos(tripId, userId, 1);
        (0, websocket_1.broadcast)(tripId, 'memories:updated', { userId }, sid);
        return (0, helpersService_1.success)(true);
    }
    catch (error) {
        return (0, helpersService_1.mapDbError)(error, 'Failed to update photo sharing');
    }
}
function removeTripPhoto(tripId, userId, photoId, sid) {
    const access = (0, database_1.canAccessTrip)(tripId, userId);
    if (!access) {
        return (0, helpersService_1.fail)('Trip not found or access denied', 404);
    }
    try {
        database_1.db.prepare(`
      DELETE FROM trip_photos
      WHERE trip_id = ?
        AND user_id = ?
        AND photo_id = ?
    `).run(tripId, userId, photoId);
        (0, photoResolverService_1.deleteMemovePhotoIfOrphan)(photoId);
        (0, websocket_1.broadcast)(tripId, 'memories:updated', { userId }, sid);
        return (0, helpersService_1.success)(true);
    }
    catch (error) {
        return (0, helpersService_1.mapDbError)(error, 'Failed to remove trip photo');
    }
}
// ----------------------------------------------
// managing album links in trip
function createTripAlbumLink(tripId, userId, providerRaw, albumIdRaw, albumNameRaw, passphrase) {
    const access = (0, database_1.canAccessTrip)(tripId, userId);
    if (!access) {
        return (0, helpersService_1.fail)('Trip not found or access denied', 404);
    }
    const provider = String(providerRaw || '').toLowerCase();
    const albumId = String(albumIdRaw || '').trim();
    const albumName = String(albumNameRaw || '').trim();
    if (!provider) {
        return (0, helpersService_1.fail)('provider is required', 400);
    }
    if (!albumId) {
        return (0, helpersService_1.fail)('album_id required', 400);
    }
    const providerResult = _validProvider(provider);
    if (!providerResult.success) {
        return providerResult;
    }
    try {
        const encryptedPassphrase = passphrase ? (0, apiKeyCrypto_1.encrypt_api_key)(passphrase) : null;
        const result = database_1.db.prepare('INSERT OR IGNORE INTO trip_album_links (trip_id, user_id, provider, album_id, album_name, passphrase) VALUES (?, ?, ?, ?, ?, ?)').run(tripId, userId, provider, albumId, albumName, encryptedPassphrase);
        if (result.changes === 0) {
            return (0, helpersService_1.fail)('Album already linked', 409);
        }
        return (0, helpersService_1.success)(true);
    }
    catch (error) {
        return (0, helpersService_1.mapDbError)(error, 'Failed to link album');
    }
}
function removeAlbumLink(tripId, linkId, userId) {
    const access = (0, database_1.canAccessTrip)(tripId, userId);
    if (!access) {
        return (0, helpersService_1.fail)('Trip not found or access denied', 404);
    }
    try {
        const linkedPhotos = database_1.db.prepare('SELECT photo_id FROM trip_photos WHERE trip_id = ? AND album_link_id = ?')
            .all(tripId, linkId);
        database_1.db.transaction(() => {
            database_1.db.prepare('DELETE FROM trip_photos WHERE trip_id = ? AND album_link_id = ?')
                .run(tripId, linkId);
            database_1.db.prepare('DELETE FROM trip_album_links WHERE id = ? AND trip_id = ? AND user_id = ?')
                .run(linkId, tripId, userId);
        })();
        for (const { photo_id } of linkedPhotos) {
            (0, photoResolverService_1.deleteMemovePhotoIfOrphan)(photo_id);
        }
        return (0, helpersService_1.success)(true);
    }
    catch (error) {
        return (0, helpersService_1.mapDbError)(error, 'Failed to remove album link');
    }
}
//-----------------------------------------------
// notifications helper
async function _notifySharedTripPhotos(tripId, actorUserId, added) {
    if (added <= 0)
        return (0, helpersService_1.success)(undefined);
    try {
        const actorRow = database_1.db.prepare('SELECT username, email FROM users WHERE id = ?').get(actorUserId);
        const tripInfo = database_1.db.prepare('SELECT title FROM trips WHERE id = ?').get(tripId);
        (0, notificationService_1.send)({ event: 'photos_shared', actorId: actorUserId, scope: 'trip', targetId: Number(tripId), params: { trip: tripInfo?.title || 'Untitled', actor: actorRow?.email || 'Unknown', count: String(added), tripId: String(tripId) } }).catch(() => { });
        return (0, helpersService_1.success)(undefined);
    }
    catch {
        return (0, helpersService_1.fail)('Failed to send notifications', 500);
    }
}
