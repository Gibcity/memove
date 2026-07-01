"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AtlasService = void 0;
const common_1 = require("@nestjs/common");
const atlasService_1 = require("../../services/atlasService");
/**
 * Thin Nest wrapper around the existing atlas service. The Admin-1 GeoJSON
 * cache, the stats aggregation and the visited-region logic all stay in
 * atlasService, so behaviour is unchanged. Returns native service shapes; the
 * client-facing contracts live in @memove/shared.
 */
let AtlasService = class AtlasService {
    stats(userId) {
        return (0, atlasService_1.getStats)(userId);
    }
    visitedRegions(userId) {
        return (0, atlasService_1.getVisitedRegions)(userId);
    }
    regionGeo(countries) {
        return (0, atlasService_1.getRegionGeo)(countries);
    }
    countryGeo() {
        return (0, atlasService_1.getCountryGeo)();
    }
    countryPlaces(userId, code) {
        return (0, atlasService_1.getCountryPlaces)(userId, code);
    }
    markCountry(userId, code) {
        (0, atlasService_1.markCountryVisited)(userId, code);
    }
    unmarkCountry(userId, code) {
        (0, atlasService_1.unmarkCountryVisited)(userId, code);
    }
    markRegion(userId, code, name, countryCode) {
        (0, atlasService_1.markRegionVisited)(userId, code, name, countryCode);
    }
    unmarkRegion(userId, code) {
        (0, atlasService_1.unmarkRegionVisited)(userId, code);
    }
    bucketList(userId) {
        return (0, atlasService_1.listBucketList)(userId);
    }
    createBucketItem(userId, data) {
        return (0, atlasService_1.createBucketItem)(userId, data);
    }
    updateBucketItem(userId, itemId, data) {
        return (0, atlasService_1.updateBucketItem)(userId, itemId, data);
    }
    deleteBucketItem(userId, itemId) {
        return (0, atlasService_1.deleteBucketItem)(userId, itemId);
    }
};
exports.AtlasService = AtlasService;
exports.AtlasService = AtlasService = __decorate([
    (0, common_1.Injectable)()
], AtlasService);
