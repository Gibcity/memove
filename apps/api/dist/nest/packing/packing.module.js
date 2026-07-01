"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackingModule = void 0;
const common_1 = require("@nestjs/common");
const packing_controller_1 = require("./packing.controller");
const packing_service_1 = require("./packing.service");
/** Packing domain (S2 — Phase 2 trip sub-domain). Registered in AppModule. */
let PackingModule = class PackingModule {
};
exports.PackingModule = PackingModule;
exports.PackingModule = PackingModule = __decorate([
    (0, common_1.Module)({
        controllers: [packing_controller_1.PackingController],
        providers: [packing_service_1.PackingService],
    })
], PackingModule);
