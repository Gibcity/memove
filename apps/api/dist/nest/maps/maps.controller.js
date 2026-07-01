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
exports.MapsController = void 0;
const common_1 = require("@nestjs/common");
const node_fs_1 = require("node:fs");
const maps_service_1 = require("./maps.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/** Maps a thrown service error to the same status + { error } body Express sent. */
function toHttpException(err, fallbackMessage, defaultStatus) {
    const status = err.status || defaultStatus;
    const message = err instanceof Error ? err.message : fallbackMessage;
    return new common_1.HttpException({ error: message }, status);
}
/**
 * /api/maps — place search, autocomplete, details, photos, reverse geocoding and
 * Google-Maps-URL resolution.
 *
 * Behaviour is byte-identical to the legacy Express route (server/src/routes/
 * maps.ts): same auth, same bespoke 400 validation messages, the same
 * per-endpoint kill-switch short-circuits, the same error status/body mapping,
 * and the same diagnostic logging. The SSRF guard lives in the underlying
 * service and is reused unchanged.
 */
let MapsController = class MapsController {
    maps;
    constructor(maps) {
        this.maps = maps;
    }
    async search(user, query, lang, locationBias) {
        if (!query) {
            throw new common_1.HttpException({ error: 'Search query is required' }, 400);
        }
        // Optional bias toward a coordinate (lat/lng[/radius]); improves foreign-region queries.
        if (locationBias && !(Number.isFinite(locationBias.lat) && Number.isFinite(locationBias.lng))) {
            throw new common_1.HttpException({ error: 'Invalid locationBias: lat and lng must be finite numbers' }, 400);
        }
        try {
            return await this.maps.search(user.id, query, lang, locationBias);
        }
        catch (err) {
            console.error('Maps search error:', err);
            throw toHttpException(err, 'Search error', 500);
        }
    }
    // OSM-only POI explore: places of a category within the current map viewport.
    async pois(category, south, west, north, east) {
        if (!category)
            throw new common_1.HttpException({ error: 'A category is required' }, 400);
        const bbox = { south: Number(south), west: Number(west), north: Number(north), east: Number(east) };
        if (Object.values(bbox).some(v => !Number.isFinite(v))) {
            throw new common_1.HttpException({ error: 'A valid bbox (south, west, north, east) is required' }, 400);
        }
        try {
            return await this.maps.pois(category, bbox);
        }
        catch (err) {
            throw toHttpException(err, 'POI search error', 500);
        }
    }
    async autocomplete(user, input, lang, locationBias) {
        if (this.maps.autocompleteDisabled()) {
            return { suggestions: [], source: 'disabled' };
        }
        if (!input || typeof input !== 'string') {
            throw new common_1.HttpException({ error: 'Input is required' }, 400);
        }
        if (input.length > 200) {
            throw new common_1.HttpException({ error: 'Input too long (max 200 chars)' }, 400);
        }
        if (locationBias) {
            const { low, high } = locationBias;
            if (!low || !high
                || !Number.isFinite(low.lat) || !Number.isFinite(low.lng)
                || !Number.isFinite(high.lat) || !Number.isFinite(high.lng)) {
                throw new common_1.HttpException({ error: 'Invalid locationBias: low and high must have finite lat and lng' }, 400);
            }
        }
        try {
            return await this.maps.autocomplete(user.id, input, lang, locationBias);
        }
        catch (err) {
            console.error('Maps autocomplete error:', err);
            throw toHttpException(err, 'Autocomplete error', 500);
        }
    }
    async details(user, placeId, expand, lang, refresh) {
        if (this.maps.detailsDisabled()) {
            return { place: null, disabled: true };
        }
        try {
            return expand
                ? await this.maps.detailsExpanded(user.id, placeId, lang, refresh === '1')
                : await this.maps.details(user.id, placeId, lang);
        }
        catch (err) {
            console.error('Maps details error:', err);
            throw toHttpException(err, 'Error fetching place details', 500);
        }
    }
    async placePhoto(user, placeId, lat, lng, name) {
        // Kill-switch only applies to Google Places fetches — Wikimedia (coords:) stays allowed.
        if (!placeId.startsWith('coords:') && this.maps.photosDisabled()) {
            return { photoUrl: null };
        }
        try {
            return await this.maps.photo(user.id, placeId, parseFloat(lat), parseFloat(lng), name);
        }
        catch (err) {
            const status = err.status || 500;
            if (status >= 500)
                console.error('Place photo error:', err);
            throw toHttpException(err, 'Error fetching photo', 500);
        }
    }
    placePhotoBytes(placeId, res) {
        const fp = this.maps.photoBytesPath(placeId);
        if (!fp) {
            res.status(404).json({ error: 'Photo not cached' });
            return;
        }
        // Stream the cached file directly instead of res.sendFile(): the send library
        // bundled under @nestjs/platform-express rejects absolute Windows paths (drive
        // letter, no `root`) with a NotFoundError that surfaced as an unhandled 500,
        // even though the file exists. A plain read stream serves the bytes
        // cross-platform; a read error still yields the legacy 404. Cached photos are
        // always JPEG (placePhotoCache writes `<hash>.jpg`).
        res.set('Cache-Control', 'public, max-age=2592000, immutable');
        res.type('image/jpeg');
        const stream = (0, node_fs_1.createReadStream)(fp);
        stream.on('error', () => {
            if (!res.headersSent)
                res.status(404).json({ error: 'Photo not cached' });
        });
        stream.pipe(res);
    }
    async reverse(lat, lng, lang) {
        if (!lat || !lng) {
            throw new common_1.HttpException({ error: 'lat and lng required' }, 400);
        }
        try {
            return await this.maps.reverse(lat, lng, lang);
        }
        catch {
            // The legacy route swallows reverse-geocode failures into an empty result.
            return { name: null, address: null };
        }
    }
    async resolveUrl(url) {
        if (!url || typeof url !== 'string') {
            throw new common_1.HttpException({ error: 'URL is required' }, 400);
        }
        try {
            return await this.maps.resolveUrl(url);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to resolve URL';
            console.error('[Maps] URL resolve error:', message);
            throw toHttpException(err, 'Failed to resolve URL', 400);
        }
    }
};
exports.MapsController = MapsController;
__decorate([
    (0, common_1.Post)('search'),
    (0, common_1.HttpCode)(200) // Express answers with res.json (200); Nest would otherwise default POST to 201.
    ,
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)('query')),
    __param(2, (0, common_1.Query)('lang')),
    __param(3, (0, common_1.Body)('locationBias')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], MapsController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('pois'),
    __param(0, (0, common_1.Query)('category')),
    __param(1, (0, common_1.Query)('south')),
    __param(2, (0, common_1.Query)('west')),
    __param(3, (0, common_1.Query)('north')),
    __param(4, (0, common_1.Query)('east')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], MapsController.prototype, "pois", null);
