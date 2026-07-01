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
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const svc = __importStar(require("../../services/adminService"));
const settingsService_1 = require("../../services/settingsService");
const mcp_1 = require("../../mcp");
const notificationPreferencesService_1 = require("../../services/notificationPreferencesService");
const passkeyService_1 = require("../../services/passkeyService");
/**
 * Thin Nest wrapper around the existing admin service (+ the settings,
 * MCP-session and notification-preference helpers the legacy route used). All
 * business logic, audit-relevant return shapes and the addon/MCP invalidation
 * reuse the legacy code unchanged.
 */
let AdminService = class AdminService {
    // Users
    listUsers() { return svc.listUsers(); }
    createUser(body) { return svc.createUser(body); }
    updateUser(id, body) { return svc.updateUser(id, body); }
    deleteUser(id, actingUserId) { return svc.deleteUser(id, actingUserId); }
    resetUserPasskeys(id) { return (0, passkeyService_1.adminResetPasskeys)(Number(id)); }
    getStats() { return svc.getStats(); }
    getPermissions() { return svc.getPermissions(); }
    savePermissions(permissions) { return svc.savePermissions(permissions); }
    getAuditLog(query) { return svc.getAuditLog(query); }
    getOidcSettings() { return svc.getOidcSettings(); }
    updateOidcSettings(body) { return svc.updateOidcSettings(body); }
    saveDemoBaseline() { return svc.saveDemoBaseline(); }
    getGithubReleases(perPage, page) { return svc.getGithubReleases(perPage, page); }
    checkVersion() { return svc.checkVersion(); }
    // Invites
    listInvites() { return svc.listInvites(); }
    createInvite(userId, body) { return svc.createInvite(userId, body); }
    deleteInvite(id) { return svc.deleteInvite(id); }
    // Feature toggles
    getBagTracking() { return svc.getBagTracking(); }
    updateBagTracking(enabled) { return svc.updateBagTracking(enabled); }
    getPlacesPhotos() { return svc.getPlacesPhotos(); }
    updatePlacesPhotos(enabled) { return svc.updatePlacesPhotos(enabled); }
    getPlacesAutocomplete() { return svc.getPlacesAutocomplete(); }
    updatePlacesAutocomplete(enabled) { return svc.updatePlacesAutocomplete(enabled); }
    getPlacesDetails() { return svc.getPlacesDetails(); }
    updatePlacesDetails(enabled) { return svc.updatePlacesDetails(enabled); }
    getCollabFeatures() { return svc.getCollabFeatures(); }
    updateCollabFeatures(body) { return svc.updateCollabFeatures(body); }
    // Packing templates
    listPackingTemplates() { return svc.listPackingTemplates(); }
    getPackingTemplate(id) { return svc.getPackingTemplate(id); }
    createPackingTemplate(name, userId) { return svc.createPackingTemplate(name, userId); }
    updatePackingTemplate(id, body) { return svc.updatePackingTemplate(id, body); }
    deletePackingTemplate(id) { return svc.deletePackingTemplate(id); }
    createTemplateCategory(templateId, name) { return svc.createTemplateCategory(templateId, name); }
    updateTemplateCategory(templateId, catId, body) { return svc.updateTemplateCategory(templateId, catId, body); }
    deleteTemplateCategory(templateId, catId) { return svc.deleteTemplateCategory(templateId, catId); }
    createTemplateItem(templateId, catId, name) { return svc.createTemplateItem(templateId, catId, name); }
    updateTemplateItem(itemId, body) { return svc.updateTemplateItem(itemId, body); }
    deleteTemplateItem(itemId) { return svc.deleteTemplateItem(itemId); }
    // Addons + tokens + sessions
    listAddons() { return svc.listAddons(); }
    updateAddon(id, body) { return svc.updateAddon(id, body); }
    listMcpTokens() { return svc.listMcpTokens(); }
    deleteMcpToken(id) { return svc.deleteMcpToken(id); }
    listOAuthSessions() { return svc.listOAuthSessions(); }
    revokeOAuthSession(id) { return svc.revokeOAuthSession(id); }
    rotateJwtSecret() { return svc.rotateJwtSecret(); }
    invalidateMcpSessions() { (0, mcp_1.invalidateMcpSessions)(); }
    // Settings + notification preference helpers (non-admin-service modules)
    getAdminUserDefaults() { return (0, settingsService_1.getAdminUserDefaults)(); }
    setAdminUserDefaults(body) { return (0, settingsService_1.setAdminUserDefaults)(body); }
    getPreferencesMatrix(userId, role) { return (0, notificationPreferencesService_1.getPreferencesMatrix)(userId, role, 'admin'); }
    setAdminPreferences(userId, body) { return (0, notificationPreferencesService_1.setAdminPreferences)(userId, body); }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)()
], AdminService);
