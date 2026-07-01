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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const auth = __importStar(require("../../services/authService"));
const cookie_1 = require("../../services/cookie");
const notifications_1 = require("../../services/notifications");
/**
 * Thin Nest wrapper around the existing auth service. Token generation, the
 * password/MFA/backup-code crypto, the JWT cookie set/clear and the reset-email
 * delivery all reuse the legacy code unchanged. Access control + audit stay in
 * the controller (mirroring the legacy route handlers).
 */
let AuthService = class AuthService {
    // Cookie
    setAuthCookie(res, token, req, remember) { (0, cookie_1.setAuthCookie)(res, token, req, remember); }
    clearAuthCookie(res, req) { (0, cookie_1.clearAuthCookie)(res, req); }
    // Reset-email delivery (canonical app URL, never request headers)
    getAppUrl() { return (0, notifications_1.getAppUrl)(); }
    sendPasswordResetEmail(email, url, userId) { return (0, notifications_1.sendPasswordResetEmail)(email, url, userId); }
    // Public config + auth flows
    getAppConfig(user) { return auth.getAppConfig(user); }
    demoLogin() { return auth.demoLogin(); }
    validateInviteToken(token) { return auth.validateInviteToken(token); }
    registerUser(body) { return auth.registerUser(body); }
    loginUser(body) { return auth.loginUser(body); }
    requestPasswordReset(email, ip) { return auth.requestPasswordReset(email, ip); }
    resetPassword(body) { return auth.resetPassword(body); }
    verifyMfaLogin(body) { return auth.verifyMfaLogin(body); }
    // Account
    getCurrentUser(userId) { return auth.getCurrentUser(userId); }
    changePassword(userId, email, body) { return auth.changePassword(userId, email, body); }
    deleteAccount(userId, email, role) { return auth.deleteAccount(userId, email, role); }
    updateMapsKey(userId, key) { return auth.updateMapsKey(userId, key); }
    updateApiKeys(userId, body) { return auth.updateApiKeys(userId, body); }
    updateSettings(userId, body) { return auth.updateSettings(userId, body); }
    getSettings(userId) { return auth.getSettings(userId); }
    saveAvatar(userId, filename) { return auth.saveAvatar(userId, filename); }
    deleteAvatar(userId) { return auth.deleteAvatar(userId); }
    listUsers(userId) { return auth.listUsers(userId); }
    validateKeys(userId) { return auth.validateKeys(userId); }
    getAppSettings(userId) { return auth.getAppSettings(userId); }
    updateAppSettings(userId, body) { return auth.updateAppSettings(userId, body); }
    getTravelStats(userId) { return auth.getTravelStats(userId); }
    // MFA
    setupMfa(userId, email) { return auth.setupMfa(userId, email); }
    enableMfa(userId, code) { return auth.enableMfa(userId, code); }
    disableMfa(userId, email, body) { return auth.disableMfa(userId, email, body); }
    // MCP tokens + short-lived tokens
    listMcpTokens(userId) { return auth.listMcpTokens(userId); }
    createMcpToken(userId, name) { return auth.createMcpToken(userId, name); }
    deleteMcpToken(userId, id) { return auth.deleteMcpToken(userId, id); }
    createWsToken(userId) { return auth.createWsToken(userId); }
    createResourceToken(userId, purpose) { return auth.createResourceToken(userId, purpose); }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)()
], AuthService);
