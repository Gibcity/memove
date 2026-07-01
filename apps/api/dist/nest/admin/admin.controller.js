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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const admin_service_1 = require("./admin.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const admin_guard_1 = require("../auth/admin.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const auditLog_1 = require("../../services/auditLog");
const notificationService_1 = require("../../services/notificationService");
/** Throw the legacy {error,status} envelope when a service call reports failure. */
function ok(result) {
    if (result && typeof result === 'object' && 'error' in result) {
        const r = result;
        throw new common_1.HttpException({ error: r.error }, r.status ?? 400);
    }
    return result;
}
/**
 * /api/admin — admin-only control surface (users, stats, permissions, audit log,
 * OIDC settings, invites, feature toggles, packing templates, addons, MCP/OAuth
 * sessions, JWT rotation, default user settings).
 *
 * Byte-identical to the legacy Express route (server/src/routes/admin.ts):
 * admin-gated, the {error,status} envelopes, the audit-log writes, the MCP
 * session invalidation on addon/collab changes, create-201 vs the rest 200, and
 * the dev-only test-notification endpoint (404 outside development).
 */
let AdminController = class AdminController {
    admin;
    constructor(admin) {
        this.admin = admin;
    }
    // ── Users ──
    listUsers() { return { users: this.admin.listUsers() }; }
    createUser(user, body, req) {
        const result = ok(this.admin.createUser(body));
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.user_create', resource: String(result.insertedId), ip: (0, auditLog_1.getClientIp)(req), details: result.auditDetails });
        return { user: result.user };
    }
    updateUser(user, id, body, req) {
        const result = ok(this.admin.updateUser(id, body));
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.user_update', resource: String(id), ip: (0, auditLog_1.getClientIp)(req), details: { targetUser: result.previousEmail, fields: result.changed } });
        (0, auditLog_1.logInfo)(`Admin ${user.email} edited user ${result.previousEmail} (fields: ${result.changed.join(', ')})`);
        return { user: result.user };
    }
    deleteUser(user, id, req) {
        const result = ok(this.admin.deleteUser(id, user.id));
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.user_delete', resource: String(id), ip: (0, auditLog_1.getClientIp)(req), details: { targetUser: result.email } });
        (0, auditLog_1.logInfo)(`Admin ${user.email} deleted user ${result.email}`);
        return { success: true };
    }
    resetUserPasskeys(user, id, req) {
        const result = ok(this.admin.resetUserPasskeys(id));
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.user_passkeys_reset', resource: String(id), ip: (0, auditLog_1.getClientIp)(req), details: { targetUser: result.email, deleted: result.deleted } });
        return { success: true, deleted: result.deleted };
    }
    // ── Stats / permissions / audit ──
    stats() { return this.admin.getStats(); }
    permissions() { return this.admin.getPermissions(); }
    savePermissions(user, body, req) {
        if (!body.permissions || typeof body.permissions !== 'object') {
            throw new common_1.HttpException({ error: 'permissions object required' }, 400);
        }
        const result = this.admin.savePermissions(body.permissions);
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.permissions_update', resource: 'permissions', ip: (0, auditLog_1.getClientIp)(req), details: body.permissions });
        return { success: true, permissions: result.permissions, ...(result.skipped.length ? { skipped: result.skipped } : {}) };
    }
    auditLog(query) { return this.admin.getAuditLog(query); }
    // ── OIDC ──
    getOidc() { return this.admin.getOidcSettings(); }
    updateOidc(user, body, req) {
        const result = this.admin.updateOidcSettings(body);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status || 400);
        }
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.oidc_update', ip: (0, auditLog_1.getClientIp)(req), details: { issuer_set: !!body.issuer } });
        return { success: true };
    }
    saveDemoBaseline(user, req) {
        const result = this.admin.saveDemoBaseline();
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.demo_baseline_save', ip: (0, auditLog_1.getClientIp)(req) });
        return { success: true, message: result.message };
    }
    // ── GitHub / version ──
    async githubReleases(perPage = '10', page = '1') {
        return this.admin.getGithubReleases(String(perPage), String(page));
    }
    async versionCheck() { return this.admin.checkVersion(); }
    // ── Admin notification preferences ──
    getNotificationPrefs(user) { return this.admin.getPreferencesMatrix(user.id, user.role); }
    setNotificationPrefs(user, body) {
        this.admin.setAdminPreferences(user.id, body);
        return this.admin.getPreferencesMatrix(user.id, user.role);
    }
    // ── Invites ──
    listInvites() { return { invites: this.admin.listInvites() }; }
    createInvite(user, body, req) {
        const result = this.admin.createInvite(user.id, body);
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.invite_create', resource: String(result.inviteId), ip: (0, auditLog_1.getClientIp)(req), details: { max_uses: result.uses, expires_in_days: result.expiresInDays } });
        return { invite: result.invite };
    }
    deleteInvite(user, id, req) {
        ok(this.admin.deleteInvite(id));
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.invite_delete', resource: String(id), ip: (0, auditLog_1.getClientIp)(req) });
        return { success: true };
    }
    // ── Feature toggles ──
    getBagTracking() { return this.admin.getBagTracking(); }
    updateBagTracking(user, body, req) {
        const result = this.admin.updateBagTracking(body.enabled);
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.bag_tracking', ip: (0, auditLog_1.getClientIp)(req), details: { enabled: result.enabled } });
        return result;
    }
    getPlacesPhotos() { return this.admin.getPlacesPhotos(); }
    updatePlacesPhotos(user, body, req) {
        if (typeof body.enabled !== 'boolean')
            throw new common_1.HttpException({ error: 'enabled must be a boolean' }, 400);
        const result = this.admin.updatePlacesPhotos(body.enabled);
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.places_photos', ip: (0, auditLog_1.getClientIp)(req), details: { enabled: result.enabled } });
        return result;
    }
    getPlacesAutocomplete() { return this.admin.getPlacesAutocomplete(); }
    updatePlacesAutocomplete(user, body, req) {
        if (typeof body.enabled !== 'boolean')
            throw new common_1.HttpException({ error: 'enabled must be a boolean' }, 400);
        const result = this.admin.updatePlacesAutocomplete(body.enabled);
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.places_autocomplete', ip: (0, auditLog_1.getClientIp)(req), details: { enabled: result.enabled } });
        return result;
    }
    getPlacesDetails() { return this.admin.getPlacesDetails(); }
    updatePlacesDetails(user, body, req) {
        if (typeof body.enabled !== 'boolean')
            throw new common_1.HttpException({ error: 'enabled must be a boolean' }, 400);
        const result = this.admin.updatePlacesDetails(body.enabled);
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.places_details', ip: (0, auditLog_1.getClientIp)(req), details: { enabled: result.enabled } });
        return result;
    }
    getCollabFeatures() { return this.admin.getCollabFeatures(); }
    updateCollabFeatures(user, body, req) {
        const result = this.admin.updateCollabFeatures(body);
        this.admin.invalidateMcpSessions();
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.collab_features', ip: (0, auditLog_1.getClientIp)(req), details: result });
        return result;
    }
    // ── Packing templates ──
    listPackingTemplates() { return { templates: this.admin.listPackingTemplates() }; }
    getPackingTemplate(id) { return ok(this.admin.getPackingTemplate(id)); }
    createPackingTemplate(user, body) {
        return ok(this.admin.createPackingTemplate(body.name, user.id));
    }
    updatePackingTemplate(id, body) { return ok(this.admin.updatePackingTemplate(id, body)); }
    deletePackingTemplate(user, id, req) {
        const result = ok(this.admin.deletePackingTemplate(id));
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.packing_template_delete', resource: String(id), ip: (0, auditLog_1.getClientIp)(req), details: { name: result.name } });
        return { success: true };
    }
    createTemplateCategory(id, body) {
        return ok(this.admin.createTemplateCategory(id, body.name));
    }
    updateTemplateCategory(templateId, catId, body) {
        return ok(this.admin.updateTemplateCategory(templateId, catId, body));
    }
    deleteTemplateCategory(templateId, catId) {
        ok(this.admin.deleteTemplateCategory(templateId, catId));
        return { success: true };
    }
    createTemplateItem(templateId, catId, body) {
        return ok(this.admin.createTemplateItem(templateId, catId, body.name));
    }
    updateTemplateItem(itemId, body) { return ok(this.admin.updateTemplateItem(itemId, body)); }
    deleteTemplateItem(itemId) {
        ok(this.admin.deleteTemplateItem(itemId));
        return { success: true };
    }
    // ── Addons ──
    listAddons() { return { addons: this.admin.listAddons() }; }
    updateAddon(user, id, body, req) {
        const result = ok(this.admin.updateAddon(id, body));
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.addon_update', resource: String(id), ip: (0, auditLog_1.getClientIp)(req), details: result.auditDetails });
        this.admin.invalidateMcpSessions();
        return { addon: result.addon };
    }
    // ── MCP tokens / OAuth sessions ──
    listMcpTokens() { return { tokens: this.admin.listMcpTokens() }; }
    deleteMcpToken(id) {
        ok(this.admin.deleteMcpToken(id));
        return { success: true };
    }
    listOAuthSessions() { return { sessions: this.admin.listOAuthSessions() }; }
    revokeOAuthSession(user, id, req) {
        ok(this.admin.revokeOAuthSession(id));
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.oauth_session.revoke', resource: String(id), ip: (0, auditLog_1.getClientIp)(req) });
        return { success: true };
    }
    // ── JWT rotation ──
    rotateJwtSecret(user, req) {
        const result = this.admin.rotateJwtSecret();
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.rotate_jwt_secret', ip: (0, auditLog_1.getClientIp)(req) });
        return { success: true };
    }
    // ── Default user settings ──
    getDefaultUserSettings() { return this.admin.getAdminUserDefaults(); }
    setDefaultUserSettings(user, body, req) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw new common_1.HttpException({ error: 'Object body required' }, 400);
        }
        try {
            this.admin.setAdminUserDefaults(body);
            (0, auditLog_1.writeAudit)({ userId: user.id, action: 'admin.default_user_settings_update', ip: (0, auditLog_1.getClientIp)(req), details: body });
            return this.admin.getAdminUserDefaults();
        }
        catch (err) {
            throw new common_1.HttpException({ error: err instanceof Error ? err.message : String(err) }, 400);
        }
    }
    // ── Dev-only: test notification (404 outside development, mirroring the conditional mount) ──
    async devTestNotification(user, body) {
        if (process.env.NODE_ENV?.toLowerCase() !== 'development') {
            throw new common_1.NotFoundException();
        }
        try {
            await (0, notificationService_1.send)({
                event: body.event ?? 'trip_reminder',
                actorId: user.id,
                scope: body.scope ?? 'user',
                targetId: body.targetId ?? user.id,
                params: { actor: user.email, ...(body.params ?? {}) },
                inApp: body.inApp,
            });
            return { success: true };
        }
        catch (err) {
            throw new common_1.HttpException({ error: err instanceof Error ? err.message : String(err) }, 400);
        }
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('users'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listUsers", null);
__decorate([
    (0, common_1.Post)('users'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createUser", null);
__decorate([
    (0, common_1.Put)('users/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateUser", null);
__decorate([
    (0, common_1.Delete)('users/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteUser", null);
__decorate([
    (0, common_1.Delete)('users/:id/passkeys'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "resetUserPasskeys", null);
__decorate([
    (0, common_1.Get)('stats'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "stats", null);
__decorate([
    (0, common_1.Get)('permissions'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "permissions", null);
__decorate([
    (0, common_1.Put)('permissions'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "savePermissions", null);
__decorate([
    (0, common_1.Get)('audit-log'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "auditLog", null);
__decorate([
    (0, common_1.Get)('oidc'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getOidc", null);
__decorate([
    (0, common_1.Put)('oidc'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateOidc", null);
__decorate([
    (0, common_1.Post)('save-demo-baseline'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "saveDemoBaseline", null);
__decorate([
    (0, common_1.Get)('github-releases'),
    __param(0, (0, common_1.Query)('per_page')),
    __param(1, (0, common_1.Query)('page')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "githubReleases", null);
__decorate([
    (0, common_1.Get)('version-check'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "versionCheck", null);
__decorate([
    (0, common_1.Get)('notification-preferences'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getNotificationPrefs", null);
__decorate([
    (0, common_1.Put)('notification-preferences'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "setNotificationPrefs", null);
__decorate([
    (0, common_1.Get)('invites'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listInvites", null);
__decorate([
    (0, common_1.Post)('invites'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createInvite", null);
__decorate([
    (0, common_1.Delete)('invites/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteInvite", null);
__decorate([
    (0, common_1.Get)('bag-tracking'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getBagTracking", null);
__decorate([
    (0, common_1.Put)('bag-tracking'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateBagTracking", null);
__decorate([
    (0, common_1.Get)('places-photos'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getPlacesPhotos", null);
__decorate([
    (0, common_1.Put)('places-photos'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updatePlacesPhotos", null);
__decorate([
    (0, common_1.Get)('places-autocomplete'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getPlacesAutocomplete", null);
__decorate([
    (0, common_1.Put)('places-autocomplete'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updatePlacesAutocomplete", null);
__decorate([
    (0, common_1.Get)('places-details'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getPlacesDetails", null);
__decorate([
    (0, common_1.Put)('places-details'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updatePlacesDetails", null);
__decorate([
    (0, common_1.Get)('collab-features'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getCollabFeatures", null);
__decorate([
    (0, common_1.Put)('collab-features'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateCollabFeatures", null);
__decorate([
    (0, common_1.Get)('packing-templates'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listPackingTemplates", null);
__decorate([
    (0, common_1.Get)('packing-templates/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getPackingTemplate", null);
__decorate([
    (0, common_1.Post)('packing-templates'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createPackingTemplate", null);
__decorate([
    (0, common_1.Put)('packing-templates/:id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updatePackingTemplate", null);
__decorate([
    (0, common_1.Delete)('packing-templates/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deletePackingTemplate", null);
__decorate([
    (0, common_1.Post)('packing-templates/:id/categories'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createTemplateCategory", null);
__decorate([
    (0, common_1.Put)('packing-templates/:templateId/categories/:catId'),
    __param(0, (0, common_1.Param)('templateId')),
    __param(1, (0, common_1.Param)('catId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateTemplateCategory", null);
__decorate([
    (0, common_1.Delete)('packing-templates/:templateId/categories/:catId'),
    __param(0, (0, common_1.Param)('templateId')),
    __param(1, (0, common_1.Param)('catId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteTemplateCategory", null);
__decorate([
    (0, common_1.Post)('packing-templates/:templateId/categories/:catId/items'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, common_1.Param)('templateId')),
    __param(1, (0, common_1.Param)('catId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "createTemplateItem", null);
__decorate([
    (0, common_1.Put)('packing-templates/:templateId/items/:itemId'),
    __param(0, (0, common_1.Param)('itemId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateTemplateItem", null);
__decorate([
    (0, common_1.Delete)('packing-templates/:templateId/items/:itemId'),
    __param(0, (0, common_1.Param)('itemId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteTemplateItem", null);
__decorate([
    (0, common_1.Get)('addons'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listAddons", null);
__decorate([
    (0, common_1.Put)('addons/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateAddon", null);
__decorate([
    (0, common_1.Get)('mcp-tokens'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listMcpTokens", null);
__decorate([
    (0, common_1.Delete)('mcp-tokens/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteMcpToken", null);
__decorate([
    (0, common_1.Get)('oauth-sessions'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "listOAuthSessions", null);
__decorate([
    (0, common_1.Delete)('oauth-sessions/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "revokeOAuthSession", null);
__decorate([
    (0, common_1.Post)('rotate-jwt-secret'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "rotateJwtSecret", null);
__decorate([
    (0, common_1.Get)('default-user-settings'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "getDefaultUserSettings", null);
__decorate([
    (0, common_1.Put)('default-user-settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "setDefaultUserSettings", null);
__decorate([
    (0, common_1.Post)('dev/test-notification'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "devTestNotification", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('api/admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminController);
