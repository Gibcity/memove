"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptionalJwtGuard = void 0;
const common_1 = require("@nestjs/common");
const auth_1 = require("../../middleware/auth");
/**
 * Mirrors the legacy `optionalAuth` middleware: populates req.user with the
 * loaded user when a valid token is present, otherwise leaves it null — and
 * always allows the request through (never 401). Used for endpoints whose
 * response varies by auth state but don't require it (e.g. /app-config).
 */
let OptionalJwtGuard = class OptionalJwtGuard {
    canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const token = (0, auth_1.extractToken)(req);
        req.user = (token ? (0, auth_1.verifyJwtAndLoadUser)(token) : null) || null;
        return true;
    }
};
exports.OptionalJwtGuard = OptionalJwtGuard;
exports.OptionalJwtGuard = OptionalJwtGuard = __decorate([
    (0, common_1.Injectable)()
], OptionalJwtGuard);
