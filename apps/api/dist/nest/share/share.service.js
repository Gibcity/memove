"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShareService = void 0;
const common_1 = require("@nestjs/common");
const database_1 = require("../../db/database");
const permissions_1 = require("../../services/permissions");
const svc = __importStar(require("../../services/shareService"));
/**
 * Thin Nest wrapper around the existing share service. Trip access, the
 * 'share_manage' permission and the token SQL reuse the legacy code unchanged.
 */
let ShareService = class ShareService {
    verifyTripAccess(tripId, userId) {
        return (0, database_1.canAccessTrip)(tripId, userId);
    }
    canManage(trip, user) {
        return (0, permissions_1.checkPermission)('share_manage', user.role, trip.user_id, user.id, trip.user_id !== user.id);
    }
    createOrUpdate(tripId, userId, permissions) {
        return svc.createOrUpdateShareLink(tripId, userId, permissions);
    }
    get(tripId) { return svc.getShareLink(tripId); }
    remove(tripId) { return svc.deleteShareLink(tripId); }
    getSharedTripData(token) { return svc.getSharedTripData(token); }
    getSharedPlacePhotoPath(token, placeId) { return svc.getSharedPlacePhotoPath(token, placeId); }
};
exports.ShareService = ShareService;
exports.ShareService = ShareService = __decorate([
    (0, common_1.Injectable)()
], ShareService);
