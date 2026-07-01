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
exports.TodoController = void 0;
const common_1 = require("@nestjs/common");
const todo_service_1 = require("./todo.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/**
 * /api/trips/:tripId/todo — trip-scoped task list.
 *
 * Byte-identical to the legacy Express route (server/src/routes/todo.ts): every
 * handler verifies trip access (404); mutations check the 'packing_edit'
 * permission (403); create is 201, the rest 200; the bespoke 400/404 bodies are
 * reproduced; mutations broadcast over WebSocket with the forwarded X-Socket-Id.
 * /reorder is declared before /:id so it wins over the param.
 */
let TodoController = class TodoController {
    todo;
    constructor(todo) {
        this.todo = todo;
    }
    requireTrip(tripId, user) {
        const trip = this.todo.verifyTripAccess(tripId, user.id);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        return trip;
    }
    requireEdit(trip, user) {
        if (!this.todo.canEdit(trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
    }
    list(user, tripId) {
        this.requireTrip(tripId, user);
        return { items: this.todo.listItems(tripId) };
    }
    create(user, tripId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!body.name) {
            throw new common_1.HttpException({ error: 'Item name is required' }, 400);
        }
        const { name, category, due_date, description, assigned_user_id, priority } = body;
        const item = this.todo.createItem(tripId, { name, category, due_date, description, assigned_user_id, priority });
        this.todo.broadcast(tripId, 'todo:created', { item }, socketId);
        return { item };
    }
    reorder(user, tripId, orderedIds) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        this.todo.reorderItems(tripId, orderedIds);
        return { success: true };
    }
    update(user, tripId, id, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const { name, checked, category, due_date, description, assigned_user_id, priority } = body;
        const updated = this.todo.updateItem(tripId, id, { name, checked, category, due_date, description, assigned_user_id, priority }, Object.keys(body));
        if (!updated) {
            throw new common_1.HttpException({ error: 'Item not found' }, 404);
        }
        this.todo.broadcast(tripId, 'todo:updated', { item: updated }, socketId);
        return { item: updated };
    }
    remove(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!this.todo.deleteItem(tripId, id)) {
            throw new common_1.HttpException({ error: 'Item not found' }, 404);
        }
        this.todo.broadcast(tripId, 'todo:deleted', { itemId: Number(id) }, socketId);
        return { success: true };
    }
    categoryAssignees(user, tripId) {
        this.requireTrip(tripId, user);
        return { assignees: this.todo.getCategoryAssignees(tripId) };
    }
    updateCategoryAssignees(user, tripId, categoryName, userIds, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const category = decodeURIComponent(categoryName);
        const rows = this.todo.updateCategoryAssignees(tripId, category, userIds);
        this.todo.broadcast(tripId, 'todo:assignees', { category, assignees: rows }, socketId);
        return { assignees: rows };
    }
};
exports.TodoController = TodoController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TodoController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], TodoController.prototype, "create", null);
__decorate([
    (0, common_1.Put)('reorder'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)('orderedIds')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Array]),
    __metadata("design:returntype", void 0)
], TodoController.prototype, "reorder", null);
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
], TodoController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], TodoController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)('category-assignees'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TodoController.prototype, "categoryAssignees", null);
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
], TodoController.prototype, "updateCategoryAssignees", null);
exports.TodoController = TodoController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/todo'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [todo_service_1.TodoService])
], TodoController);
