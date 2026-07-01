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
exports.BudgetController = void 0;
const common_1 = require("@nestjs/common");
const budget_service_1 = require("./budget.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/**
 * /api/trips/:tripId/budget — trip-scoped expense planner.
 *
 * Byte-identical to the legacy Express route (server/src/routes/budget.ts):
 * every handler verifies trip access (404); mutations check 'budget_edit' (403);
 * create is 201, the rest 200; bespoke 400/404 bodies reproduced; mutations
 * broadcast over WebSocket with the forwarded X-Socket-Id. Static sub-routes
 * (summary, settlement, reorder/*) are declared before /:id so they win over the
 * param. Updating total_price on a reservation-linked item syncs the price back.
 */
let BudgetController = class BudgetController {
    budget;
    constructor(budget) {
        this.budget = budget;
    }
    requireTrip(tripId, user) {
        const trip = this.budget.verifyTripAccess(tripId, user.id);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        return trip;
    }
    requireEdit(trip, user) {
        if (!this.budget.canEdit(trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
    }
    list(user, tripId) {
        this.requireTrip(tripId, user);
        return { items: this.budget.list(tripId) };
    }
    perPerson(user, tripId) {
        this.requireTrip(tripId, user);
        return { summary: this.budget.perPersonSummary(tripId) };
    }
    settlement(user, tripId, base) {
        const trip = this.requireTrip(tripId, user);
        return this.budget.settlement(tripId, base, trip.currency || 'EUR');
    }
    listSettlements(user, tripId) {
        this.requireTrip(tripId, user);
        return { settlements: this.budget.listSettlements(tripId) };
    }
    createSettlement(user, tripId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (body.from_user_id == null || body.to_user_id == null || body.amount == null) {
            throw new common_1.HttpException({ error: 'from_user_id, to_user_id and amount are required' }, 400);
        }
        const settlement = this.budget.createSettlement(tripId, { from_user_id: body.from_user_id, to_user_id: body.to_user_id, amount: body.amount }, user.id);
        this.budget.broadcast(tripId, 'budget:settlement-created', { settlement }, socketId);
        return { settlement };
    }
    updateSettlement(user, tripId, settlementId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (body.from_user_id == null || body.to_user_id == null || body.amount == null) {
            throw new common_1.HttpException({ error: 'from_user_id, to_user_id and amount are required' }, 400);
        }
        const settlement = this.budget.updateSettlement(settlementId, tripId, {
            from_user_id: body.from_user_id,
            to_user_id: body.to_user_id,
            amount: body.amount,
        });
        if (!settlement) {
            throw new common_1.HttpException({ error: 'Settlement not found' }, 404);
        }
        this.budget.broadcast(tripId, 'budget:settlement-updated', { settlement }, socketId);
        return { settlement };
    }
    deleteSettlement(user, tripId, settlementId, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!this.budget.deleteSettlement(settlementId, tripId)) {
            throw new common_1.HttpException({ error: 'Settlement not found' }, 404);
        }
        this.budget.broadcast(tripId, 'budget:settlement-deleted', { settlementId: Number(settlementId) }, socketId);
        return { success: true };
    }
    create(user, tripId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!body.name) {
            throw new common_1.HttpException({ error: 'Name is required' }, 400);
        }
        const item = this.budget.create(tripId, body);
        this.budget.broadcast(tripId, 'budget:created', { item }, socketId);
        return { item };
    }
    reorderItems(user, tripId, orderedIds, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        this.budget.reorderItems(tripId, orderedIds);
        this.budget.broadcast(tripId, 'budget:reordered', { orderedIds }, socketId);
        return { success: true };
    }
    reorderCategories(user, tripId, orderedCategories, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        this.budget.reorderCategories(tripId, orderedCategories);
        this.budget.broadcast(tripId, 'budget:reordered', { orderedCategories }, socketId);
        return { success: true };
    }
    update(user, tripId, id, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const updated = this.budget.update(id, tripId, body);
        if (!updated) {
            throw new common_1.HttpException({ error: 'Budget item not found' }, 404);
        }
        if (updated.reservation_id && body.total_price !== undefined) {
            this.budget.syncReservationPrice(tripId, updated.reservation_id, updated.total_price, socketId);
        }
        this.budget.broadcast(tripId, 'budget:updated', { item: updated }, socketId);
        return { item: updated };
    }
    updateMembers(user, tripId, id, userIds, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!Array.isArray(userIds)) {
            throw new common_1.HttpException({ error: 'user_ids must be an array' }, 400);
        }
        const result = this.budget.updateMembers(id, tripId, userIds);
        if (!result) {
            throw new common_1.HttpException({ error: 'Budget item not found' }, 404);
        }
        this.budget.broadcast(tripId, 'budget:members-updated', { itemId: Number(id), members: result.members, persons: result.item.persons }, socketId);
        return { members: result.members, item: result.item };
    }
    setPayers(user, tripId, id, payers, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!Array.isArray(payers)) {
            throw new common_1.HttpException({ error: 'payers must be an array' }, 400);
        }
        const item = this.budget.setPayers(id, tripId, payers);
        if (!item) {
            throw new common_1.HttpException({ error: 'Budget item not found' }, 404);
        }
        this.budget.broadcast(tripId, 'budget:updated', { item }, socketId);
        return { item };
    }
    toggleMemberPaid(user, tripId, id, userId, paid, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const member = this.budget.toggleMemberPaid(id, tripId, userId, paid);
        this.budget.broadcast(tripId, 'budget:member-paid-updated', { itemId: Number(id), userId: Number(userId), paid: paid ? 1 : 0 }, socketId);
        return { member };
    }
    remove(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!this.budget.remove(id, tripId)) {
            throw new common_1.HttpException({ error: 'Budget item not found' }, 404);
        }
        this.budget.broadcast(tripId, 'budget:deleted', { itemId: Number(id) }, socketId);
        return { success: true };
    }
};
exports.BudgetController = BudgetController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('summary/per-person'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "perPerson", null);
__decorate([
    (0, common_1.Get)('settlement'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Query)('base')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "settlement", null);
__decorate([
    (0, common_1.Get)('settlements'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "listSettlements", null);
__decorate([
    (0, common_1.Post)('settlements'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "createSettlement", null);
__decorate([
    (0, common_1.Put)('settlements/:settlementId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('settlementId')),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "updateSettlement", null);
__decorate([
    (0, common_1.Delete)('settlements/:settlementId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('settlementId')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "deleteSettlement", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "create", null);
__decorate([
    (0, common_1.Put)('reorder/items'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)('orderedIds')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Array, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "reorderItems", null);
__decorate([
    (0, common_1.Put)('reorder/categories'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)('orderedCategories')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Array, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "reorderCategories", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "update", null);
__decorate([
    (0, common_1.Put)(':id/members'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)('user_ids')),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "updateMembers", null);
__decorate([
    (0, common_1.Put)(':id/payers'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)('payers')),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "setPayers", null);
__decorate([
    (0, common_1.Put)(':id/members/:userId/paid'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Param)('userId')),
    __param(4, (0, common_1.Body)('paid')),
    __param(5, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, Boolean, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "toggleMemberPaid", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], BudgetController.prototype, "remove", null);
exports.BudgetController = BudgetController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/budget'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [budget_service_1.BudgetService])
], BudgetController);
