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
exports.NotificationsController = void 0;
const common_1 = require("@nestjs/common");
const notifications_service_1 = require("./notifications.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
// The masked placeholder the client sends instead of a stored secret (8× U+2022).
const MASKED = '••••••••';
/**
 * /api/notifications — channel-preference matrix, channel test pings, and in-app
 * notifications.
 *
 * Byte-identical to the legacy Express route (server/src/routes/notifications.ts):
 * same auth, the same inline admin gate on /test-smtp (note: it returns
 * { error: 'Admin only' }, NOT the AdminGuard's wording), the same webhook/ntfy
 * fallback resolution, the same id parsing + 400/404 bodies, and the same status
 * codes. POSTs that answer with res.json stay 200 (Nest would default to 201).
 * The static /in-app/read-all and /in-app/all routes are declared before the
 * /in-app/:id routes so they win over the param, matching the legacy order.
 */
let NotificationsController = class NotificationsController {
    notifications;
    constructor(notifications) {
        this.notifications = notifications;
    }
    getPreferences(user) {
        return this.notifications.getPreferences(user.id, user.role);
    }
    setPreferences(user, body) {
        this.notifications.setPreferences(user.id, body);
        return this.notifications.getPreferences(user.id, user.role);
    }
    async testSmtp(user, email) {
        if (user.role !== 'admin') {
            throw new common_1.HttpException({ error: 'Admin only' }, 403);
        }
        return this.notifications.testSmtp(email || user.email);
    }
    async testWebhook(user, urlInput) {
        let url = urlInput;
        if (!url || url === MASKED) {
            url = this.notifications.userWebhookUrl(user.id);
            if (!url && user.role === 'admin')
                url = this.notifications.adminWebhookUrl();
            if (!url) {
                throw new common_1.HttpException({ error: 'No webhook URL configured' }, 400);
            }
        }
        if (typeof url !== 'string') {
            throw new common_1.HttpException({ error: 'url must be a string' }, 400);
        }
        try {
            new URL(url);
        }
        catch {
            throw new common_1.HttpException({ error: 'Invalid URL' }, 400);
        }
        return this.notifications.testWebhook(url);
    }
    async testNtfy(user, topic, server, token) {
        const userCfg = this.notifications.userNtfyConfig(user.id);
        const adminCfg = this.notifications.adminNtfyConfig();
        const resolvedTopic = topic || userCfg?.topic || undefined;
        const resolvedServer = server || userCfg?.server || adminCfg.server || undefined;
        // Reuse the saved token when the request sends null, empty, or the masked placeholder.
        const resolvedToken = (token && token !== MASKED)
            ? token
            : (userCfg?.token ?? adminCfg.token ?? null);
        if (!resolvedTopic) {
            throw new common_1.HttpException({ error: 'No ntfy topic configured' }, 400);
        }
        return this.notifications.testNtfy({ topic: resolvedTopic, server: resolvedServer ?? null, token: resolvedToken });
    }
    listInApp(user, limit, offset, unreadOnly) {
        return this.notifications.listInApp(user.id, {
            limit: Math.min(parseInt(limit) || 20, 50),
            offset: parseInt(offset) || 0,
            unreadOnly: unreadOnly === 'true',
        });
    }
    unreadCount(user) {
        return { count: this.notifications.unreadCount(user.id) };
    }
    readAll(user) {
        return { success: true, count: this.notifications.markAllRead(user.id) };
    }
    deleteAll(user) {
        return { success: true, count: this.notifications.deleteAll(user.id) };
    }
    markRead(user, idParam) {
        const id = this.parseId(idParam);
        if (!this.notifications.markRead(id, user.id)) {
            throw new common_1.HttpException({ error: 'Not found' }, 404);
        }
        return { success: true };
    }
    markUnread(user, idParam) {
        const id = this.parseId(idParam);
        if (!this.notifications.markUnread(id, user.id)) {
            throw new common_1.HttpException({ error: 'Not found' }, 404);
        }
        return { success: true };
    }
    deleteOne(user, idParam) {
        const id = this.parseId(idParam);
        if (!this.notifications.deleteOne(id, user.id)) {
            throw new common_1.HttpException({ error: 'Not found' }, 404);
        }
        return { success: true };
    }
    async respond(user, idParam, response) {
        const id = this.parseId(idParam);
        if (response !== 'positive' && response !== 'negative') {
            throw new common_1.HttpException({ error: 'response must be "positive" or "negative"' }, 400);
        }
        const result = await this.notifications.respond(id, user.id, response);
        if (!result.success) {
            throw new common_1.HttpException({ error: result.error }, 400);
        }
        return { success: true, notification: result.notification };
    }
    /** parseInt + the legacy "Invalid id" 400 guard, shared by the /:id handlers. */
    parseId(idParam) {
        const id = parseInt(idParam);
        if (isNaN(id)) {
            throw new common_1.HttpException({ error: 'Invalid id' }, 400);
        }
        return id;
    }
};
exports.NotificationsController = NotificationsController;
__decorate([
    (0, common_1.Get)('preferences'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "getPreferences", null);
__decorate([
    (0, common_1.Put)('preferences'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "setPreferences", null);
__decorate([
    (0, common_1.Post)('test-smtp'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)('email')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "testSmtp", null);
__decorate([
    (0, common_1.Post)('test-webhook'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)('url')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "testWebhook", null);
__decorate([
    (0, common_1.Post)('test-ntfy'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)('topic')),
    __param(2, (0, common_1.Body)('server')),
    __param(3, (0, common_1.Body)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "testNtfy", null);
__decorate([
    (0, common_1.Get)('in-app'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('limit')),
    __param(2, (0, common_1.Query)('offset')),
    __param(3, (0, common_1.Query)('unread_only')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], NotificationsController.prototype, "listInApp", null);
__decorate([
    (0, common_1.Get)('in-app/unread-count'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], NotificationsController.prototype, "unreadCount", null);
__decorate([
    (0, common_1.Put)('in-app/read-all'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], NotificationsController.prototype, "readAll", null);
__decorate([
    (0, common_1.Delete)('in-app/all'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], NotificationsController.prototype, "deleteAll", null);
__decorate([
    (0, common_1.Put)('in-app/:id/read'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Object)
], NotificationsController.prototype, "markRead", null);
__decorate([
    (0, common_1.Put)('in-app/:id/unread'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Object)
], NotificationsController.prototype, "markUnread", null);
__decorate([
    (0, common_1.Delete)('in-app/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Object)
], NotificationsController.prototype, "deleteOne", null);
__decorate([
    (0, common_1.Post)('in-app/:id/respond'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)('response')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], NotificationsController.prototype, "respond", null);
exports.NotificationsController = NotificationsController = __decorate([
    (0, common_1.Controller)('api/notifications'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [notifications_service_1.NotificationsService])
], NotificationsController);
