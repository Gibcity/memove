"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JourneyController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const journey_service_1 = require("./journey.service");
const journey_addon_guard_1 = require("./journey-addon.guard");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const fileService_1 = require("../../services/fileService");
const uploadsBase = node_path_1.default.join(__dirname, '../../../uploads/journey');
const IMAGE_UPLOAD = {
    storage: (0, multer_1.diskStorage)({
        destination: (_req, _file, cb) => { if (!node_fs_1.default.existsSync(uploadsBase))
            node_fs_1.default.mkdirSync(uploadsBase, { recursive: true }); cb(null, uploadsBase); },
        filename: (_req, file, cb) => cb(null, `${node_crypto_1.default.randomUUID()}${node_path_1.default.extname(file.originalname).toLowerCase() || '.jpg'}`),
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/') || file.mimetype.includes('svg')) {
            const err = new Error('Only image files are allowed');
            err.statusCode = 400;
            return cb(err, false);
        }
        const ext = node_path_1.default.extname(file.originalname).toLowerCase().replace('.', '');
        const allowed = (0, fileService_1.getAllowedExtensions)().split(',').map((e) => e.trim().toLowerCase());
        if (!allowed.includes('*') && !allowed.includes(ext)) {
            const err = new Error(`File type .${ext} is not allowed`);
            err.statusCode = 400;
            return cb(err, false);
        }
        cb(null, true);
    },
};
/**
 * /api/journeys — cross-trip travel narrative (journeys, entries, photo gallery
 * + provider mirroring, contributors, preferences, share links).
 *
 * Byte-identical to the legacy Express route (server/src/routes/journey.ts):
 * the Journey-addon gate (404) runs before auth, the service owns access
 * control (null/false → 403/404), create routes answer 201 while cover/trips/
 * share-link/reorder/patch answer 200 and the two unlink/gallery-delete routes
 * answer 204. Static prefixes (/suggestions, /available-trips, /entries, /photos)
 * are declared before /:id so they win over the param.
 */
