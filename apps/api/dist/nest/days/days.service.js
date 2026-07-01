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
exports.DaysService = void 0;
const common_1 = require("@nestjs/common");
const websocket_1 = require("../../websocket");
const database_1 = require("../../db/database");
const permissions_1 = require("../../services/permissions");
const dayService = __importStar(require("../../services/dayService"));
/**
 * Thin Nest wrapper around the day parts of the existing day service. Trip access
 * mirrors the requireTripAccess middleware (canAccessTrip); mutations use the
 * 'day_edit' permission. The SQL and the day/assignment shaping reuse the legacy
 * code unchanged.
 */
let DaysService = class DaysService {
    verifyTripAccess(tripId, userId) {
        return (0, database_1.canAccessTrip)(Number(tripId), userId);
    }
    canEdit(trip, user) {
        return (0, permissions_1.checkPermission)('day_edit', user.role, trip.user_id, user.id, trip.user_id !== user.id);
    }
    broadcast(tripId, event, payload, socketId) {
        (0, websocket_1.broadcast)(tripId, event, payload, socketId);
    }
    list(tripId) {
        return dayService.listDays(tripId);
    }
    getDay(id, tripId) {
        return dayService.getDay(id, tripId);
    }
    create(tripId, date, notes) {
        return dayService.createDay(tripId, date, notes);
    }
    insert(tripId, position) {
        return dayService.insertDay(tripId, position);
    }
    reorder(tripId, orderedIds) {
        return dayService.reorderDays(tripId, orderedIds);
    }
    update(id, current, fields) {
        return dayService.updateDay(id, current, fields);
    }
    remove(id) {
        dayService.deleteDay(id);
    }
};
exports.DaysService = DaysService;
exports.DaysService = DaysService = __decorate([
    (0, common_1.Injectable)()
], DaysService);
