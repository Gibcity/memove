"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirtrailAddonGuard = void 0;
const common_1 = require("@nestjs/common");
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
/**
 * Gates the AirTrail integration routes on the global `airtrail` addon. When the
 * admin has it disabled the whole group answers 404. Declared before the
 * JwtAuthGuard so the addon check wins over the 401 (same ordering as the
 * Journey addon gate).
 */
let AirtrailAddonGuard = class AirtrailAddonGuard {
    canActivate() {
        if (!(0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.AIRTRAIL)) {
            throw new common_1.HttpException({ error: 'AirTrail addon is not enabled' }, 404);
        }
        return true;
    }
};
exports.AirtrailAddonGuard = AirtrailAddonGuard;
exports.AirtrailAddonGuard = AirtrailAddonGuard = __decorate([
    (0, common_1.Injectable)()
], AirtrailAddonGuard);
