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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImmichMemoriesController = void 0;
const common_1 = require("@nestjs/common");
const memories_service_1 = require("./memories.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const auditLog_1 = require("../../services/auditLog");
/**
 * /api/integrations/memories/immich — Immich connection, browse/search, asset
 * proxy and album linking.
 *
 * Byte-identical to the legacy Express router (server/src/routes/memories/immich.ts):
 * `/status` and `/test` answer 200 even on connection failure (the service shapes
 * `{ connected: false, ... }`); `/settings` PUT validates with a 400; the asset
 * routes do the 400 invalid-id guard then the canAccessUserPhoto 403 ('Forbidden')
 * before streaming or returning info; the album sync answers 200 then broadcasts.
 * The legacy `canAccessTrip` import there is dead code — intentionally not ported.
 */
let ImmichMemoriesController = class ImmichMemoriesController {
    memories;
    constructor(memories) {
        this.memories = memories;
    }
    getSettings(user) {
        return this.memories.immichGetConnectionSettings(user.id);
    }
    async putSettings(user, body, req, res) {
        const { immich_url, immich_api_key, auto_upload } = body;
        const result = await this.memories.immichSaveSettings(user.id, immich_url, immich_api_key, (0, auditLog_1.getClientIp)(req));
        if (!result.success) {
            res.status(400).json({ error: result.error });
            return;
        }
        if (typeof auto_upload === 'boolean') {
            this.memories.immichSetAutoUpload(user.id, auto_upload);
        }
        if (result.warning) {
            res.json({ success: true, warning: result.warning });
            return;
        }
        res.json({ success: true });
    }
    async getStatus(user) {
        return this.memories.immichGetConnectionStatus(user.id);
    }
    async test(body) {
        const { immich_url, immich_api_key } = body;
        if (!immich_url || !immich_api_key) {
            return { connected: false, error: 'URL and API key required' };
        }
        return this.memories.immichTestConnection(immich_url, immich_api_key);
    }
    async browse(user, res) {
        const result = await this.memories.immichBrowseTimeline(user.id);
        if (result.error) {
            res.status(result.status).json({ error: result.error });
            return;
        }
        res.json({ buckets: result.buckets });
    }
    async search(user, body, res) {
        const { from, to, size, page } = body;
        const pageNum = Math.max(1, Number(page) || 1);
        const pageSize = Math.min(Number(size) || 50, 200);
        const result = await this.memories.immichSearchPhotos(user.id, from, to, pageNum, pageSize);
        if (result.error) {
            res.status(result.status).json({ error: result.error });
            return;
        }
        res.json({ assets: result.assets || [], hasMore: !!result.hasMore });
    }
    async assetInfo(user, tripId, assetId, ownerId, res) {
        if (!this.memories.immichIsValidAssetId(assetId)) {
            res.status(400).json({ error: 'Invalid asset ID' });
            return;
        }
        if (!this.memories.canAccessUserPhoto(user.id, Number(ownerId), tripId, assetId, 'immich')) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        const result = await this.memories.immichGetAssetInfo(user.id, assetId, Number(ownerId));
        if (result.error) {
            res.status(result.status).json({ error: result.error });
            return;
        }
        res.json(result.data);
    }
    async assetThumbnail(user, tripId, assetId, ownerId, res) {
        if (!this.memories.immichIsValidAssetId(assetId)) {
            res.status(400).json({ error: 'Invalid asset ID' });
            return;
        }
        if (!this.memories.canAccessUserPhoto(user.id, Number(ownerId), tripId, assetId, 'immich')) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        await this.memories.immichStreamAsset(res, user.id, assetId, 'thumbnail', Number(ownerId));
    }
    async assetOriginal(user, tripId, assetId, ownerId, res) {
        if (!this.memories.immichIsValidAssetId(assetId)) {
            res.status(400).json({ error: 'Invalid asset ID' });
            return;
        }
        if (!this.memories.canAccessUserPhoto(user.id, Number(ownerId), tripId, assetId, 'immich')) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        await this.memories.immichStreamAsset(res, user.id, assetId, 'original', Number(ownerId));
    }
    async albums(user, res) {
        const result = await this.memories.immichListAlbums(user.id);
        if (result.error) {
            res.status(result.status).json({ error: result.error });
            return;
        }
        res.json({ albums: result.albums });
    }
    async albumPhotos(user, albumId, res) {
        const result = await this.memories.immichGetAlbumPhotos(user.id, albumId);
        if (result.error) {
            res.status(result.status).json({ error: result.error });
            return;
        }
        res.json({ assets: result.assets });
    }
    async sync(user, tripId, linkId, sid, res) {
        const result = await this.memories.immichSyncAlbumAssets(tripId, linkId, user.id, sid);
        if (result.error) {
            res.status(result.status).json({ error: result.error });
            return;
        }
        res.json({ success: true, added: result.added, total: result.total });
        if (result.added > 0) {
            this.memories.broadcast(tripId, 'memories:updated', { userId: user.id }, sid);
        }
    }
};
exports.ImmichMemoriesController = ImmichMemoriesController;
__decorate([
    (0, common_1.Get)('settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ImmichMemoriesController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Put)('settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ImmichMemoriesController.prototype, "putSettings", null);
__decorate([
    (0, common_1.Get)('status'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ImmichMemoriesController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Post)('test'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ImmichMemoriesController.prototype, "test", null);
__decorate([
    (0, common_1.Get)('browse'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ImmichMemoriesController.prototype, "browse", null);
__decorate([
    (0, common_1.Post)('search'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ImmichMemoriesController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('assets/:tripId/:assetId/:ownerId/info'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('assetId')),
    __param(3, (0, common_1.Param)('ownerId')),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], ImmichMemoriesController.prototype, "assetInfo", null);
__decorate([
    (0, common_1.Get)('assets/:tripId/:assetId/:ownerId/thumbnail'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('assetId')),
    __param(3, (0, common_1.Param)('ownerId')),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], ImmichMemoriesController.prototype, "assetThumbnail", null);
__decorate([
    (0, common_1.Get)('assets/:tripId/:assetId/:ownerId/original'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('assetId')),
    __param(3, (0, common_1.Param)('ownerId')),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], ImmichMemoriesController.prototype, "assetOriginal", null);
__decorate([
    (0, common_1.Get)('albums'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ImmichMemoriesController.prototype, "albums", null);
__decorate([
    (0, common_1.Get)('albums/:albumId/photos'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('albumId')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], ImmichMemoriesController.prototype, "albumPhotos", null);
__decorate([
    (0, common_1.Post)('trips/:tripId/album-links/:linkId/sync'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('linkId')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], ImmichMemoriesController.prototype, "sync", null);
exports.ImmichMemoriesController = ImmichMemoriesController = __decorate([
    (0, common_1.Controller)('api/integrations/memories/immich'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [memories_service_1.MemoriesService])
], ImmichMemoriesController);
