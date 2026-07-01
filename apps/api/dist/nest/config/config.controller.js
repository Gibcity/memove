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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("../../config");
/**
 * /api/config — public (unauthenticated) bootstrap config.
 *
 * Byte-identical to the legacy Express route (server/src/routes/publicConfig.ts):
 * no auth guard, returns the server's configured default language. Deliberately
 * has no service — it just surfaces a config constant, exactly like the original.
 */
let ConfigController = class ConfigController {
    getConfig() {
        return { defaultLanguage: config_1.DEFAULT_LANGUAGE };
    }
};
exports.ConfigController = ConfigController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Object)
], ConfigController.prototype, "getConfig", null);
exports.ConfigController = ConfigController = __decorate([
    (0, common_1.Controller)('api/config')
], ConfigController);
