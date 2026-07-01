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
exports.HousingController = void 0;
const common_1 = require("@nestjs/common");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const housing_service_1 = require("./housing.service");
let HousingController = class HousingController {
    housing;
    constructor(housing) {
        this.housing = housing;
    }
    market(id) {
        return this.housing.getRentalMarket(id);
    }
    listings(id) {
        return this.housing.getListingLinks(id);
    }
    affordability(id, budget) {
        return this.housing.getAffordability(id, budget ? Number(budget) : undefined);
    }
};
exports.HousingController = HousingController;
__decorate([
    (0, common_1.Get)('market/:locationId'),
    __param(0, (0, common_1.Param)('locationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Object)
], HousingController.prototype, "market", null);
__decorate([
    (0, common_1.Get)('listings/:locationId'),
    __param(0, (0, common_1.Param)('locationId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Array)
], HousingController.prototype, "listings", null);
__decorate([
    (0, common_1.Get)('affordability/:locationId'),
    __param(0, (0, common_1.Param)('locationId')),
    __param(1, (0, common_1.Query)('budget')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Object)
], HousingController.prototype, "affordability", null);
exports.HousingController = HousingController = __decorate([
    (0, common_1.Controller)('api/relocation/housing'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [housing_service_1.HousingService])
], HousingController);
