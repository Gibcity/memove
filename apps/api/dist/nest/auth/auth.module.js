"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const auth_public_controller_1 = require("./auth-public.controller");
const auth_controller_1 = require("./auth.controller");
const passkey_controller_1 = require("./passkey.controller");
const auth_service_1 = require("./auth.service");
const rate_limit_service_1 = require("./rate-limit.service");
/**
 * Auth module — public flows (login/register/reset/mfa-verify/logout) and the
 * authenticated account/MFA/token endpoints. The OIDC sub-mount (/api/auth/oidc)
 * is a separate, not-yet-migrated route, so the strangler lists the auth
 * sub-paths explicitly rather than claiming all of /api/auth.
 */
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        controllers: [auth_public_controller_1.AuthPublicController, auth_controller_1.AuthController, passkey_controller_1.PasskeyController],
        providers: [auth_service_1.AuthService, rate_limit_service_1.RateLimitService],
    })
], AuthModule);
