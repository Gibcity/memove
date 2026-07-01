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
exports.TripsService = void 0;
const common_1 = require("@nestjs/common");
const database_1 = require("../../db/database");
const websocket_1 = require("../../websocket");
const permissions_1 = require("../../services/permissions");
const tripSvc = __importStar(require("../../services/tripService"));
const dayService_1 = require("../../services/dayService");
const placeService_1 = require("../../services/placeService");
const packingService_1 = require("../../services/packingService");
const todoService_1 = require("../../services/todoService");
const budgetService_1 = require("../../services/budgetService");
const reservationService_1 = require("../../services/reservationService");
const fileService_1 = require("../../services/fileService");
/**
 * Thin Nest wrapper around the existing trip service + the per-domain list
 * services used to build the offline bundle. Auth (canAccessTrip), permissions,
 * the SQL and the ICS export reuse the legacy code unchanged. Per-field
 * permission checks and audit logging stay in the controller (1:1 with the
 * legacy route).
 */
let TripsService = class TripsService {
    canAccessTrip(tripId, userId) {
        return (0, database_1.canAccessTrip)(tripId, userId);
    }
    can(action, role, ownerId, userId, isMember) {
        return (0, permissions_1.checkPermission)(action, role, ownerId, userId, isMember);
    }
    broadcast(tripId, event, payload, socketId) {
        (0, websocket_1.broadcast)(tripId, event, payload, socketId);
    }
    list(userId, archived) {
        return tripSvc.listTrips(userId, archived);
    }
    create(userId, data) {
        return tripSvc.createTrip(userId, data);
    }
    get(tripId, userId) {
        return tripSvc.getTrip(tripId, userId);
    }
    getRaw(tripId) {
        return tripSvc.getTripRaw(tripId);
    }
    getOwner(tripId) {
        return tripSvc.getTripOwner(tripId);
    }
    update(tripId, userId, body, role) {
        return tripSvc.updateTrip(tripId, userId, body, role);
    }
    remove(tripId, userId, role) {
        return tripSvc.deleteTrip(tripId, userId, role);
    }
    deleteOldCover(coverImage) {
        tripSvc.deleteOldCover(coverImage);
    }
    updateCoverImage(tripId, url) {
        tripSvc.updateCoverImage(tripId, url);
    }
    copy(tripId, userId, title) {
        return tripSvc.copyTripById(tripId, userId, title);
    }
    /** Re-read a freshly copied trip in list shape (mirrors the route's TRIP_SELECT query). */
    getCopiedTrip(newTripId, userId) {
        return database_1.db.prepare(`${tripSvc.TRIP_SELECT} WHERE t.id = :tripId`).get({ userId, tripId: newTripId });
    }
    listMembers(tripId, ownerId) {
        return tripSvc.listMembers(tripId, ownerId);
    }
    addMember(tripId, identifier, ownerId, userId) {
        return tripSvc.addMember(tripId, identifier, ownerId, userId);
    }
    removeMember(tripId, targetId) {
        tripSvc.removeMember(tripId, targetId);
    }
    exportICS(tripId) {
        return tripSvc.exportICS(tripId);
    }
    /** Aggregates every trip sub-collection for offline caching (legacy /:id/bundle). */
    bundle(tripId, trip) {
        const { days } = (0, dayService_1.listDays)(tripId);
        const { owner, members } = this.listMembers(tripId, trip.user_id);
        return {
            trip,
            days,
            places: (0, placeService_1.listPlaces)(String(tripId), {}),
            packingItems: (0, packingService_1.listItems)(tripId),
            todoItems: (0, todoService_1.listItems)(tripId),
            budgetItems: (0, budgetService_1.listBudgetItems)(tripId),
            reservations: (0, reservationService_1.listReservations)(tripId),
            files: (0, fileService_1.listFiles)(tripId, false),
            accommodations: (0, dayService_1.listAccommodations)(tripId),
            members: [owner, ...(members || [])].filter(Boolean),
        };
    }
    /** Fire-and-forget trip-invite notification (mirrors the route's dynamic import). */
    notifyInvite(tripId, actor, targetUserId, tripTitle, inviteeEmail) {
        Promise.resolve().then(() => __importStar(require('../../services/notificationService'))).then(({ send }) => {
            send({
                event: 'trip_invite',
                actorId: actor.id,
                scope: 'user',
                targetId: targetUserId,
                params: { trip: tripTitle, actor: actor.email, invitee: inviteeEmail, tripId: String(tripId) },
            }).catch(() => { });
        });
    }
};
exports.TripsService = TripsService;
exports.TripsService = TripsService = __decorate([
    (0, common_1.Injectable)()
], TripsService);
