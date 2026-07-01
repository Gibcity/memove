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
exports.SettingsController = void 0;
const common_1 = require("@nestjs/common");
const settings_service_1 = require("./settings.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const MASKED_VALUE = '••••••••';
/**
 * /api/settings — per-user key/value preferences.
 *
 * Byte-identical to the legacy Express route (server/src/routes/settings.ts):
 * get-all, single upsert (400 without a key, no-op on the masked sentinel), and
 * bulk upsert (400 without an object, 500 on a write error). All answer 200.
 */
let SettingsController = class SettingsController {
    settings;
    constructor(settings) {
        this.settings = settings;
    }
    list(user) {
        return { settings: this.settings.getUserSettings(user.id) };
    }
    upsert(user, body) {
        if (!body.key) {
            throw new common_1.HttpException({ error: 'Key is required' }, 400);
        }
        // The client echoes a redacted secret back unchanged — treat as a no-op.
        if (body.value === MASKED_VALUE) {
            return { success: true, key: body.key, unchanged: true };
        }
        this.settings.upsertSetting(user.id, body.key, body.value);
        return { success: true, key: body.key, value: body.value };
    }
    bulk(user, body) {
        if (!body.settings || typeof body.settings !== 'object') {
            throw new common_1.HttpException({ error: 'Settings object is required' }, 400);
        }
        try {
            const updated = this.settings.bulkUpsertSettings(user.id, body.settings);
            return { success: true, updated };
        }
        catch (err) {
            console.error('Error saving settings:', err);
            throw new common_1.HttpException({ error: 'Error saving settings' }, 500);
        }
    }
};
exports.SettingsController = SettingsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "list", null);
__decorate([
    (0, common_1.Put)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "upsert", null);
__decorate([
    (0, common_1.Post)('bulk'),
    (0, common_1.HttpCode)(200) // Express answers bulk with res.json (200), not the POST-default 201.
    ,
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], SettingsController.prototype, "bulk", null);
exports.SettingsController = SettingsController = __decorate([
    (0, common_1.Controller)('api/settings'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [settings_service_1.SettingsService])
], SettingsController);
