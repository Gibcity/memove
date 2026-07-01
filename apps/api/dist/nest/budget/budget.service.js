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
exports.BudgetService = void 0;
const common_1 = require("@nestjs/common");
const database_1 = require("../../db/database");
const websocket_1 = require("../../websocket");
const permissions_1 = require("../../services/permissions");
const svc = __importStar(require("../../services/budgetService"));
const exchangeRateService_1 = require("../../services/exchangeRateService");
/**
 * Thin Nest wrapper around the existing budget service. Trip-access, the
 * 'budget_edit' permission, the SQL, settlement maths and the WebSocket
 * broadcasts all reuse the legacy code unchanged.
 */
let BudgetService = class BudgetService {
    verifyTripAccess(tripId, userId) {
        return svc.verifyTripAccess(tripId, userId);
    }
    canEdit(trip, user) {
        return (0, permissions_1.checkPermission)('budget_edit', user.role, trip.user_id, user.id, trip.user_id !== user.id);
    }
    broadcast(tripId, event, payload, socketId) {
        (0, websocket_1.broadcast)(tripId, event, payload, socketId);
    }
    list(tripId) {
        return svc.listBudgetItems(tripId);
    }
    perPersonSummary(tripId) {
        return svc.getPerPersonSummary(tripId);
    }
    async settlement(tripId, base, tripCurrency) {
        const effectiveBase = (base || tripCurrency || 'EUR').toUpperCase();
        const rates = await (0, exchangeRateService_1.getRates)(effectiveBase);
        return svc.calculateSettlement(tripId, { base: effectiveBase, rates, tripCurrency });
    }
    create(tripId, data) {
        return svc.createBudgetItem(tripId, data);
    }
    update(id, tripId, data) {
        return svc.updateBudgetItem(id, tripId, data);
    }
    remove(id, tripId) {
        return svc.deleteBudgetItem(id, tripId);
    }
    updateMembers(id, tripId, userIds) {
        return svc.updateMembers(id, tripId, userIds);
    }
    toggleMemberPaid(id, tripId, userId, paid) {
        return svc.toggleMemberPaid(id, tripId, userId, paid);
    }
    setPayers(id, tripId, payers) {
        return svc.setItemPayers(id, tripId, payers);
    }
    listSettlements(tripId) {
        return svc.listSettlements(tripId);
    }
    createSettlement(tripId, data, userId) {
        return svc.createSettlement(tripId, data, userId);
    }
    updateSettlement(id, tripId, data) {
        return svc.updateSettlement(id, tripId, data);
    }
    deleteSettlement(id, tripId) {
        return svc.deleteSettlement(id, tripId);
    }
    reorderItems(tripId, orderedIds) {
        svc.reorderBudgetItems(tripId, orderedIds);
    }
    reorderCategories(tripId, orderedCategories) {
        svc.reorderBudgetCategories(tripId, orderedCategories);
    }
    /**
     * Mirrors the legacy PUT /:id side effect: when a price-linked budget item's
     * total_price changes, write it into the reservation's metadata and broadcast
     * reservation:updated. Non-fatal — a failure here never breaks the budget update.
     */
    syncReservationPrice(tripId, reservationId, totalPrice, socketId) {
        try {
            const reservation = database_1.db.prepare('SELECT id, metadata FROM reservations WHERE id = ? AND trip_id = ?').get(reservationId, tripId);
            if (!reservation)
                return;
            const meta = reservation.metadata ? JSON.parse(reservation.metadata) : {};
            meta.price = String(totalPrice);
            database_1.db.prepare('UPDATE reservations SET metadata = ? WHERE id = ?').run(JSON.stringify(meta), reservation.id);
            const updatedRes = database_1.db.prepare('SELECT * FROM reservations WHERE id = ?').get(reservation.id);
            (0, websocket_1.broadcast)(tripId, 'reservation:updated', { reservation: updatedRes }, socketId);
        }
        catch (err) {
            console.error('[budget] Failed to sync price to reservation:', err);
        }
    }
};
exports.BudgetService = BudgetService;
exports.BudgetService = BudgetService = __decorate([
    (0, common_1.Injectable)()
], BudgetService);