__decorate([
    (0, common_1.Post)('autocomplete'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)('input')),
    __param(2, (0, common_1.Body)('lang')),
    __param(3, (0, common_1.Body)('locationBias')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], MapsController.prototype, "autocomplete", null);
__decorate([
    (0, common_1.Get)('details/:placeId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('placeId')),
    __param(2, (0, common_1.Query)('expand')),
    __param(3, (0, common_1.Query)('lang')),
    __param(4, (0, common_1.Query)('refresh')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", Promise)
], MapsController.prototype, "details", null);
__decorate([
    (0, common_1.Get)('place-photo/:placeId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('placeId')),
    __param(2, (0, common_1.Query)('lat')),
    __param(3, (0, common_1.Query)('lng')),
    __param(4, (0, common_1.Query)('name')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", Promise)
], MapsController.prototype, "placePhoto", null);
__decorate([
    (0, common_1.Get)('place-photo/:placeId/bytes'),
    __param(0, (0, common_1.Param)('placeId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], MapsController.prototype, "placePhotoBytes", null);
__decorate([
    (0, common_1.Get)('reverse'),
    __param(0, (0, common_1.Query)('lat')),
    __param(1, (0, common_1.Query)('lng')),
    __param(2, (0, common_1.Query)('lang')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], MapsController.prototype, "reverse", null);
__decorate([
    (0, common_1.Post)('resolve-url'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)('url')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MapsController.prototype, "resolveUrl", null);
exports.MapsController = MapsController = __decorate([
    (0, common_1.Controller)('api/maps'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [maps_service_1.MapsService])
], MapsController);
