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
exports.SystemNoticesController = void 0;
const common_1 = require("@nestjs/common");
const system_notices_service_1 = require("./system-notices.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/**
 * /api/system-notices — active announcements for the current user + dismissal.
 *
 * Byte-identical to the legacy Express route (server/src/routes/systemNotices.ts):
 * both endpoints require auth, `/active` returns the evaluated DTO list, and
 * dismiss is idempotent — an unknown id 404s with `{ error: 'NOTICE_NOT_FOUND' }`
 * and a successful dismiss returns 204 with no body.
 */
let SystemNoticesController = class SystemNoticesController {
    notices;
    constructor(notices) {
        this.notices = notices;
    }
    active(user) {
        return this.notices.getActiveFor(user.id);
    }
    dismiss(user, id) {
        const dismissed = this.notices.dismiss(user.id, id);
        if (!dismissed) {
            throw new common_1.HttpException({ error: 'NOTICE_NOT_FOUND' }, 404);
        }
    }
};
exports.SystemNoticesController = SystemNoticesController;
__decorate([
    (0, common_1.Get)('active'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Array)
], SystemNoticesController.prototype, "active", null);
__decorate([
    (0, common_1.Post)(':id/dismiss'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], SystemNoticesController.prototype, "dismiss", null);
exports.SystemNoticesController = SystemNoticesController = __decorate([
    (0, common_1.Controller)('api/system-notices'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [system_notices_service_1.SystemNoticesService])
], SystemNoticesController);
