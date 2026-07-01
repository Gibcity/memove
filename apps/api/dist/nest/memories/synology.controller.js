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
exports.SynologyMemoriesController = void 0;
const common_1 = require("@nestjs/common");
const helpersService_1 = require("../../services/memories/helpersService");
const memories_service_1 = require("./memories.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
function _parseStringBodyField(value) {
    return String(value ?? '').trim();
}
function _parseNumberBodyField(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
/**
 * /api/integrations/memories/synologyphotos — Synology Photos connection,
 * search, albums and asset proxy.
 *
 * Byte-identical to the legacy Express router (server/src/routes/memories/synology.ts):
 * every response goes through the service `ServiceResult` envelope (success →
 * `res.json(data)` at 200, error → status + `{ error }`); `/status` and `/test`
 * always answer 200 (the service shapes `{ connected: false, error }` on
 * failure); the asset routes use the distinct 403 string "You don't have access
 * to this photo"; `/info` is declared before the catch-all `/:kind` so the
 * literal route wins as Express ordered it; lenient hand-rolled coercion is kept.
 */
let SynologyMemoriesController = class SynologyMemoriesController {
    memories;
    constructor(memories) {
        this.memories = memories;
    }
    handle(res, result) {
        if ('error' in result) {
            res.status(result.error.status).json({ error: result.error.message });
        }
        else {
            res.json(result.data);
        }
    }
    async getSettings(user, res) {
        this.handle(res, await this.memories.synologyGetSettings(user.id));
    }
    async putSettings(user, body, res) {
        const synology_url = _parseStringBodyField(body.synology_url);
        const synology_username = _parseStringBodyField(body.synology_username);
        const synology_password = _parseStringBodyField(body.synology_password);
        const synology_skip_ssl = body.synology_skip_ssl === true || body.synology_skip_ssl === 'true';
        if (!synology_url || !synology_username) {
            this.handle(res, (0, helpersService_1.fail)('URL and username are required', 400));
        }
        else {
            this.handle(res, await this.memories.synologyUpdateSettings(user.id, synology_url, synology_username, synology_password, synology_skip_ssl));
        }
    }
    async getStatus(user, res) {
        this.handle(res, await this.memories.synologyGetStatus(user.id));
    }
    async test(user, body, res) {
        const synology_url = _parseStringBodyField(body.synology_url);
        const synology_username = _parseStringBodyField(body.synology_username);
        const synology_password = _parseStringBodyField(body.synology_password);
        const synology_otp = _parseStringBodyField(body.synology_otp);
        const synology_skip_ssl = body.synology_skip_ssl === true || body.synology_skip_ssl === 'true';
        if (!synology_url || !synology_username || !synology_password) {
            const missingFields = [];
            if (!synology_url)
                missingFields.push('URL');
            if (!synology_username)
                missingFields.push('Username');
            if (!synology_password)
                missingFields.push('Password');
            this.handle(res, (0, helpersService_1.success)({ connected: false, error: `${missingFields.join(', ')} ${missingFields.length > 1 ? 'are' : 'is'} required` }));
        }
        else {
            this.handle(res, await this.memories.synologyTestConnection(user.id, synology_url, synology_username, synology_password, synology_otp, synology_skip_ssl));
        }
    }
    async albums(user, res) {
        this.handle(res, await this.memories.synologyListAlbums(user.id));
    }
    async albumPhotos(user, albumId, passphraseRaw, res) {
        const passphrase = passphraseRaw ? String(passphraseRaw) : undefined;
        this.handle(res, await this.memories.synologyGetAlbumPhotos(user.id, albumId, passphrase));
    }
    async sync(user, tripId, linkId, sid, res) {
        this.handle(res, await this.memories.synologySyncAlbumLink(user.id, tripId, linkId, sid));
    }
    async search(user, body, res) {
        const from = _parseStringBodyField(body.from);
        const to = _parseStringBodyField(body.to);
        let offset = _parseNumberBodyField(body.offset, 0);
        const page = _parseNumberBodyField(body.page, 1) - 1;
        let limit = _parseNumberBodyField(body.limit, 100);
        const size = _parseNumberBodyField(body.size, 0);
        if (size > 0)
            limit = size;
        if (page > 0)
            offset = page * limit;
        this.handle(res, await this.memories.synologySearchPhotos(user.id, from || undefined, to || undefined, offset, limit));
    }
    async assetInfo(user, tripId, photoId, ownerId, passphraseRaw, res) {
        const passphrase = passphraseRaw ? String(passphraseRaw) : undefined;
        if (!this.memories.canAccessUserPhoto(user.id, Number(ownerId), tripId, photoId, 'synologyphotos')) {
            this.handle(res, (0, helpersService_1.fail)("You don't have access to this photo", 403));
        }
        else {
            this.handle(res, await this.memories.synologyGetAssetInfo(user.id, photoId, Number(ownerId), passphrase));
        }
    }
    async asset(user, tripId, photoId, ownerId, kind, sizeRaw, passphraseRaw, res) {
        const VALID_SIZES = ['sm', 'm', 'xl'];
        const rawSize = String(sizeRaw ?? 'sm');
        const size = VALID_SIZES.includes(rawSize) ? rawSize : 'sm';
        const passphrase = passphraseRaw ? String(passphraseRaw) : undefined;
        if (kind !== 'thumbnail' && kind !== 'original') {
            this.handle(res, (0, helpersService_1.fail)('Invalid asset kind', 400));
            return;
        }
        if (!this.memories.canAccessUserPhoto(user.id, Number(ownerId), tripId, photoId, 'synologyphotos')) {
            this.handle(res, (0, helpersService_1.fail)("You don't have access to this photo", 403));
        }
        else {
            await this.memories.synologyStreamAsset(res, user.id, Number(ownerId), photoId, kind, String(size), passphrase);
        }
    }
};
exports.SynologyMemoriesController = SynologyMemoriesController;
__decorate([
    (0, common_1.Get)('settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SynologyMemoriesController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Put)('settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], SynologyMemoriesController.prototype, "putSettings", null);
__decorate([
    (0, common_1.Get)('status'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SynologyMemoriesController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Post)('test'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], SynologyMemoriesController.prototype, "test", null);
__decorate([
    (0, common_1.Get)('albums'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SynologyMemoriesController.prototype, "albums", null);
__decorate([
    (0, common_1.Get)('albums/:albumId/photos'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('albumId')),
    __param(2, (0, common_1.Query)('passphrase')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", Promise)
], SynologyMemoriesController.prototype, "albumPhotos", null);
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
], SynologyMemoriesController.prototype, "sync", null);
__decorate([
    (0, common_1.Post)('search'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], SynologyMemoriesController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('assets/:tripId/:photoId/:ownerId/info'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('photoId')),
    __param(3, (0, common_1.Param)('ownerId')),
    __param(4, (0, common_1.Query)('passphrase')),
    __param(5, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], SynologyMemoriesController.prototype, "assetInfo", null);
__decorate([
    (0, common_1.Get)('assets/:tripId/:photoId/:ownerId/:kind'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('photoId')),
    __param(3, (0, common_1.Param)('ownerId')),
    __param(4, (0, common_1.Param)('kind')),
    __param(5, (0, common_1.Query)('size')),
    __param(6, (0, common_1.Query)('passphrase')),
    __param(7, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], SynologyMemoriesController.prototype, "asset", null);
exports.SynologyMemoriesController = SynologyMemoriesController = __decorate([
    (0, common_1.Controller)('api/integrations/memories/synologyphotos'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [memories_service_1.MemoriesService])
], SynologyMemoriesController);
