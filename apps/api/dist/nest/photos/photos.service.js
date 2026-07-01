"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhotosService = void 0;
const common_1 = require("@nestjs/common");
const photoResolverService_1 = require("../../services/memories/photoResolverService");
const helpersService_1 = require("../../services/memories/helpersService");
/**
 * Thin Nest wrapper around the existing photo resolver/helper services. Access
 * control, streaming and the provider-specific info lookups reuse the legacy
 * code unchanged.
 */
let PhotosService = class PhotosService {
    canAccess(userId, photoId) {
        return (0, helpersService_1.canAccessMemovePhoto)(userId, photoId);
    }
    stream(res, userId, photoId, kind) {
        return (0, photoResolverService_1.streamPhoto)(res, userId, photoId, kind);
    }
    info(userId, photoId) {
        return (0, photoResolverService_1.getPhotoInfo)(userId, photoId);
    }
};
exports.PhotosService = PhotosService;
exports.PhotosService = PhotosService = __decorate([
    (0, common_1.Injectable)()
], PhotosService);
