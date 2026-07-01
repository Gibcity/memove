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
exports.OauthApiController = void 0;
const common_1 = require("@nestjs/common");
const oauth_service_1 = require("./oauth.service");
const rate_limit_service_1 = require("../auth/rate-limit.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const cookie_auth_guard_1 = require("../auth/cookie-auth.guard");
const optional_jwt_guard_1 = require("../auth/optional-jwt.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const auditLog_1 = require("../../services/auditLog");
const MIN = 60_000;
/**
 * Authenticated OAuth management endpoints (the SPA's consent + client/session
 * UI) — byte-identical to the legacy oauthApiRouter (server/src/routes/oauth.ts):
 * MCP-addon gated (404 on the anonymous validate to avoid fingerprinting, 403
 * elsewhere), optional-auth on validate, cookie-only auth on state-changing
 * routes (consent/create/rotate/delete/revoke) and Bearer-or-cookie auth on the
 * read lists. create answers 201; the rest 200.
 */
let OauthApiController = class OauthApiController {
    oauth;
    rl;
    constructor(oauth, rl) {
        this.oauth = oauth;
        this.rl = rl;
    }
    requireMcp403() {
        if (!this.oauth.mcpEnabled()) {
            throw new common_1.HttpException({ error: 'MCP is not enabled' }, 403);
        }
    }
    validate(req, params, res) {
        if (!this.rl.check('oauth_validate', req.ip || 'unknown', 30, MIN, Date.now())) {
            throw new common_1.HttpException({ error: 'too_many_requests', error_description: 'Too many attempts. Please try again later.' }, 429);
        }
        if (!this.oauth.mcpEnabled()) {
            // 404 (not 403) with an empty body so anonymous callers can't fingerprint the feature.
            res.status(404).end();
            return undefined;
        }
        const userId = req.user?.id ?? null;
        const result = this.oauth.validateAuthorizeRequest({
            response_type: params.response_type || '',
            client_id: params.client_id || '',
            redirect_uri: params.redirect_uri || '',
            scope: params.scope || '',
            state: params.state,
            code_challenge: params.code_challenge || '',
            code_challenge_method: params.code_challenge_method || '',
            resource: typeof params.resource === 'string' ? params.resource : undefined,
        }, userId);
        if (userId === null && result.valid) {
            return { valid: result.valid, loginRequired: true };
        }
        if (userId === null && !result.valid) {
            return { valid: false, error: 'invalid_request', error_description: 'Invalid authorization request' };
        }
        return result;
    }
    authorize(user, body, req) {
        const ip = (0, auditLog_1.getClientIp)(req);
        if (!this.oauth.mcpEnabled()) {
            throw new common_1.HttpException({ error: 'MCP is not enabled' }, 403);
        }
        if (!body.approved) {
            const url = new URL(body.redirect_uri);
            url.searchParams.set('error', 'access_denied');
            url.searchParams.set('error_description', 'User denied the authorization request');
            if (body.state)
                url.searchParams.set('state', body.state);
            return { redirect: url.toString() };
        }
        const params = {
            response_type: 'code',
            client_id: body.client_id,
            redirect_uri: body.redirect_uri,
            scope: body.scope,
            state: body.state,
            code_challenge: body.code_challenge,
            code_challenge_method: body.code_challenge_method,
            resource: body.resource,
        };
        const validation = this.oauth.validateAuthorizeRequest(params, user.id);
        if (!validation.valid) {
            throw new common_1.HttpException({ error: validation.error, error_description: validation.error_description }, 400);
        }
        const scopes = validation.scopes;
        this.oauth.saveConsent(body.client_id, user.id, scopes, ip);
        const code = this.oauth.createAuthCode({
            clientId: body.client_id,
            userId: user.id,
            redirectUri: body.redirect_uri,
            scopes,
            resource: validation.resource ?? null,
            codeChallenge: body.code_challenge,
            codeChallengeMethod: 'S256',
        });
        if (!code) {
            throw new common_1.HttpException({ error: 'server_error', error_description: 'Authorization server is temporarily unavailable' }, 503);
        }
        const url = new URL(body.redirect_uri);
        url.searchParams.set('code', code);
        if (body.state)
            url.searchParams.set('state', body.state);
        return { redirect: url.toString() };
    }
    listClients(user) {
        this.requireMcp403();
        return { clients: this.oauth.listOAuthClients(user.id) };
    }
    createClient(user, body, req) {
        this.requireMcp403();
        const result = this.oauth.createOAuthClient(user.id, body.name, body.redirect_uris ?? [], body.allowed_scopes, (0, auditLog_1.getClientIp)(req), { allowsClientCredentials: body.allows_client_credentials });
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status || 400);
        }
        return result;
    }
    rotateClient(user, id, req) {
        this.requireMcp403();
        const result = this.oauth.rotateOAuthClientSecret(user.id, id, (0, auditLog_1.getClientIp)(req));
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status || 400);
        }
        return { client_secret: result.client_secret };
    }
    deleteClient(user, id, req) {
        this.requireMcp403();
        const result = this.oauth.deleteOAuthClient(user.id, id, (0, auditLog_1.getClientIp)(req));
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status || 400);
        }
        return { success: true };
    }
    listSessions(user) {
        this.requireMcp403();
        return { sessions: this.oauth.listOAuthSessions(user.id) };
    }
    revokeSession(user, id, req) {
        this.requireMcp403();
        const result = this.oauth.revokeSession(user.id, Number(id), (0, auditLog_1.getClientIp)(req));
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status || 400);
        }
        return { success: true };
    }
};
exports.OauthApiController = OauthApiController;
__decorate([
    (0, common_1.Get)('authorize/validate'),
    (0, common_1.UseGuards)(optional_jwt_guard_1.OptionalJwtGuard),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], OauthApiController.prototype, "validate", null);
__decorate([
    (0, common_1.Post)('authorize'),
    (0, common_1.HttpCode)(200) // Express answers consent with res.json (200), not the POST-default 201.
    ,
    (0, common_1.UseGuards)(cookie_auth_guard_1.CookieAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], OauthApiController.prototype, "authorize", null);
__decorate([
    (0, common_1.Get)('clients'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OauthApiController.prototype, "listClients", null);
__decorate([
    (0, common_1.Post)('clients'),
    (0, common_1.HttpCode)(201),
    (0, common_1.UseGuards)(cookie_auth_guard_1.CookieAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], OauthApiController.prototype, "createClient", null);
__decorate([
    (0, common_1.Post)('clients/:id/rotate'),
    (0, common_1.HttpCode)(200),
    (0, common_1.UseGuards)(cookie_auth_guard_1.CookieAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], OauthApiController.prototype, "rotateClient", null);
__decorate([
    (0, common_1.Delete)('clients/:id'),
    (0, common_1.UseGuards)(cookie_auth_guard_1.CookieAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], OauthApiController.prototype, "deleteClient", null);
__decorate([
    (0, common_1.Get)('sessions'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], OauthApiController.prototype, "listSessions", null);
__decorate([
    (0, common_1.Delete)('sessions/:id'),
    (0, common_1.UseGuards)(cookie_auth_guard_1.CookieAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], OauthApiController.prototype, "revokeSession", null);
exports.OauthApiController = OauthApiController = __decorate([
    (0, common_1.Controller)('api/oauth'),
    __metadata("design:paramtypes", [oauth_service_1.OauthService, rate_limit_service_1.RateLimitService])
], OauthApiController);
