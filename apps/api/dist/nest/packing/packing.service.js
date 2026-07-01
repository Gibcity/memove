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
exports.PackingService = void 0;
const common_1 = require("@nestjs/common");
const database_1 = require("../../db/database");
const websocket_1 = require("../../websocket");
const permissions_1 = require("../../services/permissions");
const svc = __importStar(require("../../services/packingService"));
/**
 * Thin Nest wrapper around the existing packing service. Trip-access checks, the
 * 'packing_edit' permission, the item/bag SQL, templates and the WebSocket
 * broadcasts all reuse the legacy code unchanged, so behaviour is identical.
 */
let PackingService = class PackingService {
    verifyTripAccess(tripId, userId) {
        return svc.verifyTripAccess(tripId, userId);
    }
    /** Mirrors the inline checkPermission('packing_edit', ...) the legacy route runs. */
    canEdit(trip, user) {
        return (0, permissions_1.checkPermission)('packing_edit', user.role, trip.user_id, user.id, trip.user_id !== user.id);
    }
    broadcast(tripId, event, payload, socketId) {
        (0, websocket_1.broadcast)(tripId, event, payload, socketId);
    }
    listItems(tripId) {
        return svc.listItems(tripId);
    }
    createItem(tripId, data) {
        return svc.createItem(tripId, data);
    }
    updateItem(tripId, id, data, changedKeys) {
        return svc.updateItem(tripId, id, data, changedKeys);
    }
    deleteItem(tripId, id) {
        return svc.deleteItem(tripId, id);
    }
    bulkImport(tripId, items) {
        return svc.bulkImport(tripId, items);
    }
    reorderItems(tripId, orderedIds) {
        svc.reorderItems(tripId, orderedIds);
    }
    listBags(tripId) {
        return svc.listBags(tripId);
    }
    createBag(tripId, data) {
        return svc.createBag(tripId, data);
    }
    updateBag(tripId, bagId, data, changedKeys) {
        return svc.updateBag(tripId, bagId, data, changedKeys);
    }
    deleteBag(tripId, bagId) {
        return svc.deleteBag(tripId, bagId);
    }
    setBagMembers(tripId, bagId, userIds) {
        return svc.setBagMembers(tripId, bagId, userIds);
    }
    listTemplates() {
        return svc.listTemplates();
    }
    applyTemplate(tripId, templateId) {
        return svc.applyTemplate(tripId, templateId);
    }
    saveAsTemplate(tripId, userId, name) {
        return svc.saveAsTemplate(tripId, userId, name);
    }
    getCategoryAssignees(tripId) {
        return svc.getCategoryAssignees(tripId);
    }
    updateCategoryAssignees(tripId, category, userIds) {
        return svc.updateCategoryAssignees(tripId, category, userIds);
    }
    /** Fire-and-forget tag notification, mirroring the legacy dynamic import. */
    notifyTagged(tripId, actor, category, userIds) {
        if (!Array.isArray(userIds) || userIds.length === 0)
            return;
        Promise.resolve().then(() => __importStar(require('../../services/notificationService'))).then(({ send }) => {
            const tripInfo = database_1.db.prepare('SELECT title FROM trips WHERE id = ?').get(tripId);
            send({
                event: 'packing_tagged',
                actorId: actor.id,
                scope: 'trip',
                targetId: Number(tripId),
                params: { trip: tripInfo?.title || 'Untitled', actor: actor.email, category, tripId: String(tripId) },
            }).catch(() => { });
        });
    }
};
exports.PackingService = PackingService;
exports.PackingService = PackingService = __decorate([
    (0, common_1.Injectable)()
], PackingService);
