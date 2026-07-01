"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoriesModule = void 0;
const common_1 = require("@nestjs/common");
const memories_service_1 = require("./memories.service");
const unified_controller_1 = require("./unified.controller");
const immich_controller_1 = require("./immich.controller");
const synology_controller_1 = require("./synology.controller");
/**
 * Memories (photo-providers) domain — mounted at /api/integrations/memories.
 *
 * Ports the legacy Express router (routes/memories/unified.ts, which composes
 * immich.ts + synology.ts) to Nest, reusing services/memories/* unchanged. No
 * module-level addon gate — enablement is per-provider-row inside the services,
 * exactly as the legacy mount had it.
 */
let MemoriesModule = class MemoriesModule {
};
exports.MemoriesModule = MemoriesModule;
exports.MemoriesModule = MemoriesModule = __decorate([
    (0, common_1.Module)({
        controllers: [unified_controller_1.UnifiedMemoriesController, immich_controller_1.ImmichMemoriesController, synology_controller_1.SynologyMemoriesController],
        providers: [memories_service_1.MemoriesService],
    })
], MemoriesModule);
