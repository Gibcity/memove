"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TagsService = void 0;
const common_1 = require("@nestjs/common");
const tagService_1 = require("../../services/tagService");
/**
 * Thin Nest wrapper around the existing tag service. Ownership scoping and the
 * default colour fallback stay in tagService, so behaviour is unchanged.
 */
let TagsService = class TagsService {
    list(userId) {
        return (0, tagService_1.listTags)(userId);
    }
    getByIdAndUser(id, userId) {
        return (0, tagService_1.getTagByIdAndUser)(id, userId);
    }
    create(userId, name, color) {
        return (0, tagService_1.createTag)(userId, name, color);
    }
    update(id, name, color) {
        return (0, tagService_1.updateTag)(id, name, color);
    }
    remove(id) {
        (0, tagService_1.deleteTag)(id);
    }
};
exports.TagsService = TagsService;
exports.TagsService = TagsService = __decorate([
    (0, common_1.Injectable)()
], TagsService);
