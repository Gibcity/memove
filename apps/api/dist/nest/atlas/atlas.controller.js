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
exports.AtlasController = void 0;
const common_1 = require("@nestjs/common");
const atlas_service_1 = require("./atlas.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/**
 * /api/addons/atlas — visited countries/regions, region GeoJSON, bucket list.
 *
 * Byte-identical to the legacy Express route (server/src/routes/atlas.ts): all
 * endpoints require auth; country/region codes are upper-cased; /regions is
 * always no-store while /regions/geo is cached for a day only on a non-empty
 * result; the mark POSTs answer 200 (not Nest's default 201); and the bespoke
 * 400/404 bodies are reproduced exactly. No addon gate — the legacy route has
 * none, so adding one would break clients when the addon is off.
 */
let AtlasController = class AtlasController {
    atlas;
    constructor(atlas) {
        this.atlas = atlas;
    }
    stats(user) {
        return this.atlas.stats(user.id);
    }
    regions(user) {
        return this.atlas.visitedRegions(user.id);
    }
    async regionGeo(countries, res) {
        const list = (countries || '').split(',').filter(Boolean);
        if (list.length === 0) {
            return { type: 'FeatureCollection', features: [] };
        }
        const geo = await this.atlas.regionGeo(list);
        // Cache only a non-empty result, matching the legacy route (the empty
        // short-circuit above sends no Cache-Control header).
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return geo;
    }
    countryGeo() {
        return this.atlas.countryGeo();
    }
    countryPlaces(user, code) {
        return this.atlas.countryPlaces(user.id, code.toUpperCase());
    }
    markCountry(user, code) {
        this.atlas.markCountry(user.id, code.toUpperCase());
        return { success: true };
    }
    unmarkCountry(user, code) {
        this.atlas.unmarkCountry(user.id, code.toUpperCase());
        return { success: true };
    }
    markRegion(user, code, name, countryCode) {
        if (!name || !countryCode) {
            throw new common_1.HttpException({ error: 'name and country_code are required' }, 400);
        }
        this.atlas.markRegion(user.id, code.toUpperCase(), name, countryCode.toUpperCase());
        return { success: true };
    }
    unmarkRegion(user, code) {
        this.atlas.unmarkRegion(user.id, code.toUpperCase());
        return { success: true };
    }
    bucketList(user) {
        return { items: this.atlas.bucketList(user.id) };
    }
    createBucketItem(user, body) {
        if (!body.name?.trim()) {
            throw new common_1.HttpException({ error: 'Name is required' }, 400);
        }
        const { name, lat, lng, country_code, notes, target_date } = body;
        return { item: this.atlas.createBucketItem(user.id, { name, lat, lng, country_code, notes, target_date }) };
    }
    updateBucketItem(user, id, body) {
        const { name, notes, lat, lng, country_code, target_date } = body;
        const item = this.atlas.updateBucketItem(user.id, id, { name, notes, lat, lng, country_code, target_date });
        if (!item) {
            throw new common_1.HttpException({ error: 'Item not found' }, 404);
        }
        return { item };
    }
    deleteBucketItem(user, id) {
        if (!this.atlas.deleteBucketItem(user.id, id)) {
            throw new common_1.HttpException({ error: 'Item not found' }, 404);
        }
        return { success: true };
    }
};
exports.AtlasController = AtlasController;
__decorate([
    (0, common_1.Get)('stats'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AtlasController.prototype, "stats", null);
__decorate([
    (0, common_1.Get)('regions'),
    (0, common_1.Header)('Cache-Control', 'no-cache, no-store'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AtlasController.prototype, "regions", null);
__decorate([
    (0, common_1.Get)('regions/geo'),
    __param(0, (0, common_1.Query)('countries')),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AtlasController.prototype, "regionGeo", null);
__decorate([
    (0, common_1.Get)('countries/geo'),
    (0, common_1.Header)('Cache-Control', 'public, max-age=86400'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], AtlasController.prototype, "countryGeo", null);
__decorate([
    (0, common_1.Get)('country/:code'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('code')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AtlasController.prototype, "countryPlaces", null);
__decorate([
    (0, common_1.Post)('country/:code/mark'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('code')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Object)
], AtlasController.prototype, "markCountry", null);
__decorate([
    (0, common_1.Delete)('country/:code/mark'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('code')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Object)
], AtlasController.prototype, "unmarkCountry", null);
__decorate([
    (0, common_1.Post)('region/:code/mark'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('code')),
    __param(2, (0, common_1.Body)('name')),
    __param(3, (0, common_1.Body)('country_code')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Object)
], AtlasController.prototype, "markRegion", null);
__decorate([
    (0, common_1.Delete)('region/:code/mark'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('code')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Object)
], AtlasController.prototype, "unmarkRegion", null);
__decorate([
    (0, common_1.Get)('bucket-list'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AtlasController.prototype, "bucketList", null);
__decorate([
    (0, common_1.Post)('bucket-list'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Object)
], AtlasController.prototype, "createBucketItem", null);
__decorate([
    (0, common_1.Put)('bucket-list/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Object)
], AtlasController.prototype, "updateBucketItem", null);
__decorate([
    (0, common_1.Delete)('bucket-list/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Object)
], AtlasController.prototype, "deleteBucketItem", null);
exports.AtlasController = AtlasController = __decorate([
    (0, common_1.Controller)('api/addons/atlas'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [atlas_service_1.AtlasService])
], AtlasController);
