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
exports.UnifiedMemoriesController = void 0;
const common_1 = require("@nestjs/common");
const memories_service_1 = require("./memories.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/**
 * /api/integrations/memories/unified — provider-agnostic trip photo + album-link
 * management.
 *
 * Byte-identical to the legacy Express router (server/src/routes/memories/unified.ts):
 * bare `authenticate` (JwtAuthGuard), success bodies on 200, and the per-result
 * error envelope `{ error }` at `result.error.status` reused from the unified
 * service. Lenient hand-rolled body coercion is preserved — no Zod here.
 */
let UnifiedMemoriesController = class UnifiedMemoriesController {
    memories;
    constructor(memories) {
        this.memories = memories;
    }
    listPhotos(user, tripId, res) {
        const result = this.memories.listTripPhotos(tripId, user.id);
        if ('error' in result) {
            res.status(result.error.status).json({ error: result.error.message });
            return;
        }
        res.json({ photos: result.data });
    }
    async addPhotos(user, tripId, body, sid, res) {
        const selections = Array.isArray(body?.selections) ? body.selections : [];
        const shared = body?.shared === undefined ? true : !!body?.shared;
        const result = await this.memories.addTripPhotos(tripId, user.id, shared, selections, sid);
        if ('error' in result) {
            res.status(result.error.status).json({ error: result.error.message });
            return;
        }
        res.json({ success: true, added: result.data.added });
    }
    async setSharing(user, tripId, body, res) {
        const result = await this.memories.setTripPhotoSharing(tripId, user.id, Number(body?.photo_id), body?.shared);
        if ('error' in result) {
            res.status(result.error.status).json({ error: result.error.message });
            return;
        }
        res.json({ success: true });
    }
    async removePhoto(user, tripId, body, res) {
        const result = this.memories.removeTripPhoto(tripId, user.id, Number(body?.photo_id));
        if ('error' in result) {
            res.status(result.error.status).json({ error: result.error.message });
            return;
        }
        res.json({ success: true });
    }
    listAlbumLinks(user, tripId, res) {
        const result = this.memories.listTripAlbumLinks(tripId, user.id);
        if ('error' in result) {
            res.status(result.error.status).json({ error: result.error.message });
            return;
        }
        res.json({ links: result.data });
    }
    createAlbumLink(user, tripId, body, res) {
        const passphrase = body?.passphrase ? String(body.passphrase) : undefined;
        const result = this.memories.createTripAlbumLink(tripId, user.id, body?.provider, body?.album_id, body?.album_name, passphrase);
        if ('error' in result) {
            res.status(result.error.status).json({ error: result.error.message });
            return;
        }
        res.json({ success: true });
    }
    removeAlbumLink(user, tripId, linkId, res) {
        const result = this.memories.removeAlbumLink(tripId, linkId, user.id);
        if ('error' in result) {
            res.status(result.error.status).json({ error: result.error.message });
            return;
        }
        res.json({ success: true });
    }
};
exports.UnifiedMemoriesController = UnifiedMemoriesController;
__decorate([
    (0, common_1.Get)('trips/:tripId/photos'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], UnifiedMemoriesController.prototype, "listPhotos", null);
__decorate([
    (0, common_1.Post)('trips/:tripId/photos'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __param(4, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String, Object]),
    __metadata("design:returntype", Promise)
], UnifiedMemoriesController.prototype, "addPhotos", null);
__decorate([
    (0, common_1.Put)('trips/:tripId/photos/sharing'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], UnifiedMemoriesController.prototype, "setSharing", null);
__decorate([
    (0, common_1.Delete)('trips/:tripId/photos'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], UnifiedMemoriesController.prototype, "removePhoto", null);
__decorate([
    (0, common_1.Get)('trips/:tripId/album-links'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], UnifiedMemoriesController.prototype, "listAlbumLinks", null);
__decorate([
    (0, common_1.Post)('trips/:tripId/album-links'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], UnifiedMemoriesController.prototype, "createAlbumLink", null);
__decorate([
    (0, common_1.Delete)('trips/:tripId/album-links/:linkId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('linkId')),
    __param(3, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], UnifiedMemoriesController.prototype, "removeAlbumLink", null);
exports.UnifiedMemoriesController = UnifiedMemoriesController = __decorate([
    (0, common_1.Controller)('api/integrations/memories/unified'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [memories_service_1.MemoriesService])
], UnifiedMemoriesController);
