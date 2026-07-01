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
exports.PackingController = void 0;
const common_1 = require("@nestjs/common");
const packing_service_1 = require("./packing.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/**
 * /api/trips/:tripId/packing — trip-scoped packing list (items, bags, templates,
 * assignees).
 *
 * Byte-identical to the legacy Express route (server/src/routes/packing.ts):
 * every handler verifies trip access (404 "Trip not found"); mutations check the
 * 'packing_edit' permission (403 "No permission"); status codes match (201 on the
 * creates, 200 elsewhere — note POST /apply-template stays 200); and the bespoke
 * 400/404 bodies are reproduced. Mutations broadcast over WebSocket with the
 * forwarded X-Socket-Id. /reorder is declared before /:id so it wins over the param.
 */
let PackingController = class PackingController {
    packing;
    constructor(packing) {
        this.packing = packing;
    }
    /** Loads the trip or throws the legacy 404; returns it for the permission check. */
    requireTrip(tripId, user) {
        const trip = this.packing.verifyTripAccess(tripId, user.id);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        return trip;
    }
    requireEdit(trip, user) {
        if (!this.packing.canEdit(trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
    }
    list(user, tripId) {
        this.requireTrip(tripId, user);
        return { items: this.packing.listItems(tripId) };
    }
    importItems(user, tripId, items, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!Array.isArray(items) || items.length === 0) {
            throw new common_1.HttpException({ error: 'items must be a non-empty array' }, 400);
        }
        const created = this.packing.bulkImport(tripId, items);
        for (const item of created) {
            this.packing.broadcast(tripId, 'packing:created', { item }, socketId);
        }
        return { items: created, count: created.length };
    }
    create(user, tripId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!body.name) {
            throw new common_1.HttpException({ error: 'Item name is required' }, 400);
        }
        const item = this.packing.createItem(tripId, { name: body.name, category: body.category, checked: body.checked });
        this.packing.broadcast(tripId, 'packing:created', { item }, socketId);
        return { item };
    }
    reorder(user, tripId, orderedIds, _socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        this.packing.reorderItems(tripId, orderedIds);
        return { success: true };
    }
    update(user, tripId, id, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const { name, checked, category, weight_grams, bag_id, quantity } = body;
        const updated = this.packing.updateItem(tripId, id, { name, checked, category, weight_grams, bag_id, quantity }, Object.keys(body));
        if (!updated) {
            throw new common_1.HttpException({ error: 'Item not found' }, 404);
        }
        this.packing.broadcast(tripId, 'packing:updated', { item: updated }, socketId);
        return { item: updated };
    }
    remove(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!this.packing.deleteItem(tripId, id)) {
            throw new common_1.HttpException({ error: 'Item not found' }, 404);
        }
        this.packing.broadcast(tripId, 'packing:deleted', { itemId: Number(id) }, socketId);
        return { success: true };
    }
    listBags(user, tripId) {
        this.requireTrip(tripId, user);
        return { bags: this.packing.listBags(tripId) };
    }
    createBag(user, tripId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!body.name?.trim()) {
            throw new common_1.HttpException({ error: 'Name is required' }, 400);
        }
        const bag = this.packing.createBag(tripId, { name: body.name, color: body.color });
        this.packing.broadcast(tripId, 'packing:bag-created', { bag }, socketId);
        return { bag };
    }
    updateBag(user, tripId, bagId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const { name, color, weight_limit_grams, user_id } = body;
        const updated = this.packing.updateBag(tripId, bagId, { name, color, weight_limit_grams, user_id }, Object.keys(body));
        if (!updated) {
            throw new common_1.HttpException({ error: 'Bag not found' }, 404);
        }
        this.packing.broadcast(tripId, 'packing:bag-updated', { bag: updated }, socketId);
        return { bag: updated };
    }
    deleteBag(user, tripId, bagId, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!this.packing.deleteBag(tripId, bagId)) {
            throw new common_1.HttpException({ error: 'Bag not found' }, 404);
        }
        this.packing.broadcast(tripId, 'packing:bag-deleted', { bagId: Number(bagId) }, socketId);
        return { success: true };
    }
    listTemplates(user, tripId) {
        this.requireTrip(tripId, user);
        return { templates: this.packing.listTemplates() };
    }
    applyTemplate(user, tripId, templateId, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const added = this.packing.applyTemplate(tripId, templateId);
        if (!added) {
            throw new common_1.HttpException({ error: 'Template not found or empty' }, 404);
        }
        this.packing.broadcast(tripId, 'packing:template-applied', { items: added }, socketId);
        return { items: added, count: added.length };
    }
    setBagMembers(user, tripId, bagId, userIds, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const members = this.packing.setBagMembers(tripId, bagId, Array.isArray(userIds) ? userIds : []);
        if (!members) {
            throw new common_1.HttpException({ error: 'Bag not found' }, 404);
        }
        this.packing.broadcast(tripId, 'packing:bag-members-updated', { bagId: Number(bagId), members }, socketId);
        return { members };
    }
    saveAsTemplate(user, tripId, name) {
        this.requireTrip(tripId, user);
        if (user.role !== 'admin') {
            throw new common_1.HttpException({ error: 'Admin access required' }, 403);
        }
        if (!name?.trim()) {
            throw new common_1.HttpException({ error: 'Template name is required' }, 400);
        }
        const template = this.packing.saveAsTemplate(tripId, user.id, name.trim());
        if (!template) {
            throw new common_1.HttpException({ error: 'No items to save' }, 400);
        }
        return { template };
    }
    categoryAssignees(user, tripId) {
        this.requireTrip(tripId, user);
        return { assignees: this.packing.getCategoryAssignees(tripId) };
    }
    updateCategoryAssignees(user, tripId, categoryName, userIds, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const category = decodeURIComponent(categoryName);
        const rows = this.packing.updateCategoryAssignees(tripId, category, userIds);
        this.packing.broadcast(tripId, 'packing:assignees', { category, assignees: rows }, socketId);
        this.packing.notifyTagged(tripId, user, category, userIds);
        return { assignees: rows };
    }
};
exports.PackingController = PackingController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('import'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)('items')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "importItems", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "create", null);
__decorate([
    (0, common_1.Put)('reorder'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)('orderedIds')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Array, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "reorder", null);
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
], PackingController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('bags'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "listBags", null);
__decorate([
    (0, common_1.Post)('bags'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "createBag", null);
__decorate([
    (0, common_1.Put)('bags/:bagId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('bagId')),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "updateBag", null);
__decorate([
    (0, common_1.Delete)('bags/:bagId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('bagId')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "deleteBag", null);
__decorate([
    (0, common_1.Get)('templates'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "listTemplates", null);
__decorate([
    (0, common_1.Post)('apply-template/:templateId'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('templateId')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "applyTemplate", null);
__decorate([
    (0, common_1.Put)('bags/:bagId/members'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('bagId')),
    __param(3, (0, common_1.Body)('user_ids')),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "setBagMembers", null);
__decorate([
    (0, common_1.Post)('save-as-template'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "saveAsTemplate", null);
__decorate([
    (0, common_1.Get)('category-assignees'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "categoryAssignees", null);
__decorate([
    (0, common_1.Put)('category-assignees/:categoryName'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('categoryName')),
    __param(3, (0, common_1.Body)('user_ids')),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Array, String]),
    __metadata("design:returntype", void 0)
], PackingController.prototype, "updateCategoryAssignees", null);
exports.PackingController = PackingController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/packing'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [packing_service_1.PackingService])
], PackingController);
