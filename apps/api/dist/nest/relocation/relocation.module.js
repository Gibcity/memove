"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelocationModule = void 0;
const common_1 = require("@nestjs/common");
const relocation_controller_1 = require("./relocation.controller");
const relocation_service_1 = require("./relocation.service");
const relocation_journey_service_1 = require("./relocation-journey.service");
const housing_service_1 = require("./housing.service");
const housing_controller_1 = require("./housing.controller");
const career_service_1 = require("./career.service");
const concierge_service_1 = require("./concierge.service");
const relocation_chat_service_1 = require("./relocation-chat.service");
/** Relocation discovery module — registered in AppModule. */
let RelocationModule = class RelocationModule {
};
exports.RelocationModule = RelocationModule;
exports.RelocationModule = RelocationModule = __decorate([
    (0, common_1.Module)({
        controllers: [relocation_controller_1.RelocationController, housing_controller_1.HousingController],
        providers: [
            relocation_service_1.RelocationService,
            relocation_journey_service_1.RelocationJourneyService,
            housing_service_1.HousingService,
            career_service_1.CareerService,
            concierge_service_1.ConciergeService,
            relocation_chat_service_1.RelocationChatService,
        ],
        exports: [relocation_journey_service_1.RelocationJourneyService],
    })
], RelocationModule);
