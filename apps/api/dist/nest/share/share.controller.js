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
exports.SharedController = exports.TripShareController = void 0;
const common_1 = require("@nestjs/common");
const node_fs_1 = require("node:fs");
const share_service_1 = require("./share.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/**
 * /api/trips/:tripId/share-link — manage a trip's public read-only share token.
 *
 * Byte-identical to the legacy Express route (server/src/routes/share.ts): trip
 * access (404), the 'share_manage' permission (403), and the create-vs-update
 * status split (201 on first creation, 200 on a subsequent update).
 */
let TripShareController = class TripShareController {
    share;
    constructor(share) {
        this.share = share;
    }
    requireManage(tripId, user) {
        const trip = this.share.verifyTripAccess(tripId, user.id);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        if (!this.share.canManage(trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
    }
    create(user, tripId, body, res) {
        this.requireManage(tripId, user);
        const result = this.share.createOrUpdate(tripId, user.id, {
            share_map: body.share_map,
            share_bookings: body.share_bookings,
            share_packing: body.share_packing,
            share_budget: body.share_budget,
            share_collab: body.share_collab,
        });
        // 201 only on first creation; an update answers 200, mirroring the legacy route.
        res.status(result.created ? 201 : 200);
        return { token: result.token };
    }
    get(user, tripId) {
        if (!this.share.verifyTripAccess(tripId, user.id)) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        const info = this.share.get(tripId);
        return info ? info : { token: null };
    }
    remove(user, tripId) {
        this.requireManage(tripId, user);
        this.share.remove(tripId);
        return { success: true };
    }
};
exports.TripShareController = TripShareController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], TripShareController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TripShareController.prototype, "get", null);
__decorate([
    (0, common_1.Delete)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TripShareController.prototype, "remove", null);
exports.TripShareController = TripShareController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/share-link'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [share_service_1.ShareService])
], TripShareController);
/**
 * GET /api/shared/:token — public, unauthenticated read-only trip snapshot.
 * Deliberately NOT behind a guard; an invalid/expired token answers 404.
 */
let SharedController = class SharedController {
    share;
    constructor(share) {
        this.share = share;
    }
    /**
     * Public, token-scoped place-photo proxy. The shared payload rewrites place
     * image URLs to this route so thumbnails load without a session cookie (the
     * /api/maps bytes endpoint is JwtAuthGuard'd). The service validates the token
     * and that the place belongs to its trip; a miss streams nothing and answers
     * 404. Declared before the bare ':token' read route. Streaming mirrors
     * MapsController.placePhotoBytes (cached photos are always JPEG).
     */
    placePhotoBytes(token, placeId, res) {
        const fp = this.share.getSharedPlacePhotoPath(token, placeId);
        if (!fp) {
            res.status(404).json({ error: 'Photo not cached' });
            return;
        }
        res.set('Cache-Control', 'public, max-age=2592000, immutable');
        res.type('image/jpeg');
        const stream = (0, node_fs_1.createReadStream)(fp);
        stream.on('error', () => {
            if (!res.headersSent)
                res.status(404).json({ error: 'Photo not cached' });
        });
        stream.pipe(res);
    }
    read(token) {
        const data = this.share.getSharedTripData(token);
        if (!data) {
            throw new common_1.HttpException({ error: 'Invalid or expired link' }, 404);
        }
        return data;
    }
};
exports.SharedController = SharedController;
__decorate([
    (0, common_1.Get)(':token/place-photo/:placeId/bytes'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Param)('placeId')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], SharedController.prototype, "placePhotoBytes", null);
__decorate([
    (0, common_1.Get)(':token'),
    __param(0, (0, common_1.Param)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], SharedController.prototype, "read", null);
exports.SharedController = SharedController = __decorate([
    (0, common_1.Controller)('api/shared'),
    __metadata("design:paramtypes", [share_service_1.ShareService])
], SharedController);
