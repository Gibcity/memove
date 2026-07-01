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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const auth_service_1 = require("./auth.service");
const rate_limit_service_1 = require("./rate-limit.service");
const jwt_auth_guard_1 = require("./jwt-auth.guard");
const current_user_decorator_1 = require("./current-user.decorator");
const auditLog_1 = require("../../services/auditLog");
const demo_1 = require("../../services/demo");
const WINDOW = 15 * 60 * 1000;
const avatarDir = path_1.default.join(__dirname, '../../../uploads/avatars');
const ALLOWED_AVATAR_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const AVATAR_UPLOAD = {
    storage: (0, multer_1.diskStorage)({
        destination: (_req, _file, cb) => { if (!fs_1.default.existsSync(avatarDir))
            fs_1.default.mkdirSync(avatarDir, { recursive: true }); cb(null, avatarDir); },
        filename: (_req, file, cb) => cb(null, (0, uuid_1.v4)() + path_1.default.extname(file.originalname)),
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (!file.mimetype.startsWith('image/') || !ALLOWED_AVATAR_EXTS.includes(ext)) {
            const err = new Error('Only image files (jpg, png, gif, webp) are allowed');
            err.statusCode = 400;
            return cb(err, false);
        }
        cb(null, true);
    },
};
/**
 * Authenticated account endpoints — byte-identical to the legacy Express route
 * (server/src/routes/auth.ts): the same /me/* account ops, avatar upload (with
 * the demo-mode block), settings, key validation, MFA setup/enable/disable, MCP
 * tokens and the short-lived ws/resource tokens. The per-IP rate limits reuse
 * the shared buckets (the inline rateLimiter(5) shares the 'login' bucket, as in
 * the legacy code). create-token answers 201; everything else 200.
 */
let AuthController = class AuthController {
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
    me(user) {
        const loaded = this.auth.getCurrentUser(user.id);
        if (!loaded) {
            throw new common_1.HttpException({ error: 'User not found' }, 404);
        }
        return { user: loaded };
    }
    changePassword(user, body, req, res) {
        this.limit('login', req, 5);
        const result = this.auth.changePassword(user.id, user.email, body);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        // Refresh this device's cookie with the new password_version so the user
        // stays logged in here while all other sessions are invalidated.
        if (result.token)
            this.auth.setAuthCookie(res, result.token, req);
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'user.password_change', ip: (0, auditLog_1.getClientIp)(req) });
        return { success: true };
    }
    deleteAccount(user, req) {
        const result = this.auth.deleteAccount(user.id, user.email, user.role);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'user.account_delete', ip: (0, auditLog_1.getClientIp)(req) });
        return { success: true };
    }
    mapsKey(user, body) {
        return this.auth.updateMapsKey(user.id, body.maps_api_key);
    }
    apiKeys(user, body) {
        return this.auth.updateApiKeys(user.id, body);
    }
    updateSettings(user, body) {
        const result = this.auth.updateSettings(user.id, body);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        return { success: result.success, user: result.user };
    }
    getSettings(user) {
        const result = this.auth.getSettings(user.id);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        return { settings: result.settings };
    }
    async avatar(user, file) {
        if (process.env.DEMO_MODE?.toLowerCase() === 'true' && (0, demo_1.isDemoEmail)(user.email)) {
            throw new common_1.HttpException({ error: 'Uploads are disabled in demo mode. Self-host memove for full functionality.' }, 403);
        }
        if (!file) {
            throw new common_1.HttpException({ error: 'No image uploaded' }, 400);
        }
        return this.auth.saveAvatar(user.id, file.filename);
    }
    async deleteAvatar(user) {
        return this.auth.deleteAvatar(user.id);
    }
    users(user) {
        return { users: this.auth.listUsers(user.id) };
    }
    async validateKeys(user) {
        const result = await this.auth.validateKeys(user.id);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        return { maps: result.maps, weather: result.weather, maps_details: result.maps_details };
    }
    getAppSettings(user) {
        const result = this.auth.getAppSettings(user.id);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        return result.data;
    }
    updateAppSettings(user, body, req) {
        const result = this.auth.updateAppSettings(user.id, body);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'settings.app_update', ip: (0, auditLog_1.getClientIp)(req), details: result.auditSummary, debugDetails: result.auditDebugDetails });
        return { success: true };
    }
    travelStats(user) {
        return this.auth.getTravelStats(user.id);
    }
    async mfaSetup(user) {
        const result = this.auth.setupMfa(user.id, user.email);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        try {
            const qr_svg = await result.qrPromise;
            return { secret: result.secret, otpauth_url: result.otpauth_url, qr_svg };
        }
        catch (err) {
            console.error('[MFA] QR code generation error:', err);
            throw new common_1.HttpException({ error: 'Could not generate QR code' }, 500);
        }
    }
    mfaEnable(user, body, req) {
        this.limit('mfa', req, 5);
        const result = this.auth.enableMfa(user.id, body.code);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'user.mfa_enable', ip: (0, auditLog_1.getClientIp)(req) });
        return { success: true, mfa_enabled: result.mfa_enabled, backup_codes: result.backup_codes };
    }
    mfaDisable(user, body, req) {
        this.limit('login', req, 5);
        const result = this.auth.disableMfa(user.id, user.email, body);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'user.mfa_disable', ip: (0, auditLog_1.getClientIp)(req) });
        return { success: true, mfa_enabled: result.mfa_enabled };
    }
    listMcpTokens(user) {
        return { tokens: this.auth.listMcpTokens(user.id) };
    }
    createMcpToken(user, body, req) {
        this.limit('login', req, 5);
        const result = this.auth.createMcpToken(user.id, body.name);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        return { token: result.token };
    }
    deleteMcpToken(user, id) {
        const result = this.auth.deleteMcpToken(user.id, id);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        return { success: true };
    }
    wsToken(user) {
        const result = this.auth.createWsToken(user.id);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        return { token: result.token };
    }
    resourceToken(user, body) {
        const token = this.auth.createResourceToken(user.id, body.purpose);
        if (!token) {
            throw new common_1.HttpException({ error: 'Service unavailable' }, 503);
        }
        return token;
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Get)('me'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "me", null);
__decorate([
    (0, common_1.Put)('me/password'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "changePassword", null);
__decorate([
    (0, common_1.Delete)('me'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "deleteAccount", null);
__decorate([
    (0, common_1.Put)('me/maps-key'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "mapsKey", null);
__decorate([
    (0, common_1.Put)('me/api-keys'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "apiKeys", null);
__decorate([
    (0, common_1.Put)('me/settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "updateSettings", null);
__decorate([
    (0, common_1.Get)('me/settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Post)('avatar'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('avatar', AVATAR_UPLOAD)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "avatar", null);
__decorate([
    (0, common_1.Delete)('avatar'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "deleteAvatar", null);
__decorate([
    (0, common_1.Get)('users'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "users", null);
__decorate([
    (0, common_1.Get)('validate-keys'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "validateKeys", null);
__decorate([
    (0, common_1.Get)('app-settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "getAppSettings", null);
__decorate([
    (0, common_1.Put)('app-settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "updateAppSettings", null);
__decorate([
    (0, common_1.Get)('travel-stats'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "travelStats", null);
__decorate([
    (0, common_1.Post)('mfa/setup'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "mfaSetup", null);
__decorate([
    (0, common_1.Post)('mfa/enable'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "mfaEnable", null);
__decorate([
    (0, common_1.Post)('mfa/disable'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "mfaDisable", null);
__decorate([
    (0, common_1.Get)('mcp-tokens'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "listMcpTokens", null);
__decorate([
    (0, common_1.Post)('mcp-tokens'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "createMcpToken", null);
__decorate([
    (0, common_1.Delete)('mcp-tokens/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "deleteMcpToken", null);
__decorate([
    (0, common_1.Post)('ws-token'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "wsToken", null);
__decorate([
    (0, common_1.Post)('resource-token'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "resourceToken", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('api/auth'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [auth_service_1.AuthService, rate_limit_service_1.RateLimitService])
], AuthController);
