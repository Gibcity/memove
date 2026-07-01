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
exports.ReservationsService = void 0;
const common_1 = require("@nestjs/common");
const database_1 = require("../../db/database");
const websocket_1 = require("../../websocket");
const permissions_1 = require("../../services/permissions");
const svc = __importStar(require("../../services/reservationService"));
const budgetService_1 = require("../../services/budgetService");
const shared_1 = require("@memove/shared");
/**
 * Thin Nest wrapper around the existing reservation service. Trip-access, the
 * 'reservation_edit' permission, the SQL and the WebSocket broadcasts reuse the
 * legacy code unchanged. The legacy route's budget side effects (auto-create /
 * update / delete a linked budget item) and the booking notification are
 * encapsulated here so the controller stays thin — behaviour is 1:1.
 */
let ReservationsService = class ReservationsService {
    verifyTripAccess(tripId, userId) {
        return svc.verifyTripAccess(tripId, userId);
    }
    canEdit(trip, user) {
        return (0, permissions_1.checkPermission)('reservation_edit', user.role, trip.user_id, user.id, trip.user_id !== user.id);
    }
    broadcast(tripId, event, payload, socketId) {
        (0, websocket_1.broadcast)(tripId, event, payload, socketId);
    }
    list(tripId) {
        return svc.listReservations(tripId);
    }
    // Cross-trip "upcoming reservations" feed (dashboard widget). Reuses the legacy
    // query unchanged; the default limit (6) matches the legacy inline handler.
    listUpcoming(userId) {
        return svc.getUpcomingReservations(userId);
    }
    create(tripId, data) {
        return svc.createReservation(tripId, data);
    }
    updatePositions(tripId, positions, dayId) {
        svc.updatePositions(tripId, positions, dayId);
    }
    getReservation(id, tripId) {
        return svc.getReservation(id, tripId);
    }
    update(id, tripId, data, current) {
        return svc.updateReservation(id, tripId, data, current);
    }
    remove(id, tripId) {
        return svc.deleteReservation(id, tripId);
    }
    /** POST side effect: auto-create a linked budget item when a price is provided. */
    syncBudgetOnCreate(tripId, reservationId, title, type, entry, socketId) {
        if (!entry || !(Number(entry.total_price) > 0))
            return;
        try {
            const item = (0, budgetService_1.linkBudgetItemToReservation)(tripId, reservationId, {
                name: title,
                category: entry.category || type || 'Other',
                total_price: entry.total_price,
            });
            (0, websocket_1.broadcast)(tripId, 'budget:created', { item }, socketId);
        }
        catch (err) {
            console.error('[reservations] Failed to create budget entry:', err);
        }
    }
    /** PUT side effect: drop the linked budget item when the price is cleared, else create/update it. */
    syncBudgetOnUpdate(tripId, id, title, type, currentTitle, currentType, entry, socketId) {
        // When the booking type changes, keep a linked expense's category in sync —
        // but only if it still carries the auto-derived category (so a manual pick in
        // the Costs editor is preserved). Runs regardless of create_budget_entry.
        if (type && currentType && type !== currentType) {
            const linked = database_1.db.prepare('SELECT id, category FROM budget_items WHERE trip_id = ? AND reservation_id = ?').get(tripId, id);
            if (linked) {
                const oldCat = (0, shared_1.typeToCostCategory)(currentType);
                const newCat = (0, shared_1.typeToCostCategory)(type);
                if (oldCat !== newCat && linked.category === oldCat) {
                    const updated = (0, budgetService_1.updateBudgetItem)(linked.id, tripId, { category: newCat });
                    (0, websocket_1.broadcast)(tripId, 'budget:updated', { item: updated }, socketId);
                }
            }
        }
        // No budget entry on the payload — the booking edit isn't touching its linked
        // expense, so leave any linked item alone. Expenses are managed from the
        // booking's Costs section / the Costs tab, not by re-saving the booking.
        if (!entry)
            return;
        if (!(Number(entry.total_price) > 0)) {
            // Explicit clear (total_price 0/empty) — drop the linked item.
            const linked = database_1.db.prepare('SELECT id FROM budget_items WHERE trip_id = ? AND reservation_id = ?').get(tripId, id);
            if (linked) {
                (0, budgetService_1.deleteBudgetItem)(linked.id, tripId);
                (0, websocket_1.broadcast)(tripId, 'budget:deleted', { itemId: linked.id }, socketId);
            }
            return;
        }
        try {
            const itemName = title || currentTitle;
            const category = entry.category || type || currentType || 'Other';
            const existing = database_1.db.prepare('SELECT id FROM budget_items WHERE trip_id = ? AND reservation_id = ?').get(tripId, id);
            if (existing) {
                const updated = (0, budgetService_1.updateBudgetItem)(existing.id, tripId, { name: itemName, category, total_price: entry.total_price });
                (0, websocket_1.broadcast)(tripId, 'budget:updated', { item: updated }, socketId);
            }
            else {
                const item = (0, budgetService_1.createBudgetItem)(tripId, { name: itemName, category, total_price: entry.total_price });
                database_1.db.prepare('UPDATE budget_items SET reservation_id = ? WHERE id = ?').run(id, item.id);
                item.reservation_id = Number(id);
                (0, websocket_1.broadcast)(tripId, 'budget:created', { item }, socketId);
            }
        }
        catch (err) {
            console.error('[reservations] Failed to create/update budget entry:', err);
        }
    }
    /** Fire-and-forget booking-change notification, mirroring the legacy dynamic import. */
    notifyBookingChange(tripId, actor, booking, type) {
        Promise.resolve().then(() => __importStar(require('../../services/notificationService'))).then(({ send }) => {
            const tripInfo = database_1.db.prepare('SELECT title FROM trips WHERE id = ?').get(tripId);
            send({
                event: 'booking_change',
                actorId: actor.id,
                scope: 'trip',
                targetId: Number(tripId),
                params: { trip: tripInfo?.title || 'Untitled', actor: actor.email, booking, type: type || 'booking', tripId: String(tripId) },
            }).catch(() => { });
        });
    }
};
exports.ReservationsService = ReservationsService;
exports.ReservationsService = ReservationsService = __decorate([
    (0, common_1.Injectable)()
], ReservationsService);
