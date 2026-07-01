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
exports.TagsController = void 0;
const common_1 = require("@nestjs/common");
const tags_service_1 = require("./tags.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/**
 * /api/tags — per-user place-tag CRUD.
 *
 * Byte-identical to the legacy Express route (server/src/routes/tags.ts): every
 * endpoint requires auth and is scoped to the caller's own tags. Update/delete
 * verify ownership via getTagByIdAndUser and 404 otherwise. Status codes match
 * the Nest defaults the legacy route used (201 on create, 200 elsewhere); the
 * bespoke 400/404 bodies are reproduced exactly.
 */
let TagsController = class TagsController {
    tags;
    constructor(tags) {
        this.tags = tags;
    }
    list(user) {
        return { tags: this.tags.list(user.id) };
    }
    create(user, name, color) {
        if (!name) {
            throw new common_1.HttpException({ error: 'Tag name is required' }, 400);
        }
        return { tag: this.tags.create(user.id, name, color) };
    }
    update(user, id, name, color) {
        if (!this.tags.getByIdAndUser(id, user.id)) {
            throw new common_1.HttpException({ error: 'Tag not found' }, 404);
        }
        return { tag: this.tags.update(id, name, color) };
    }
    remove(user, id) {
        if (!this.tags.getByIdAndUser(id, user.id)) {
            throw new common_1.HttpException({ error: 'Tag not found' }, 404);
        }
        this.tags.remove(id);
        return { success: true };
    }
};
exports.TagsController = TagsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], TagsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)('name')),
    __param(2, (0, common_1.Body)('color')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Object)
], TagsController.prototype, "create", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)('name')),
    __param(3, (0, common_1.Body)('color')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Object)
], TagsController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Object)
], TagsController.prototype, "remove", null);
exports.TagsController = TagsController = __decorate([
    (0, common_1.Controller)('api/tags'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [tags_service_1.TagsService])
], TagsController);
