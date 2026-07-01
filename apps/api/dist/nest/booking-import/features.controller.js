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
exports.FeaturesController = void 0;
const common_1 = require("@nestjs/common");
const kitinerary_extractor_service_1 = require("./kitinerary-extractor.service");
/** Exposes server feature flags consumed by the frontend to show/hide optional UI. */
let FeaturesController = class FeaturesController {
    extractor;
    constructor(extractor) {
        this.extractor = extractor;
    }
    features() {
        return {
            bookingImport: this.extractor.isAvailable(),
        };
    }
};
exports.FeaturesController = FeaturesController;
__decorate([
    (0, common_1.Get)('features'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], FeaturesController.prototype, "features", null);
exports.FeaturesController = FeaturesController = __decorate([
    (0, common_1.Controller)('api/health'),
    __metadata("design:paramtypes", [kitinerary_extractor_service_1.KitineraryExtractorService])
], FeaturesController);
