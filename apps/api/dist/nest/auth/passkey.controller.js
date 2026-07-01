"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasskeyController = void 0;
const common_1 = require("@nestjs/common");
const rate_limit_service_1 = require("./rate-limit.service");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const passkey_enabled_guard_1 = require("./passkey-enabled.guard");
const current_user_decorator_1 = require("./current-user.decorator");
const cookie_1 = require("../../services/cookie");
const auditLog_1 = require("../../services/auditLog");
const passkey = __importStar(require("../../services/passkeyService"));
const WINDOW = 15 * 60 * 1000;
const LOGIN_MIN_LATENCY_MS = 350;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * /api/auth/passkey — WebAuthn (passkey) registration, primary login and
 * credential management.
 *
 * - register/*  : authenticated, gated by the admin toggle + password re-auth.
 * - login/*     : UNauthenticated discoverable-credential login, gated by the
 *                 admin toggle; mints the SAME session cookie as password login.
 * - credentials : owner-scoped management — intentionally NOT toggle-gated so a
 *                 user can always view/remove their passkeys.
 *
 * PasskeyEnabledGuard is listed first so a disabled feature 404s before auth.
 */
let PasskeyController = class PasskeyController {
    rl;
    constructor(rl) {
        this.rl = rl;
    }
    limit(bucket, req, max) {
        if (!this.rl.check(bucket, req.ip || 'unknown', max, WINDOW, Date.now())) {
            throw new common_1.HttpException({ error: 'Too many attempts. Please try again later.' }, 429);
        }
    }
    // ── Registration (authenticated) ──
    async registerOptions(user, body, req) {
        this.limit('mfa', req, 5);
        const result = await passkey.passkeyRegisterOptions(user.id, body?.password);
        if (result.error)
            throw new common_1.HttpException({ error: result.error }, result.status);
        return result.options;
    }
    async registerVerify(user, body, req) {
        const result = await passkey.passkeyRegisterVerify(user.id, body);
        if (result.error)
            throw new common_1.HttpException({ error: result.error }, result.status);
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'user.passkey_register', ip: (0, auditLog_1.getClientIp)(req) });
        return { success: true, credential: result.credential };
    }
    // ── Authentication (public — primary login) ──
    async loginOptions(req) {
        this.limit('login', req, 10);
        const result = await passkey.passkeyLoginOptions();
        if (result.error)
            throw new common_1.HttpException({ error: result.error }, result.status);
        return result.options;
    }
    async loginVerify(body, req, res) {
        this.limit('login', req, 10);
        const started = Date.now();
        const result = await passkey.passkeyLoginVerify(body);
        if (result.auditAction) {
            (0, auditLog_1.writeAudit)({ userId: result.auditUserId ?? null, action: result.auditAction, ip: (0, auditLog_1.getClientIp)(req) });
        }
        // Pad to the same floor as password login so timing can't distinguish a
        // known credential from an unknown one.
        const elapsed = Date.now() - started;
        if (elapsed < LOGIN_MIN_LATENCY_MS)
            await delay(LOGIN_MIN_LATENCY_MS - elapsed);
        if (result.error)
            throw new common_1.HttpException({ error: result.error }, result.status);
        (0, auditLog_1.writeAudit)({ userId: result.auditUserId, action: 'user.login', ip: (0, auditLog_1.getClientIp)(req), details: { method: 'passkey' } });
        (0, cookie_1.setAuthCookie)(res, result.token, req);
        return { token: result.token, user: result.user };
    }
    // ── Management (authenticated, owner-scoped — NOT toggle-gated) ──
    list(user) {
        return { credentials: passkey.listPasskeys(user.id) };
    }
    rename(user, id, body) {
        const result = passkey.renamePasskey(user.id, id, body?.name);
        if (result.error)
            throw new common_1.HttpException({ error: result.error }, result.status);
        return { success: true };
    }
    remove(user, id, body, req) {
        this.limit('login', req, 5);
        const result = passkey.deletePasskey(user.id, id, body?.password);
        if (result.error)
            throw new common_1.HttpException({ error: result.error }, result.status);
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'user.passkey_delete', resource: String(id), ip: (0, auditLog_1.getClientIp)(req) });
        return { success: true };
    }
};
exports.PasskeyController = PasskeyController;
__decorate([
    (0, common_1.Post)('register/options'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(passkey_enabled_guard_1.PasskeyEnabledGuard, jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], PasskeyController.prototype, "registerOptions", null);
__decorate([
    (0, common_1.Post)('register/verify'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(passkey_enabled_guard_1.PasskeyEnabledGuard, jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], PasskeyController.prototype, "registerVerify", null);
__decorate([
    (0, common_1.Post)('login/options'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(passkey_enabled_guard_1.PasskeyEnabledGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PasskeyController.prototype, "loginOptions", null);
__decorate([
    (0, common_1.Post)('login/verify'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(passkey_enabled_guard_1.PasskeyEnabledGuard),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], PasskeyController.prototype, "loginVerify", null);
__decorate([
    (0, common_1.Get)('credentials'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PasskeyController.prototype, "list", null);
__decorate([
    (0, common_1.Patch)('credentials/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], PasskeyController.prototype, "rename", null);
__decorate([
    (0, common_1.Delete)('credentials/:id'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], PasskeyController.prototype, "remove", null);
exports.PasskeyController = PasskeyController = __decorate([
    (0, common_1.Controller)('api/auth/passkey'),
    __metadata("design:paramtypes", [rate_limit_service_1.RateLimitService])
], PasskeyController);
