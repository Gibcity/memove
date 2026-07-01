"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoriesService = void 0;
const common_1 = require("@nestjs/common");
const unifiedService_1 = require("../../services/memories/unifiedService");
const immichService_1 = require("../../services/memories/immichService");
const synologyService_1 = require("../../services/memories/synologyService");
const helpersService_1 = require("../../services/memories/helpersService");
const websocket_1 = require("../../websocket");
/**
 * Thin Nest wrapper around the existing memories (photo-providers) services.
 * Every method delegates to the legacy `services/memories/*` code unchanged so
 * the provider logic, the per-provider access checks and the streaming helpers
 * behave byte-identically to the legacy Express routers. No new business logic
 * lives here.
 */
let MemoriesService = class MemoriesService {
    // ── Access check (reused by both provider asset routes) ──────────────────
    canAccessUserPhoto(requestingUserId, ownerUserId, tripId, assetId, provider) {
        return (0, helpersService_1.canAccessUserPhoto)(requestingUserId, ownerUserId, tripId, assetId, provider);
    }
    broadcast(tripId, event, payload, socketId) {
        (0, websocket_1.broadcast)(tripId, event, payload, socketId);
    }
    // ── Unified ──────────────────────────────────────────────────────────────
    listTripPhotos(tripId, userId) {
        return (0, unifiedService_1.listTripPhotos)(tripId, userId);
    }
    addTripPhotos(tripId, userId, shared, selections, sid) {
        return (0, unifiedService_1.addTripPhotos)(tripId, userId, shared, selections, sid);
    }
    setTripPhotoSharing(tripId, userId, photoId, shared) {
        return (0, unifiedService_1.setTripPhotoSharing)(tripId, userId, photoId, shared);
    }
    removeTripPhoto(tripId, userId, photoId) {
        return (0, unifiedService_1.removeTripPhoto)(tripId, userId, photoId);
    }
    listTripAlbumLinks(tripId, userId) {
        return (0, unifiedService_1.listTripAlbumLinks)(tripId, userId);
    }
    createTripAlbumLink(tripId, userId, provider, albumId, albumName, passphrase) {
        return (0, unifiedService_1.createTripAlbumLink)(tripId, userId, provider, albumId, albumName, passphrase);
    }
    removeAlbumLink(tripId, linkId, userId) {
        return (0, unifiedService_1.removeAlbumLink)(tripId, linkId, userId);
    }
    // ── Immich ─────────────────────────────────────────────────────────────────
    immichGetConnectionSettings(userId) {
        return (0, immichService_1.getConnectionSettings)(userId);
    }
    immichSaveSettings(userId, immichUrl, immichApiKey, clientIp) {
        return (0, immichService_1.saveImmichSettings)(userId, immichUrl, immichApiKey, clientIp);
    }
    immichSetAutoUpload(userId, enabled) {
        (0, immichService_1.setImmichAutoUpload)(userId, enabled);
    }
    immichGetConnectionStatus(userId) {
        return (0, immichService_1.getConnectionStatus)(userId);
    }
    immichTestConnection(immichUrl, immichApiKey) {
        return (0, immichService_1.testConnection)(immichUrl, immichApiKey);
    }
    immichBrowseTimeline(userId) {
        return (0, immichService_1.browseTimeline)(userId);
    }
    immichSearchPhotos(userId, from, to, page, size) {
        return (0, immichService_1.searchPhotos)(userId, from, to, page, size);
    }
    immichIsValidAssetId(assetId) {
        return (0, immichService_1.isValidAssetId)(assetId);
    }
    immichGetAssetInfo(userId, assetId, ownerId) {
        return (0, immichService_1.getAssetInfo)(userId, assetId, ownerId);
    }
    immichStreamAsset(res, userId, assetId, kind, ownerId) {
        return (0, immichService_1.streamImmichAsset)(res, userId, assetId, kind, ownerId);
    }
    immichListAlbums(userId) {
        return (0, immichService_1.listAlbums)(userId);
    }
    immichGetAlbumPhotos(userId, albumId) {
        return (0, immichService_1.getAlbumPhotos)(userId, albumId);
    }
    immichSyncAlbumAssets(tripId, linkId, userId, sid) {
        return (0, immichService_1.syncAlbumAssets)(tripId, linkId, userId, sid);
    }
    // ── Synology ────────────────────────────────────────────────────────────────
    synologyGetSettings(userId) {
        return (0, synologyService_1.getSynologySettings)(userId);
    }
    synologyUpdateSettings(userId, url, username, password, skipSsl) {
        return (0, synologyService_1.updateSynologySettings)(userId, url, username, password, skipSsl);
    }
    synologyGetStatus(userId) {
        return (0, synologyService_1.getSynologyStatus)(userId);
    }
    synologyTestConnection(userId, url, username, password, otp, skipSsl) {
        return (0, synologyService_1.testSynologyConnection)(userId, url, username, password, otp, skipSsl);
    }
    synologyListAlbums(userId) {
        return (0, synologyService_1.listSynologyAlbums)(userId);
    }
    synologyGetAlbumPhotos(userId, albumId, passphrase) {
        return (0, synologyService_1.getSynologyAlbumPhotos)(userId, albumId, passphrase);
    }
    synologySyncAlbumLink(userId, tripId, linkId, sid) {
        return (0, synologyService_1.syncSynologyAlbumLink)(userId, tripId, linkId, sid);
    }
    synologySearchPhotos(userId, from, to, offset, limit) {
        return (0, synologyService_1.searchSynologyPhotos)(userId, from, to, offset, limit);
    }
    synologyGetAssetInfo(userId, photoId, ownerId, passphrase) {
        return (0, synologyService_1.getSynologyAssetInfo)(userId, photoId, ownerId, passphrase);
    }
    synologyStreamAsset(res, userId, ownerId, photoId, kind, size, passphrase) {
        return (0, synologyService_1.streamSynologyAsset)(res, userId, ownerId, photoId, kind, size, passphrase);
    }
};
exports.MemoriesService = MemoriesService;
exports.MemoriesService = MemoriesService = __decorate([
    (0, common_1.Injectable)()
], MemoriesService);
