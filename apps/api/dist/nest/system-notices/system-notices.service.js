"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemNoticesService = void 0;
const common_1 = require("@nestjs/common");
const service_1 = require("../../system-notices/service");
/**
 * Thin Nest wrapper around the existing system-notices service. The condition
 * evaluation, version gating, sorting and dismissal persistence all stay in the
 * upstream service — this only adapts it for DI, so behaviour is unchanged.
 */
let SystemNoticesService = class SystemNoticesService {
    getActiveFor(userId) {
        return (0, service_1.getActiveNoticesFor)(userId);
    }
    dismiss(userId, noticeId) {
        return (0, service_1.dismissNotice)(userId, noticeId);
    }
};
exports.SystemNoticesService = SystemNoticesService;
exports.SystemNoticesService = SystemNoticesService = __decorate([
    (0, common_1.Injectable)()
], SystemNoticesService);
