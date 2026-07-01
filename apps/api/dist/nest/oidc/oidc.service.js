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
exports.OidcService = void 0;
const common_1 = require("@nestjs/common");
const oidc = __importStar(require("../../services/oidcService"));
const notifications_1 = require("../../services/notifications");
const authService_1 = require("../../services/authService");
const cookie_1 = require("../../services/cookie");
/**
 * Thin Nest wrapper around the existing OIDC service. PKCE state, discovery,
 * the strict id_token/JWKS verification, user provisioning and the auth-code
 * hand-off all reuse the legacy code unchanged.
 */
let OidcService = class OidcService {
    oidcLoginEnabled() { return (0, authService_1.resolveAuthToggles)().oidc_login; }
    getOidcConfig() { return oidc.getOidcConfig(); }
    getAppUrl() { return (0, notifications_1.getAppUrl)(); }
    discover(issuer, discoveryUrl) { return oidc.discover(issuer, discoveryUrl); }
    createState(redirectUri, inviteToken) { return oidc.createState(redirectUri, inviteToken); }
    consumeState(state) { return oidc.consumeState(state); }
    exchangeCodeForToken(...args) { return oidc.exchangeCodeForToken(...args); }
    verifyIdToken(...args) { return oidc.verifyIdToken(...args); }
    getUserInfo(endpoint, accessToken) { return oidc.getUserInfo(endpoint, accessToken); }
    findOrCreateUser(...args) { return oidc.findOrCreateUser(...args); }
    touchLastLogin(userId) { return oidc.touchLastLogin(userId); }
    generateToken(user) { return oidc.generateToken(user); }
    createAuthCode(token) { return oidc.createAuthCode(token); }
    consumeAuthCode(code) { return oidc.consumeAuthCode(code); }
    frontendUrl(path) { return oidc.frontendUrl(path); }
    setAuthCookie(res, token, req) { (0, cookie_1.setAuthCookie)(res, token, req); }
};
exports.OidcService = OidcService;
exports.OidcService = OidcService = __decorate([
    (0, common_1.Injectable)()
], OidcService);
