"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const notifications_1 = require("../../services/notifications");
const inAppNotifications_1 = require("../../services/inAppNotifications");
const notificationPreferencesService_1 = require("../../services/notificationPreferencesService");
/**
 * Thin Nest wrapper around the existing notification services. Channel delivery
 * (including the WebSocket push in inAppNotifications) and the preference
 * persistence all stay in the upstream services, so behaviour — including
 * real-time delivery — is unchanged. The webhook/ntfy fallback resolution that
 * the legacy route does inline is exposed here as small accessors so the
 * controller can reproduce it exactly.
 */
let NotificationsService = class NotificationsService {
    getPreferences(userId, role) {
        return (0, notificationPreferencesService_1.getPreferencesMatrix)(userId, role, 'user');
    }
    setPreferences(userId, body) {
        (0, notificationPreferencesService_1.setPreferences)(userId, body);
    }
    testSmtp(to) {
        return (0, notifications_1.testSmtp)(to);
    }
    testWebhook(url) {
        return (0, notifications_1.testWebhook)(url);
    }
    testNtfy(cfg) {
        return (0, notifications_1.testNtfy)(cfg);
    }
    userWebhookUrl(userId) {
        return (0, notifications_1.getUserWebhookUrl)(userId);
    }
    adminWebhookUrl() {
        return (0, notifications_1.getAdminWebhookUrl)();
    }
    userNtfyConfig(userId) {
        return (0, notifications_1.getUserNtfyConfig)(userId);
    }
    adminNtfyConfig() {
        return (0, notifications_1.getAdminNtfyConfig)();
    }
    // Returns the native service shape (NotificationRow[] is a superset of the
    // client-facing InAppListResult contract); the controller surfaces it as-is.
    listInApp(userId, options) {
        return (0, inAppNotifications_1.getNotifications)(userId, options);
    }
    unreadCount(userId) {
        return (0, inAppNotifications_1.getUnreadCount)(userId);
    }
    markRead(id, userId) {
        return (0, inAppNotifications_1.markRead)(id, userId);
    }
    markUnread(id, userId) {
        return (0, inAppNotifications_1.markUnread)(id, userId);
    }
    markAllRead(userId) {
        return (0, inAppNotifications_1.markAllRead)(userId);
    }
    deleteOne(id, userId) {
        return (0, inAppNotifications_1.deleteNotification)(id, userId);
    }
    deleteAll(userId) {
        return (0, inAppNotifications_1.deleteAll)(userId);
    }
    respond(id, userId, response) {
        return (0, inAppNotifications_1.respondToBoolean)(id, userId, response);
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)()
], NotificationsService);
