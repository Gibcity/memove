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
exports.PlacesService = void 0;
const common_1 = require("@nestjs/common");
const websocket_1 = require("../../websocket");
const database_1 = require("../../db/database");
const permissions_1 = require("../../services/permissions");
const svc = __importStar(require("../../services/placeService"));
const journeyService_1 = require("../../services/journeyService");
/**
 * Thin Nest wrapper around the existing place service. Trip access mirrors the
 * requireTripAccess middleware (canAccessTrip); mutations use 'place_edit'. The
 * SQL, the GPX/map/list importers and the journey hooks reuse the legacy code
 * unchanged.
 */
let PlacesService = class PlacesService {
    verifyTripAccess(tripId, userId) {
        return (0, database_1.canAccessTrip)(Number(tripId), userId);
    }
    canEdit(trip, user) {
        return (0, permissions_1.checkPermission)('place_edit', user.role, trip.user_id, user.id, trip.user_id !== user.id);
    }
    broadcast(tripId, event, payload, socketId) {
        (0, websocket_1.broadcast)(tripId, event, payload, socketId);
    }
    list(tripId, filters) {
        return svc.listPlaces(tripId, filters);
    }
    get(tripId, id) {
        return svc.getPlace(tripId, id);
    }
    create(tripId, data) {
        return svc.createPlace(tripId, data);
    }
    update(tripId, id, data) {
        return svc.updatePlace(tripId, id, data);
    }
    remove(tripId, id) {
        return svc.deletePlace(tripId, id);
    }
    removeMany(tripId, ids) {
        return svc.deletePlacesMany(tripId, ids);
    }
    importGpx(tripId, buffer, opts) {
        return svc.importGpx(tripId, buffer, opts);
    }
    importMapFile(tripId, buffer, filename, opts) {
        return svc.importMapFile(tripId, buffer, filename, opts);
    }
    importGoogleList(tripId, url, opts) {
        return svc.importGoogleList(tripId, url, opts);
    }
    importNaverList(tripId, url, opts) {
        return svc.importNaverList(tripId, url, opts);
    }
    searchImage(tripId, id, userId) {
        return svc.searchPlaceImage(tripId, id, userId);
    }
    // Journey hooks — non-fatal, mirroring the route's try/catch wrappers.
    onCreated(tripId, placeId) { try {
        (0, journeyService_1.onPlaceCreated)(Number(tripId), placeId);
    }
    catch { /* non-fatal */ } }
    onUpdated(placeId) { try {
        (0, journeyService_1.onPlaceUpdated)(placeId);
    }
    catch { /* non-fatal */ } }
    onDeleted(placeId) { try {
        (0, journeyService_1.onPlaceDeleted)(placeId);
    }
    catch { /* non-fatal */ } }
};
exports.PlacesService = PlacesService;
exports.PlacesService = PlacesService = __decorate([
    (0, common_1.Injectable)()
], PlacesService);
