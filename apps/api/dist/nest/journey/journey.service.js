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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
exports.JourneyService = void 0;
const common_1 = require("@nestjs/common");
const database_1 = require("../../db/database");
const svc = __importStar(require("../../services/journeyService"));
const share = __importStar(require("../../services/journeyShareService"));
const immichService_1 = require("../../services/memories/immichService");
const photoResolverService_1 = require("../../services/memories/photoResolverService");
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
/**
 * Thin Nest wrapper around the existing journey services. Access control lives
 * inside journeyService (each call returns null/false for no-access), so this
 * just re-exposes the functions plus the share-link helpers, the Immich mirror
 * and the addon gate the legacy mount enforced.
 */
let JourneyService = class JourneyService {
    journeyAddonEnabled() {
        return (0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.JOURNEY);
    }
    // Journeys
    listJourneys(userId) { return svc.listJourneys(userId); }
    createJourney(userId, data) { return svc.createJourney(userId, data); }
    getJourneyFull(id, userId) { return svc.getJourneyFull(id, userId); }
    updateJourney(id, userId, data) { return svc.updateJourney(id, userId, data); }
    deleteJourney(id, userId) { return svc.deleteJourney(id, userId); }
    getSuggestions(userId) { return svc.getSuggestions(userId); }
    listUserTrips(userId) { return svc.listUserTrips(userId); }
    updateJourneyPreferences(id, userId, data) { return svc.updateJourneyPreferences(id, userId, data); }
    // Trips
    addTripToJourney(id, tripId, userId) { return svc.addTripToJourney(id, tripId, userId); }
    removeTripFromJourney(id, tripId, userId) { return svc.removeTripFromJourney(id, tripId, userId); }
    // Entries
    listEntries(id, userId) { return svc.listEntries(id, userId); }
    // Entry create/update bodies are free-form in the legacy route (req.body: any);
    // the cast keeps that boundary here so callers needn't pre-shape the payload.
    createEntry(id, userId, data, sid) { return svc.createEntry(id, userId, data, sid); }
    updateEntry(entryId, userId, data, sid) { return svc.updateEntry(entryId, userId, data, sid); }
    deleteEntry(entryId, userId, sid) { return svc.deleteEntry(entryId, userId, sid); }
    reorderEntries(id, userId, orderedIds, sid) { return svc.reorderEntries(id, userId, orderedIds, sid); }
    // Photos
    addPhoto(entryId, userId, filePath, thumbnailPath, caption) { return svc.addPhoto(entryId, userId, filePath, thumbnailPath, caption); }
    setPhotoProvider(photoId, provider, assetId, ownerId) { return svc.setPhotoProvider(photoId, provider, assetId, ownerId); }
    addProviderPhoto(entryId, userId, provider, assetId, caption, passphrase) { return svc.addProviderPhoto(entryId, userId, provider, assetId, caption, passphrase); }
    linkPhotoToEntry(entryId, journeyPhotoId, userId) { return svc.linkPhotoToEntry(entryId, journeyPhotoId, userId); }
    unlinkPhotoFromEntry(entryId, journeyPhotoId, userId) { return svc.unlinkPhotoFromEntry(entryId, journeyPhotoId, userId); }
    updatePhoto(photoId, userId, data) { return svc.updatePhoto(photoId, userId, data); }
    deletePhoto(photoId, userId) { return svc.deletePhoto(photoId, userId); }
    uploadGalleryPhotos(id, userId, filePaths) { return svc.uploadGalleryPhotos(id, userId, filePaths); }
    addProviderPhotoToGallery(id, userId, provider, assetId, caption, passphrase) { return svc.addProviderPhotoToGallery(id, userId, provider, assetId, caption, passphrase); }
    deleteGalleryPhoto(journeyPhotoId, userId) { return svc.deleteGalleryPhoto(journeyPhotoId, userId); }
    // Contributors
    addContributor(id, userId, targetUserId, role) { return svc.addContributor(id, userId, targetUserId, role); }
    updateContributorRole(id, userId, targetUserId, role) { return svc.updateContributorRole(id, userId, targetUserId, role); }
    removeContributor(id, userId, targetUserId) { return svc.removeContributor(id, userId, targetUserId); }
    // Share links
    // Authorization: only someone with access to the journey may read its public
    // share token — same access model as create/delete here and the
    // get_journey_share_link MCP tool.
    getJourneyShareLink(id, userId) {
        if (!svc.canAccessJourney(id, userId))
            return null;
        return share.getJourneyShareLink(id);
    }
    createOrUpdateJourneyShareLink(id, userId, data) { return share.createOrUpdateJourneyShareLink(id, userId, data); }
    deleteJourneyShareLink(id, userId) { return share.deleteJourneyShareLink(id, userId); }
    // Immich mirror (only when the user opted in via integration settings)
    immichAutoUploadEnabled(userId) {
        const prefs = database_1.db.prepare('SELECT immich_auto_upload FROM users WHERE id = ?').get(userId);
        return !!prefs?.immich_auto_upload;
    }
    uploadToImmich(userId, relativePath, originalName) { return (0, immichService_1.uploadToImmich)(userId, relativePath, originalName); }
    // Public (share-token) access — no auth, validated by token.
    getPublicJourney(token) { return share.getPublicJourney(token); }
    validateShareTokenForPhoto(token, photoId) { return share.validateShareTokenForPhoto(token, photoId); }
    validateShareTokenForAsset(token, assetId) { return share.validateShareTokenForAsset(token, assetId); }
    streamPhoto(res, ownerId, photoId, kind) { return (0, photoResolverService_1.streamPhoto)(res, ownerId, photoId, kind); }
    streamImmichAsset(res, userId, assetId, kind, ownerId) { return (0, immichService_1.streamImmichAsset)(res, userId, assetId, kind, ownerId); }
    async streamSynologyAsset(res, userId, ownerId, assetId, kind) {
        const { streamSynologyAsset } = await Promise.resolve().then(() => __importStar(require('../../services/memories/synologyService')));
        return streamSynologyAsset(res, userId, ownerId, assetId, kind);
    }
};
exports.JourneyService = JourneyService;
exports.JourneyService = JourneyService = __decorate([
    (0, common_1.Injectable)()
], JourneyService);
