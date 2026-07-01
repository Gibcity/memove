"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JwtAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const auth_1 = require("../../middleware/auth");
/**
 * Validates memove's existing JWT session — the same httpOnly `memove_session`
 * cookie (or `Authorization: Bearer`) the legacy app uses. Reuses the canonical
 * `verifyJwtAndLoadUser` so the secret, the password_version invalidation gate
 * and the loaded user are IDENTICAL to the Express middleware. No new tokens.
 *
 * Error bodies match the legacy 401 shape exactly so the client is unaffected.
 */
let JwtAuthGuard = class JwtAuthGuard {
    canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const token = (0, auth_1.extractToken)(req);
        if (!token) {
            throw new common_1.HttpException({ error: 'Access token required', code: 'AUTH_REQUIRED' }, 401);
        }
        const user = (0, auth_1.verifyJwtAndLoadUser)(token);
        if (!user) {
            throw new common_1.HttpException({ error: 'Invalid or expired token', code: 'AUTH_REQUIRED' }, 401);
        }
        req.user = user;
        return true;
    }
};
exports.JwtAuthGuard = JwtAuthGuard;
exports.JwtAuthGuard = JwtAuthGuard = __decorate([
    (0, common_1.Injectable)()
], JwtAuthGuard);
