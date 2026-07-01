"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CookieAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const auth_1 = require("../../middleware/auth");
/**
 * Mirrors the legacy `requireCookieAuth` middleware: accepts ONLY the httpOnly
 * memove_session cookie (never a Bearer token), so CSRF-sensitive state-changing
 * OAuth endpoints (consent submit, client/session mutations) can't be driven by
 * a leaked Bearer. Error bodies + codes match the legacy 401 shapes exactly.
 */
let CookieAuthGuard = class CookieAuthGuard {
    canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const cookieToken = req.cookies?.memove_session;
        if (!cookieToken) {
            throw new common_1.HttpException({ error: 'Cookie session required for this endpoint', code: 'COOKIE_AUTH_REQUIRED' }, 401);
        }
        const user = (0, auth_1.verifyJwtAndLoadUser)(cookieToken);
        if (!user) {
            throw new common_1.HttpException({ error: 'Invalid or expired session', code: 'AUTH_REQUIRED' }, 401);
        }
        req.user = user;
        return true;
    }
};
exports.CookieAuthGuard = CookieAuthGuard;
exports.CookieAuthGuard = CookieAuthGuard = __decorate([
    (0, common_1.Injectable)()
], CookieAuthGuard);
