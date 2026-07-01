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
exports.MapsService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../database/database.service");
const mapsService_1 = require("../../services/mapsService");
const placePhotoCache_1 = require("../../services/placePhotoCache");
/**
 * Thin Nest wrapper around the existing maps service. All geocoding, the
 * provider fan-out (Nominatim/Overpass/Google) and — importantly — the SSRF
 * guard live in mapsService and are reused unchanged, so behaviour and the
 * outbound-URL protection are identical.
 *
 * The per-endpoint kill-switches are settings reads the legacy route does
 * inline; they're encapsulated here as `*Disabled()` helpers over the same
 * `app_settings` rows.
 */
let MapsService = class MapsService {
    database;
    constructor(database) {
        this.database = database;
    }
    isSettingDisabled(key) {
        const row = this.database.get('SELECT value FROM app_settings WHERE key = ?', key);
        return row?.value === 'false';
    }
    autocompleteDisabled() {
        return this.isSettingDisabled('places_autocomplete_enabled');
    }
    detailsDisabled() {
        return this.isSettingDisabled('places_details_enabled');
    }
    photosDisabled() {
        return this.isSettingDisabled('places_photos_enabled');
    }
    search(userId, query, lang, locationBias) {
        return (0, mapsService_1.searchPlaces)(userId, query, lang, locationBias);
    }
    autocomplete(userId, input, lang, locationBias) {
        return (0, mapsService_1.autocompletePlaces)(userId, input, lang, locationBias);
    }
    details(userId, placeId, lang) {
        return (0, mapsService_1.getPlaceDetails)(userId, placeId, lang);
    }
    detailsExpanded(userId, placeId, lang, refresh) {
        return (0, mapsService_1.getPlaceDetailsExpanded)(userId, placeId, lang, refresh);
    }
    photo(userId, placeId, lat, lng, name) {
        return (0, mapsService_1.getPlacePhoto)(userId, placeId, lat, lng, name);
    }
    photoBytesPath(placeId) {
        return (0, placePhotoCache_1.serveFilePath)(placeId);
    }
    reverse(lat, lng, lang) {
        return (0, mapsService_1.reverseGeocode)(lat, lng, lang);
    }
    resolveUrl(url) {
        return (0, mapsService_1.resolveGoogleMapsUrl)(url);
    }
    // OSM-only POI search by category within a viewport bbox (never calls Google).
    pois(category, bbox) {
        return (0, mapsService_1.searchOverpassPois)(category, bbox);
    }
};
exports.MapsService = MapsService;
exports.MapsService = MapsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], MapsService);
