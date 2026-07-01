"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OauthModule = void 0;
const common_1 = require("@nestjs/common");
const oauth_public_controller_1 = require("./oauth-public.controller");
const oauth_api_controller_1 = require("./oauth-api.controller");
const oauth_service_1 = require("./oauth.service");
const rate_limit_service_1 = require("../auth/rate-limit.service");
/**
 * OAuth 2.1 server (MCP). Public token/userinfo/revoke endpoints + the SPA's
 * authenticated consent/client/session management. The SDK-mounted
 * /oauth/authorize, /oauth/register and /oauth/consent stay on Express, so the
 * strangler lists /oauth/token, /oauth/userinfo, /oauth/revoke explicitly.
 */
let OauthModule = class OauthModule {
};
exports.OauthModule = OauthModule;
exports.OauthModule = OauthModule = __decorate([
    (0, common_1.Module)({
        controllers: [oauth_public_controller_1.OauthPublicController, oauth_api_controller_1.OauthApiController],
        providers: [oauth_service_1.OauthService, rate_limit_service_1.RateLimitService],
    })
], OauthModule);
