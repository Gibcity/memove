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
exports.AuthPublicController = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const rate_limit_service_1 = require("./rate-limit.service");
const optional_jwt_guard_1 = require("./optional-jwt.guard");
const auditLog_1 = require("../../services/auditLog");
const WINDOW = 15 * 60 * 1000;
const LOGIN_MIN_LATENCY_MS = 350;
const FORGOT_MIN_LATENCY_MS = 350;
const GENERIC_FORGOT_RESPONSE = { ok: true };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Public auth endpoints (no session required) — byte-identical to the legacy
 * Express route (server/src/routes/auth.ts): the same per-IP rate-limit buckets
 * + limits, the constant-time login/forgot latency padding, the enumeration-safe
 * forgot response, the audit writes and the JWT httpOnly cookie set/clear via
 * the shared cookie service (no new token shape).
 */
let AuthPublicController = class AuthPublicController {
    auth;
    rl;
    constructor(auth, rl) {
        this.auth = auth;
        this.rl = rl;
    }
    limit(bucket, req, max) {
        if (!this.rl.check(bucket, req.ip || 'unknown', max, WINDOW, Date.now())) {
            throw new common_1.HttpException({ error: 'Too many attempts. Please try again later.' }, 429);
        }
    }
    appConfig(req) {
        return this.auth.getAppConfig(req.user ?? undefined);
    }
    demoLogin(req, res) {
        const result = this.auth.demoLogin();
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        this.auth.setAuthCookie(res, result.token, req);
        return { token: result.token, user: result.user };
    }
    invite(token, req) {
        this.limit('login', req, 10);
        const result = this.auth.validateInviteToken(token);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        return { valid: result.valid, max_uses: result.max_uses, used_count: result.used_count, expires_at: result.expires_at };
    }
    register(body, req, res) {
        this.limit('login', req, 10);
        const result = this.auth.registerUser(body);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        (0, auditLog_1.writeAudit)({ userId: result.auditUserId, action: 'user.register', ip: (0, auditLog_1.getClientIp)(req), details: result.auditDetails });
        this.auth.setAuthCookie(res, result.token, req);
        return { token: result.token, user: result.user };
    }
    async login(body, req, res) {
        this.limit('login', req, 10);
        const started = Date.now();
        const result = this.auth.loginUser(body);
        if (result.auditAction) {
            (0, auditLog_1.writeAudit)({ userId: result.auditUserId ?? null, action: result.auditAction, ip: (0, auditLog_1.getClientIp)(req), details: result.auditDetails });
        }
        const elapsed = Date.now() - started;
        if (elapsed < LOGIN_MIN_LATENCY_MS)
            await delay(LOGIN_MIN_LATENCY_MS - elapsed);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        if (result.mfa_required) {
            return { mfa_required: true, mfa_token: result.mfa_token };
        }
        this.auth.setAuthCookie(res, result.token, req, result.remember);
        return { token: result.token, user: result.user };
    }
    async forgotPassword(body, req) {
        this.limit('forgot', req, 3);
        const started = Date.now();
        const rawEmail = typeof body?.email === 'string' ? body.email : '';
        const ip = (0, auditLog_1.getClientIp)(req);
        const outcome = this.auth.requestPasswordReset(rawEmail, ip);
        if (outcome.reason === 'issued' && outcome.tokenForDelivery && outcome.userEmail) {
            const origin = this.auth.getAppUrl();
            const url = `${origin.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(outcome.tokenForDelivery)}`;
            (0, auditLog_1.writeAudit)({ userId: outcome.userId, action: 'user.password_reset_request', ip, details: { delivered: 'pending' } });
            try {
                const delivery = await this.auth.sendPasswordResetEmail(outcome.userEmail, url, outcome.userId);
                (0, auditLog_1.writeAudit)({ userId: outcome.userId, action: 'user.password_reset_request', ip, details: { delivered: delivery.delivered } });
            }
            catch {
                (0, auditLog_1.writeAudit)({ userId: outcome.userId, action: 'user.password_reset_request', ip, details: { delivered: 'failed' } });
            }
        }
        else {
            (0, auditLog_1.writeAudit)({ userId: outcome.userId, action: 'user.password_reset_request', ip, details: { reason: outcome.reason } });
        }
        const elapsed = Date.now() - started;
        if (elapsed < FORGOT_MIN_LATENCY_MS)
            await delay(FORGOT_MIN_LATENCY_MS - elapsed);
        return GENERIC_FORGOT_RESPONSE;
    }
    resetPassword(body, req) {
        // Per-IP brute-force guard, parity with the legacy resetLimiter (5 / 15 min on
        // a dedicated bucket) — without it reset tokens could be guessed unthrottled.
        this.limit('reset', req, 5);
        const ip = (0, auditLog_1.getClientIp)(req);
        const result = this.auth.resetPassword(body);
        if (result.error) {
            (0, auditLog_1.writeAudit)({ userId: null, action: 'user.password_reset_fail', ip, details: { reason: result.error } });
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        if (result.mfa_required) {
            return { mfa_required: true };
        }
        (0, auditLog_1.writeAudit)({ userId: result.userId ?? null, action: 'user.password_reset_success', ip });
        return { success: true };
    }
    verifyMfaLogin(body, req, res) {
        this.limit('mfa', req, 5);
        const result = this.auth.verifyMfaLogin(body);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        (0, auditLog_1.writeAudit)({ userId: result.auditUserId, action: 'user.login', ip: (0, auditLog_1.getClientIp)(req), details: { mfa: true } });
        this.auth.setAuthCookie(res, result.token, req, result.remember);
        return { token: result.token, user: result.user };
    }
    logout(req, res) {
        this.auth.clearAuthCookie(res, req);
        return { success: true };
    }
};
exports.AuthPublicController = AuthPublicController;
__decorate([
    (0, common_1.Get)('app-config'),
    (0, common_1.UseGuards)(optional_jwt_guard_1.OptionalJwtGuard),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthPublicController.prototype, "appConfig", null);
__decorate([
    (0, common_1.Post)('demo-login'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthPublicController.prototype, "demoLogin", null);
__decorate([
    (0, common_1.Get)('invite/:token'),
    __param(0, (0, common_1.Param)('token')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AuthPublicController.prototype, "invite", null);
__decorate([
    (0, common_1.Post)('register'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AuthPublicController.prototype, "register", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthPublicController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('forgot-password'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthPublicController.prototype, "forgotPassword", null);
__decorate([
    (0, common_1.Post)('reset-password'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthPublicController.prototype, "resetPassword", null);
__decorate([
    (0, common_1.Post)('mfa/verify-login'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AuthPublicController.prototype, "verifyMfaLogin", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthPublicController.prototype, "logout", null);
exports.AuthPublicController = AuthPublicController = __decorate([
    (0, common_1.Controller)('api/auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService, rate_limit_service_1.RateLimitService])
], AuthPublicController);
