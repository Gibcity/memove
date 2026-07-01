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
exports.JourneyPublicController = void 0;
const common_1 = require("@nestjs/common");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const journey_service_1 = require("./journey.service");
/**
 * /api/public/journey — unauthenticated, share-token validated read + photo
 * proxy for publicly shared journeys.
 *
 * Byte-identical to the legacy Express route (server/src/routes/journeyPublic.ts):
 * NOT behind any guard, every route validates the share token (404 on failure),
 * the unified proxy streams by memove_photo_id and the legacy proxy serves local
 * files (with the uploads-dir traversal guard) or proxies immich/synology.
 */
let JourneyPublicController = class JourneyPublicController {
    journey;
    constructor(journey) {
        this.journey = journey;
    }
    get(token) {
        const data = this.journey.getPublicJourney(token);
        if (!data) {
            throw new common_1.HttpException({ error: 'Not found' }, 404);
        }
        return data;
    }
    async photo(token, photoId, kind, res) {
        const valid = this.journey.validateShareTokenForPhoto(token, Number(photoId));
        if (!valid) {
            throw new common_1.HttpException({ error: 'Not found' }, 404);
        }
        await this.journey.streamPhoto(res, valid.ownerId, Number(photoId), kind === 'thumbnail' ? 'thumbnail' : 'original');
    }
    async legacyPhoto(token, provider, assetId, ownerId, kind, res) {
        const valid = this.journey.validateShareTokenForAsset(token, assetId);
        if (!valid) {
            throw new common_1.HttpException({ error: 'Not found' }, 404);
        }
        const wantThumb = kind === 'thumbnail' ? 'thumbnail' : 'original';
        if (provider === 'local') {
            // Local journey assets are flat filenames; use basename() and confine the
            // resolved path to the journey upload directory.
            const journeyDir = node_path_1.default.resolve(__dirname, '../../../uploads/journey');
            const resolved = node_path_1.default.resolve(node_path_1.default.join(journeyDir, node_path_1.default.basename(assetId)));
            if (!resolved.startsWith(journeyDir + node_path_1.default.sep) || !node_fs_1.default.existsSync(resolved)) {
                throw new common_1.HttpException({ error: 'Not found' }, 404);
            }
            res.set('Cache-Control', 'public, max-age=86400');
            res.sendFile(resolved);
            return;
        }
        const effectiveOwnerId = valid.ownerId || Number(ownerId);
        if (provider === 'immich') {
            await this.journey.streamImmichAsset(res, effectiveOwnerId, assetId, wantThumb, effectiveOwnerId);
        }
        else {
            try {
                await this.journey.streamSynologyAsset(res, effectiveOwnerId, effectiveOwnerId, assetId, wantThumb);
            }
            catch {
                res.status(404).json({ error: 'Provider not supported' });
            }
        }
    }
};
exports.JourneyPublicController = JourneyPublicController;
__decorate([
    (0, common_1.Get)(':token'),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], JourneyPublicController.prototype, "get", null);
__decorate([
    (0, common_1.Get)(':token/photos/:photoId/:kind'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Param)('photoId')),
    __param(2, (0, common_1.Param)('kind')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Object]),
    __metadata("design:returntype", Promise)
], JourneyPublicController.prototype, "photo", null);
__decorate([
    (0, common_1.Get)(':token/photo/:provider/:assetId/:ownerId/:kind'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Param)('provider')),
    __param(2, (0, common_1.Param)('assetId')),
    __param(3, (0, common_1.Param)('ownerId')),
    __param(4, (0, common_1.Param)('kind')),
    __param(5, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, Object]),
    __metadata("design:returntype", Promise)
], JourneyPublicController.prototype, "legacyPhoto", null);
exports.JourneyPublicController = JourneyPublicController = __decorate([
    (0, common_1.Controller)('api/public/journey'),
    __metadata("design:paramtypes", [journey_service_1.JourneyService])
], JourneyPublicController);
