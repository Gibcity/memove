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
exports.PlacesController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const places_service_1 = require("./places.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const STRING_LIMITS = { name: 200, description: 2000, address: 500, notes: 2000 };
const UPLOAD = { storage: (0, multer_1.memoryStorage)(), limits: { fileSize: 10 * 1024 * 1024 } };
function validateLengths(body) {
    for (const [field, max] of Object.entries(STRING_LIMITS)) {
        const value = body[field];
        if (value && typeof value === 'string' && value.length > max) {
            throw new common_1.HttpException({ error: `${field} must be ${max} characters or less` }, 400);
        }
    }
}
function parseBool(v, defaultVal) {
    return v === undefined || v === null ? defaultVal : String(v) === 'true';
}
/**
 * /api/trips/:tripId/places — the trip's place pool + importers.
 *
 * Byte-identical to the legacy Express route (server/src/routes/places.ts):
 * trip access (404) runs first, then the string-length guard (400), then the
 * 'place_edit' permission (403); create 201 / rest 200; the bespoke 400/404
 * bodies; the journey create/update/delete hooks; and WebSocket broadcasts with
 * the forwarded X-Socket-Id. The /import/* and /bulk-delete routes are declared
 * before /:id so the static segments win over the param.
 */
let PlacesController = class PlacesController {
    places;
    constructor(places) {
        this.places = places;
    }
    requireTrip(tripId, user) {
        const trip = this.places.verifyTripAccess(tripId, user.id);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        return trip;
    }
    requireEdit(trip, user) {
        if (!this.places.canEdit(trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
    }
    list(user, tripId, search, category, tag) {
        this.requireTrip(tripId, user);
        return { places: this.places.list(tripId, { search, category, tag }) };
    }
    create(user, tripId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        validateLengths(body);
        this.requireEdit(trip, user);
        if (!body.name) {
            throw new common_1.HttpException({ error: 'Place name is required' }, 400);
        }
        const place = this.places.create(tripId, body);
        this.places.broadcast(tripId, 'place:created', { place }, socketId);
        this.places.onCreated(tripId, place.id);
        return { place };
    }
    importGpx(user, tripId, file, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!file) {
            throw new common_1.HttpException({ error: 'No file uploaded' }, 400);
        }
        const importWaypoints = parseBool(body.importWaypoints, true);
        const importRoutes = parseBool(body.importRoutes, true);
        const importTracks = parseBool(body.importTracks, true);
        if (!importWaypoints && !importRoutes && !importTracks) {
            throw new common_1.HttpException({ error: 'No import types selected' }, 400);
        }
        const result = this.places.importGpx(tripId, file.buffer, { importWaypoints, importRoutes, importTracks, defaultName: file.originalname });
        if (!result) {
            throw new common_1.HttpException({ error: 'No matching places found in GPX file' }, 400);
        }
        for (const place of result.places) {
            this.places.broadcast(tripId, 'place:created', { place }, socketId);
        }
        return { places: result.places, count: result.count, skipped: result.skipped };
    }
    async importMap(user, tripId, file, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!file) {
            throw new common_1.HttpException({ error: 'No file uploaded' }, 400);
        }
        const importPoints = parseBool(body.importPoints, true);
        const importPaths = parseBool(body.importPaths, true);
        if (!importPoints && !importPaths) {
            throw new common_1.HttpException({ error: 'No import types selected' }, 400);
        }
        try {
            const result = await this.places.importMapFile(tripId, file.buffer, file.originalname, { importPoints, importPaths });
            if (result.summary?.totalPlacemarks === 0) {
                throw new common_1.HttpException({ error: 'No valid Placemarks found in map file', summary: result.summary }, 400);
            }
            for (const place of result.places) {
                this.places.broadcast(tripId, 'place:created', { place }, socketId);
            }
            return result;
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            const message = err instanceof Error ? err.message : 'Failed to import map file';
            throw new common_1.HttpException({ error: message }, 400);
        }
    }
    async importGoogle(user, tripId, url, enrich, socketId) {
        return this.importList('google', user, tripId, url, enrich, socketId);
    }
    async importNaver(user, tripId, url, enrich, socketId) {
        return this.importList('naver', user, tripId, url, enrich, socketId);
    }
    /** Shared google/naver list import — identical flow, different provider + error string. */
    async importList(provider, user, tripId, url, enrich, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!url || typeof url !== 'string') {
            throw new common_1.HttpException({ error: 'URL is required' }, 400);
        }
        // Opt-in: re-resolve each imported place via the Places API to fill in
        // photo / address / website / phone and persist a google_place_id (#886).
        const opts = { enrich: parseBool(enrich, false), userId: user.id };
        const label = provider === 'google' ? 'Google' : 'Naver';
        try {
            const result = provider === 'google'
                ? await this.places.importGoogleList(tripId, url, opts)
                : await this.places.importNaverList(tripId, url, opts);
            if ('error' in result) {
                throw new common_1.HttpException({ error: result.error }, result.status);
            }
            for (const place of result.places) {
                this.places.broadcast(tripId, 'place:created', { place }, socketId);
            }
            return { places: result.places, count: result.places.length, listName: result.listName, skipped: result.skipped };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            console.error(`[Places] ${label} list import error:`, err instanceof Error ? err.message : err);
            throw new common_1.HttpException({ error: `Failed to import ${label} Maps list. Make sure the list is shared publicly.` }, 400);
        }
    }
    bulkDelete(user, tripId, ids, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!Array.isArray(ids) || ids.some((v) => typeof v !== 'number')) {
            throw new common_1.HttpException({ error: 'ids must be an array of numbers' }, 400);
        }
        if (ids.length === 0) {
            return { deleted: [], count: 0 };
        }
        for (const id of ids)
            this.places.onDeleted(id);
        const deleted = this.places.removeMany(tripId, ids);
        for (const id of deleted) {
            this.places.broadcast(tripId, 'place:deleted', { placeId: id }, socketId);
        }
        return { deleted, count: deleted.length };
    }
    get(user, tripId, id) {
        this.requireTrip(tripId, user);
        const place = this.places.get(tripId, id);
        if (!place) {
            throw new common_1.HttpException({ error: 'Place not found' }, 404);
        }
        return { place };
    }
    async image(user, tripId, id) {
        this.requireTrip(tripId, user);
        try {
            const result = await this.places.searchImage(tripId, id, user.id);
            if ('error' in result) {
                throw new common_1.HttpException({ error: result.error }, result.status);
            }
            return { photos: result.photos };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            console.error('Unsplash error:', err);
            throw new common_1.HttpException({ error: 'Error searching for image' }, 500);
        }
    }
    update(user, tripId, id, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        validateLengths(body);
        this.requireEdit(trip, user);
        const place = this.places.update(tripId, id, body);
        if (!place) {
            throw new common_1.HttpException({ error: 'Place not found' }, 404);
        }
        this.places.broadcast(tripId, 'place:updated', { place }, socketId);
        this.places.onUpdated(place.id);
        return { place };
    }
    remove(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        this.places.onDeleted(Number(id)); // sync before actual delete
        if (!this.places.remove(tripId, id)) {
            throw new common_1.HttpException({ error: 'Place not found' }, 404);
        }
        this.places.broadcast(tripId, 'place:deleted', { placeId: Number(id) }, socketId);
        return { success: true };
    }
};
exports.PlacesController = PlacesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Query)('search')),
    __param(3, (0, common_1.Query)('category')),
    __param(4, (0, common_1.Query)('tag')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", void 0)
], PlacesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], PlacesController.prototype, "create", null);
__decorate([
    (0, common_1.Post)('import/gpx'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', UPLOAD)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.UploadedFile)()),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object, String]),
    __metadata("design:returntype", void 0)
], PlacesController.prototype, "importGpx", null);
__decorate([
    (0, common_1.Post)('import/map'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', UPLOAD)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.UploadedFile)()),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object, String]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "importMap", null);
__decorate([
    (0, common_1.Post)('import/google-list'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)('url')),
    __param(3, (0, common_1.Body)('enrich')),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object, String]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "importGoogle", null);
__decorate([
    (0, common_1.Post)('import/naver-list'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)('url')),
    __param(3, (0, common_1.Body)('enrich')),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object, String]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "importNaver", null);
__decorate([
    (0, common_1.Post)('bulk-delete'),
    (0, common_1.HttpCode)(200) // Express answers bulk-delete with res.json (200), unlike the 201 imports.
    ,
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)('ids')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], PlacesController.prototype, "bulkDelete", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], PlacesController.prototype, "get", null);
__decorate([
    (0, common_1.Get)(':id/image'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "image", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], PlacesController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], PlacesController.prototype, "remove", null);
exports.PlacesController = PlacesController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/places'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [places_service_1.PlacesService])
], PlacesController);
