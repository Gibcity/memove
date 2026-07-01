"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoriesService = void 0;
const common_1 = require("@nestjs/common");
const categoryService_1 = require("../../services/categoryService");
/**
 * Thin Nest wrapper around the existing category service. The SQL and the
 * default colour/icon fallbacks stay in categoryService, so behaviour is
 * unchanged.
 */
let CategoriesService = class CategoriesService {
    list() {
        return (0, categoryService_1.listCategories)();
    }
    getById(id) {
        return (0, categoryService_1.getCategoryById)(id);
    }
    create(userId, name, color, icon) {
        return (0, categoryService_1.createCategory)(userId, name, color, icon);
    }
    update(id, name, color, icon) {
        return (0, categoryService_1.updateCategory)(id, name, color, icon);
    }
    remove(id) {
        (0, categoryService_1.deleteCategory)(id);
    }
};
exports.CategoriesService = CategoriesService;
exports.CategoriesService = CategoriesService = __decorate([
    (0, common_1.Injectable)()
], CategoriesService);