let JourneyController = class JourneyController {
    journey;
    constructor(journey) {
        this.journey = journey;
    }
    // ── Static prefix routes (before /:id) ──────────────────────────────────
    list(user) {
        return { journeys: this.journey.listJourneys(user.id) };
    }
    create(user, body) {
        if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
            throw new common_1.HttpException({ error: 'Title is required' }, 400);
        }
        return this.journey.createJourney(user.id, {
            title: body.title.trim(),
            subtitle: body.subtitle,
            trip_ids: Array.isArray(body.trip_ids) ? body.trip_ids.map(Number) : [],
        });
    }
    suggestions(user) {
        return { trips: this.journey.getSuggestions(user.id) };
    }
    availableTrips(user) {
        return { trips: this.journey.listUserTrips(user.id) };
    }
    // ── Entries (prefix /entries — before /:id) ─────────────────────────────
    updateEntry(user, entryId, body, socketId) {
        const result = this.journey.updateEntry(Number(entryId), user.id, body, socketId);
        if (!result) {
            throw new common_1.HttpException({ error: 'Entry not found' }, 404);
        }
        return result;
    }
    deleteEntry(user, entryId, socketId) {
        if (!this.journey.deleteEntry(Number(entryId), user.id, socketId)) {
            throw new common_1.HttpException({ error: 'Entry not found' }, 404);
        }
        return { success: true };
    }
    async uploadEntryPhotos(user, entryId, files, body) {
        if (!files?.length) {
            throw new common_1.HttpException({ error: 'No files uploaded' }, 400);
        }
        const results = [];
        for (const file of files) {
            const relativePath = `journey/${file.filename}`;
            const photo = this.journey.addPhoto(Number(entryId), user.id, relativePath, undefined, body?.caption);
            if (!photo)
                continue;
            // Mirror to Immich only when the user explicitly opted in (#730).
            if (this.journey.immichAutoUploadEnabled(user.id)) {
                try {
                    const immichId = await this.journey.uploadToImmich(user.id, relativePath, file.originalname);
                    if (immichId) {
                        this.journey.setPhotoProvider(photo.id, 'immich', immichId, user.id);
                        Object.assign(photo, { provider: 'immich', asset_id: immichId, owner_id: user.id });
                    }
                }
                catch {
                    // best-effort mirror; the local photo is already saved
                }
            }
            results.push(photo);
        }
        if (!results.length) {
            throw new common_1.HttpException({ error: 'Not allowed' }, 403);
        }
        return { photos: results };
    }
    providerPhotos(user, entryId, body) {
        const pp = body.passphrase && typeof body.passphrase === 'string' ? body.passphrase : undefined;
        if (Array.isArray(body.asset_ids) && body.provider) {
            const added = [];
            for (const id of body.asset_ids) {
                const photo = this.journey.addProviderPhoto(Number(entryId), user.id, body.provider, String(id), body.caption, pp);
                if (photo)
                    added.push(photo);
            }
            return { photos: added, added: added.length };
        }
        if (!body.provider || !body.asset_id) {
            throw new common_1.HttpException({ error: 'provider and asset_id required' }, 400);
        }
        const photo = this.journey.addProviderPhoto(Number(entryId), user.id, body.provider, body.asset_id, body.caption, pp);
        if (!photo) {
            throw new common_1.HttpException({ error: 'Not allowed or duplicate' }, 403);
        }
        return photo;
    }
    linkPhoto(user, entryId, body) {
        const journeyPhotoId = body.journey_photo_id ?? body.photo_id;
        if (!journeyPhotoId) {
            throw new common_1.HttpException({ error: 'journey_photo_id required' }, 400);
        }
        const result = this.journey.linkPhotoToEntry(Number(entryId), Number(journeyPhotoId), user.id);
        if (!result) {
            throw new common_1.HttpException({ error: 'Not allowed' }, 403);
        }
        return result;
    }
    unlinkPhoto(user, entryId, journeyPhotoId) {
        if (!this.journey.unlinkPhotoFromEntry(Number(entryId), Number(journeyPhotoId), user.id)) {
            throw new common_1.HttpException({ error: 'Not found or not allowed' }, 404);
        }
    }
    updatePhoto(user, photoId, body) {
        const result = this.journey.updatePhoto(Number(photoId), user.id, body);
        if (!result) {
            throw new common_1.HttpException({ error: 'Photo not found' }, 404);
        }
        return result;
    }
    deletePhoto(user, photoId) {
        const photo = this.journey.deletePhoto(Number(photoId), user.id);
        if (!photo) {
            throw new common_1.HttpException({ error: 'Photo not found' }, 404);
        }
        if (photo.file_path) {
            try {
                node_fs_1.default.unlinkSync(node_path_1.default.join(__dirname, '../../../uploads', photo.file_path));
            }
            catch { /* file already gone */ }
        }
        return { success: true };
    }
    // ── Gallery (prefix /:id/gallery — before /:id) ─────────────────────────
    uploadGalleryPhotos(user, id, files) {
        if (!files?.length) {
            throw new common_1.HttpException({ error: 'No files uploaded' }, 400);
        }
        const filePaths = files.map((f) => ({ path: `journey/${f.filename}` }));
        const photos = this.journey.uploadGalleryPhotos(Number(id), user.id, filePaths);
        if (!photos.length) {
            throw new common_1.HttpException({ error: 'Not allowed' }, 403);
        }
        return { photos };
    }
    galleryProviderPhotos(user, id, body) {
        const pp = body.passphrase && typeof body.passphrase === 'string' ? body.passphrase : undefined;
        if (Array.isArray(body.asset_ids) && body.provider) {
            const added = [];
            for (const aid of body.asset_ids) {
                const photo = this.journey.addProviderPhotoToGallery(Number(id), user.id, body.provider, String(aid), undefined, pp);
                if (photo)
                    added.push(photo);
            }
            return { photos: added, added: added.length };
        }
        if (!body.provider || !body.asset_id) {
            throw new common_1.HttpException({ error: 'provider and asset_id required' }, 400);
        }
        const photo = this.journey.addProviderPhotoToGallery(Number(id), user.id, body.provider, body.asset_id, undefined, pp);
        if (!photo) {
            throw new common_1.HttpException({ error: 'Not allowed or duplicate' }, 403);
        }
        return photo;
    }
    deleteGalleryPhoto(user, journeyPhotoId) {
        const photo = this.journey.deleteGalleryPhoto(Number(journeyPhotoId), user.id);
        if (!photo) {
            throw new common_1.HttpException({ error: 'Photo not found or not allowed' }, 404);
        }
        if (photo.file_path) {
            try {
                node_fs_1.default.unlinkSync(node_path_1.default.join(__dirname, '../../../uploads', photo.file_path));
            }
            catch { /* file already gone */ }
        }
    }
    // ── Journeys /:id ───────────────────────────────────────────────────────
    get(user, id) {
        const data = this.journey.getJourneyFull(Number(id), user.id);
        if (!data) {
            throw new common_1.HttpException({ error: 'Journey not found' }, 404);
        }
        return data;
    }
    update(user, id, body) {
        const result = this.journey.updateJourney(Number(id), user.id, body);
        if (!result) {
            throw new common_1.HttpException({ error: 'Journey not found' }, 404);
        }
        return result;
    }
    cover(user, id, file) {
        if (!file) {
            throw new common_1.HttpException({ error: 'No file uploaded' }, 400);
        }
        const result = this.journey.updateJourney(Number(id), user.id, { cover_image: `journey/${file.filename}` });
        if (!result) {
            throw new common_1.HttpException({ error: 'Journey not found' }, 404);
        }
        return result;
    }
    remove(user, id) {
        if (!this.journey.deleteJourney(Number(id), user.id)) {
            throw new common_1.HttpException({ error: 'Journey not found' }, 404);
        }
        return { success: true };
    }
    // ── Journey trips ───────────────────────────────────────────────────────
    addTrip(user, id, body) {
        if (!body.trip_id) {
            throw new common_1.HttpException({ error: 'trip_id required' }, 400);
        }
        if (!this.journey.addTripToJourney(Number(id), Number(body.trip_id), user.id)) {
            throw new common_1.HttpException({ error: 'Not allowed' }, 403);
        }
        return { success: true };
    }
    removeTrip(user, id, tripId) {
        if (!this.journey.removeTripFromJourney(Number(id), Number(tripId), user.id)) {
            throw new common_1.HttpException({ error: 'Not allowed' }, 403);
        }
        return { success: true };
    }
    // ── Entries under journey ───────────────────────────────────────────────
    listEntries(user, id) {
        const entries = this.journey.listEntries(Number(id), user.id);
        if (!entries) {
            throw new common_1.HttpException({ error: 'Journey not found' }, 404);
        }
        return { entries };
    }
    createEntry(user, id, body, socketId) {
        if (!body.entry_date) {
            throw new common_1.HttpException({ error: 'entry_date is required' }, 400);
        }
        const entry = this.journey.createEntry(Number(id), user.id, body, socketId);
        if (!entry) {
            throw new common_1.HttpException({ error: 'Journey not found' }, 404);
        }
        return entry;
    }
    reorderEntries(user, id, body, socketId) {
        const orderedIds = body.orderedIds;
        if (!Array.isArray(orderedIds) || !orderedIds.every((v) => Number.isFinite(Number(v)))) {
            throw new common_1.HttpException({ error: 'orderedIds must be an array of numbers' }, 400);
        }
        if (!this.journey.reorderEntries(Number(id), user.id, orderedIds.map(Number), socketId)) {
            throw new common_1.HttpException({ error: 'Not allowed' }, 403);
        }
        return { success: true };
    }
    // ── Contributors ────────────────────────────────────────────────────────
    addContributor(user, id, body) {
        if (!body.user_id) {
            throw new common_1.HttpException({ error: 'user_id required' }, 400);
        }
        if (!this.journey.addContributor(Number(id), user.id, Number(body.user_id), body.role || 'viewer')) {
            throw new common_1.HttpException({ error: 'Not allowed' }, 403);
        }
        return { success: true };
    }
    updateContributor(user, id, userId, body) {
        if (!this.journey.updateContributorRole(Number(id), user.id, Number(userId), body.role)) {
            throw new common_1.HttpException({ error: 'Not allowed' }, 403);
        }
        return { success: true };
    }
    removeContributor(user, id, userId) {
        if (!this.journey.removeContributor(Number(id), user.id, Number(userId))) {
            throw new common_1.HttpException({ error: 'Not allowed' }, 403);
        }
        return { success: true };
    }
    // ── User Preferences ────────────────────────────────────────────────────
    preferences(user, id, body) {
        const result = this.journey.updateJourneyPreferences(Number(id), user.id, body);
        if (!result) {
            throw new common_1.HttpException({ error: 'Not allowed' }, 403);
        }
        return result;
    }
    // ── Share Link ──────────────────────────────────────────────────────────
    getShareLink(user, id) {
        return { link: this.journey.getJourneyShareLink(Number(id), user.id) };
    }
    setShareLink(user, id, body) {
        const result = this.journey.createOrUpdateJourneyShareLink(Number(id), user.id, {
            share_timeline: body.share_timeline,
            share_gallery: body.share_gallery,
            share_map: body.share_map,
        });
        if (!result) {
            throw new common_1.HttpException({ error: 'Not allowed' }, 403);
        }
        return result;
    }
    deleteShareLink(user, id) {
        if (!this.journey.deleteJourneyShareLink(Number(id), user.id)) {
            throw new common_1.HttpException({ error: 'Not allowed' }, 403);
        }
        return { success: true };
    }
};
exports.JourneyController = JourneyController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('suggestions'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "suggestions", null);
__decorate([
    (0, common_1.Get)('available-trips'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "availableTrips", null);
__decorate([
    (0, common_1.Patch)('entries/:entryId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('entryId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "updateEntry", null);
__decorate([
    (0, common_1.Delete)('entries/:entryId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('entryId')),
    __param(2, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "deleteEntry", null);
__decorate([
    (0, common_1.Post)('entries/:entryId/photos'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('photos', undefined, IMAGE_UPLOAD)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('entryId')),
    __param(2, (0, common_1.UploadedFiles)()),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Array, Object]),
    __metadata("design:returntype", Promise)
], JourneyController.prototype, "uploadEntryPhotos", null);
__decorate([
    (0, common_1.Post)('entries/:entryId/provider-photos'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('entryId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "providerPhotos", null);
__decorate([
    (0, common_1.Post)('entries/:entryId/link-photo'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('entryId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "linkPhoto", null);
__decorate([
    (0, common_1.Delete)('entries/:entryId/photos/:journeyPhotoId'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('entryId')),
    __param(2, (0, common_1.Param)('journeyPhotoId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "unlinkPhoto", null);
__decorate([
    (0, common_1.Patch)('photos/:photoId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('photoId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "updatePhoto", null);
__decorate([
    (0, common_1.Delete)('photos/:photoId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('photoId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "deletePhoto", null);
__decorate([
    (0, common_1.Post)(':id/gallery/photos'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('photos', undefined, IMAGE_UPLOAD)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Array]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "uploadGalleryPhotos", null);
__decorate([
    (0, common_1.Post)(':id/gallery/provider-photos'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "galleryProviderPhotos", null);
__decorate([
    (0, common_1.Delete)(':id/gallery/:journeyPhotoId'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('journeyPhotoId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "deleteGalleryPhoto", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "get", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/cover'),
    (0, common_1.HttpCode)(200) // Express answers cover with res.json (200).
    ,
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('cover', IMAGE_UPLOAD)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "cover", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/trips'),
    (0, common_1.HttpCode)(200) // Express answers with res.json (200).
    ,
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "addTrip", null);
__decorate([
    (0, common_1.Delete)(':id/trips/:tripId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "removeTrip", null);
__decorate([
    (0, common_1.Get)(':id/entries'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "listEntries", null);
__decorate([
    (0, common_1.Post)(':id/entries'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "createEntry", null);
__decorate([
    (0, common_1.Put)(':id/entries/reorder'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "reorderEntries", null);
__decorate([
    (0, common_1.Post)(':id/contributors'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "addContributor", null);
__decorate([
    (0, common_1.Patch)(':id/contributors/:userId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('userId')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "updateContributor", null);
__decorate([
    (0, common_1.Delete)(':id/contributors/:userId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "removeContributor", null);
__decorate([
    (0, common_1.Patch)(':id/preferences'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "preferences", null);
__decorate([
    (0, common_1.Get)(':id/share-link'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "getShareLink", null);
__decorate([
    (0, common_1.Post)(':id/share-link'),
    (0, common_1.HttpCode)(200) // Express answers with res.json (200).
    ,
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "setShareLink", null);
__decorate([
    (0, common_1.Delete)(':id/share-link'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], JourneyController.prototype, "deleteShareLink", null);
exports.JourneyController = JourneyController = __decorate([
    (0, common_1.Controller)('api/journeys'),
    (0, common_1.UseGuards)(journey_addon_guard_1.JourneyAddonGuard, jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [journey_service_1.JourneyService])
], JourneyController);
