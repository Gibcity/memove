"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingImportModule = void 0;
const common_1 = require("@nestjs/common");
const booking_import_controller_1 = require("./booking-import.controller");
const booking_import_service_1 = require("./booking-import.service");
const kitinerary_extractor_service_1 = require("./kitinerary-extractor.service");
const features_controller_1 = require("./features.controller");
let BookingImportModule = class BookingImportModule {
};
exports.BookingImportModule = BookingImportModule;
exports.BookingImportModule = BookingImportModule = __decorate([
    (0, common_1.Module)({
        controllers: [booking_import_controller_1.BookingImportController, features_controller_1.FeaturesController],
        providers: [booking_import_service_1.BookingImportService, kitinerary_extractor_service_1.KitineraryExtractorService],
    })
], BookingImportModule);
