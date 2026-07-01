"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddonsService = void 0;
const common_1 = require("@nestjs/common");
const database_1 = require("../../db/database");
const adminService_1 = require("../../services/adminService");
const helpersService_1 = require("../../services/memories/helpersService");
/**
 * Thin wrapper around the enabled-addons + photo-provider read that the legacy
 * inline `GET /api/addons` handler performed (server/src/app.ts). The SQL,
 * ordering, boolean coercions and the merged photo-provider entries are
 * reproduced 1:1 so the body is byte-identical for the client.
 */
let AddonsService = class AddonsService {
    list() {
        const addons = database_1.db
            .prepare('SELECT id, name, type, icon, enabled FROM addons WHERE enabled = 1 ORDER BY sort_order')
            .all();
        const providers = database_1.db
            .prepare(`SELECT id, name, icon, enabled, sort_order
         FROM photo_providers
         WHERE enabled = 1
         ORDER BY sort_order, id`)
            .all();
        const fields = database_1.db
            .prepare(`SELECT provider_id, field_key, label, input_type, placeholder, hint, required, secret, settings_key, payload_key, sort_order
         FROM photo_provider_fields
         ORDER BY sort_order, id`)
            .all();
        const fieldsByProvider = new Map();
        for (const field of fields) {
            const arr = fieldsByProvider.get(field.provider_id) || [];
            arr.push(field);
            fieldsByProvider.set(field.provider_id, arr);
        }
        return {
            collabFeatures: (0, adminService_1.getCollabFeatures)(),
            bagTracking: (0, adminService_1.getBagTracking)().enabled,
            addons: [
                ...addons.map((a) => ({ ...a, enabled: !!a.enabled })),
                ...providers.map((p) => ({
                    id: p.id,
                    name: p.name,
                    type: 'photo_provider',
                    icon: p.icon,
                    enabled: !!p.enabled,
                    config: (0, helpersService_1.getPhotoProviderConfig)(p.id),
                    fields: (fieldsByProvider.get(p.id) || []).map((f) => ({
                        key: f.field_key,
                        label: f.label,
                        input_type: f.input_type,
                        placeholder: f.placeholder || '',
                        hint: f.hint || null,
                        required: !!f.required,
                        secret: !!f.secret,
                        settings_key: f.settings_key || null,
                        payload_key: f.payload_key || null,
                        sort_order: f.sort_order,
                    })),
                })),
            ],
        };
    }
};
exports.AddonsService = AddonsService;
exports.AddonsService = AddonsService = __decorate([
    (0, common_1.Injectable)()
], AddonsService);
