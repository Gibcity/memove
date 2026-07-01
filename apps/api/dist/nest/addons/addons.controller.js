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
exports.AddonsController = void 0;
const common_1 = require("@nestjs/common");
const addons_service_1 = require("./addons.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
/**
 * GET /api/addons — the enabled trip add-ons + photo providers feed.
 * Byte-identical to the legacy inline handler in server/src/app.ts
 * (authenticate-gated, returns { collabFeatures, addons: [...] }).
 *
 * Distinct from the addon sub-mounts /api/addons/atlas and /api/addons/vacay
 * (their own Nest modules); the strangler routes only the EXACT /api/addons here.
 */
let AddonsController = class AddonsController {
    addons;
    constructor(addons) {
        this.addons = addons;
    }
    list() {
        return this.addons.list();
    }
};
exports.AddonsController = AddonsController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AddonsController.prototype, "list", null);
exports.AddonsController = AddonsController = __decorate([
    (0, common_1.Controller)('api/addons'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [addons_service_1.AddonsService])
], AddonsController);
