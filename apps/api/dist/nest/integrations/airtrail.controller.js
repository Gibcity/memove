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
exports.AirtrailController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const zod_validation_pipe_1 = require("../common/zod-validation.pipe");
const airtrail_addon_guard_1 = require("./airtrail-addon.guard");
const auditLog_1 = require("../../services/auditLog");
const shared_1 = require("@memove/shared");
const airtrailService_1 = require("../../services/airtrail/airtrailService");
const airtrailSync_1 = require("../../services/airtrail/airtrailSync");
/**
 * /api/integrations/airtrail — per-user AirTrail connection (#214).
 *
 * `status` and `test` answer 200 even on failure (the service shapes
 * `{ connected: false, error }`); `settings` PUT validates with a 400. The API
 * key is never echoed — `getSettings` returns it masked. The route group is
 * gated on the `airtrail` addon (404 when disabled).
 */
let AirtrailController = class AirtrailController {
    getSettings(user) {
        return (0, airtrailService_1.getConnectionSettings)(user.id);
    }
    async putSettings(user, body, req) {
        const result = await (0, airtrailService_1.saveSettings)(user.id, body.url, body.apiKey, !!body.allowInsecureTls, !!body.writeEnabled, (0, auditLog_1.getClientIp)(req));
        if (!result.success) {
            throw new common_1.HttpException({ error: result.error }, 400);
        }
        return result.warning ? { success: true, warning: result.warning } : { success: true };
    }
    getStatus(user) {
        return (0, airtrailService_1.getConnectionStatus)(user.id);
    }
    async flights(user) {
        try {
            return { flights: await (0, airtrailService_1.getFlightsForPicker)(user.id) };
        }
        catch (err) {
            throw new common_1.HttpException({ error: err?.message || 'Could not load AirTrail flights' }, err?.status === 400 ? 400 : 502);
        }
    }
    /** Pull this user's AirTrail edits into their linked reservations on demand. */
    sync(user) {
        return (0, airtrailSync_1.runAirtrailSyncForUser)(user.id);
    }
    test(user, body) {
        return (0, airtrailService_1.testConnection)(user.id, body.url, body.apiKey, !!body.allowInsecureTls);
    }
};
exports.AirtrailController = AirtrailController;
__decorate([
    (0, common_1.Get)('settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AirtrailController.prototype, "getSettings", null);
__decorate([
    (0, common_1.Put)('settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(shared_1.airtrailSettingsSchema))),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AirtrailController.prototype, "putSettings", null);
__decorate([
    (0, common_1.Get)('status'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AirtrailController.prototype, "getStatus", null);
__decorate([
    (0, common_1.Get)('flights'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AirtrailController.prototype, "flights", null);
__decorate([
    (0, common_1.Post)('sync'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AirtrailController.prototype, "sync", null);
__decorate([
    (0, common_1.Post)('test'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(shared_1.airtrailSettingsSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AirtrailController.prototype, "test", null);
exports.AirtrailController = AirtrailController = __decorate([
    (0, common_1.Controller)('api/integrations/airtrail'),
    (0, common_1.UseGuards)(airtrail_addon_guard_1.AirtrailAddonGuard, jwt_auth_guard_1.JwtAuthGuard)
], AirtrailController);
