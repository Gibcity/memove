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
exports.PhotosController = void 0;
const common_1 = require("@nestjs/common");
const photos_service_1 = require("./photos.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/**
 * /api/photos/:id/{thumbnail,original,info} — global (not trip-scoped) photo
 * access for the memories/journey features. Streaming endpoints write straight
 * to the response via the resolver service.
 *
 * Byte-identical to the legacy Express route (server/src/routes/photos.ts):
 * a finite-id guard (400), the canAccessMemovePhoto check (403), then stream or
 * the provider info (404 inside the service / mapped error for info).
 */
let PhotosController = class PhotosController {
    photos;
    constructor(photos) {
        this.photos = photos;
    }
    requireAccess(user, rawId) {
        const photoId = Number(rawId);
        if (!Number.isFinite(photoId)) {
            throw new common_1.HttpException({ error: 'Invalid photo ID' }, 400);
        }
        if (!this.photos.canAccess(user.id, photoId)) {
            throw new common_1.HttpException({ error: 'Forbidden' }, 403);
        }
        return photoId;
    }
    async thumbnail(user, id, res) {
        const photoId = this.requireAccess(user, id);
        await this.photos.stream(res, user.id, photoId, 'thumbnail');
    }
    async original(user, id, res) {
        const photoId = this.requireAccess(user, id);
        await this.photos.stream(res, user.id, photoId, 'original');
    }
    async info(user, id, res) {
        const photoId = this.requireAccess(user, id);
        const result = await this.photos.info(user.id, photoId);
        if ('error' in result) {
            res.status(result.error.status).json({ error: result.error.message });
            return;
        }
        res.json(result.data);
    }
};
exports.PhotosController = PhotosController;
__decorate([
    (0, common_1.Get)(':id/thumbnail'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], PhotosController.prototype, "thumbnail", null);
__decorate([
    (0, common_1.Get)(':id/original'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], PhotosController.prototype, "original", null);
__decorate([
    (0, common_1.Get)(':id/info'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], PhotosController.prototype, "info", null);
exports.PhotosController = PhotosController = __decorate([
    (0, common_1.Controller)('api/photos'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [photos_service_1.PhotosService])
], PhotosController);
