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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OauthService = void 0;
const common_1 = require("@nestjs/common");
const oauth = __importStar(require("../../services/oauthService"));
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
const notifications_1 = require("../../services/notifications");
/**
 * Thin Nest wrapper around the existing OAuth 2.1 service. The grant handling,
 * PKCE, client auth, consent storage, token issue/refresh/revoke and the
 * client/session CRUD all reuse the legacy code unchanged.
 */
let OauthService = class OauthService {
    mcpEnabled() { return (0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.MCP); }
    mcpSafeUrl() { return (0, notifications_1.getMcpSafeUrl)(); }
    consumeAuthCode(code) { return oauth.consumeAuthCode(code); }
    authenticateClient(clientId, clientSecret) { return oauth.authenticateClient(clientId, clientSecret); }
    verifyPKCE(verifier, challenge) { return oauth.verifyPKCE(verifier, challenge); }
    issueTokens(...args) { return oauth.issueTokens(...args); }
    issueClientCredentialsToken(...args) { return oauth.issueClientCredentialsToken(...args); }
    refreshTokens(...args) { return oauth.refreshTokens(...args); }
    revokeToken(...args) { return oauth.revokeToken(...args); }
    getUserByAccessToken(token) { return oauth.getUserByAccessToken(token); }
    validateAuthorizeRequest(params, userId) { return oauth.validateAuthorizeRequest(params, userId); }
    saveConsent(...args) { return oauth.saveConsent(...args); }
    createAuthCode(...args) { return oauth.createAuthCode(...args); }
    listOAuthClients(userId) { return oauth.listOAuthClients(userId); }
    createOAuthClient(...args) { return oauth.createOAuthClient(...args); }
    rotateOAuthClientSecret(userId, id, ip) { return oauth.rotateOAuthClientSecret(userId, id, ip); }
    deleteOAuthClient(userId, id, ip) { return oauth.deleteOAuthClient(userId, id, ip); }
    listOAuthSessions(userId) { return oauth.listOAuthSessions(userId); }
    revokeSession(userId, id, ip) { return oauth.revokeSession(userId, id, ip); }
};
exports.OauthService = OauthService;
exports.OauthService = OauthService = __decorate([
    (0, common_1.Injectable)()
], OauthService);
