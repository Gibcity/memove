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
exports.BookingImportService = void 0;
const common_1 = require("@nestjs/common");
const websocket_1 = require("../../websocket");
const permissions_1 = require("../../services/permissions");
const tripAccess_1 = require("../../services/tripAccess");
const reservationService_1 = require("../../services/reservationService");
const placeService_1 = require("../../services/placeService");
const mapsService_1 = require("../../services/mapsService");
const database_1 = require("../../db/database");
const kitinerary_extractor_service_1 = require("./kitinerary-extractor.service");
const kitinerary_mapper_1 = require("./kitinerary-mapper");
function resolveDayId(tripId, iso) {
    if (!iso)
        return null;
    const date = iso.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        return null;
    const row = database_1.db.prepare('SELECT id FROM days WHERE trip_id = ? AND date = ? LIMIT 1').get(tripId, date);
    return row?.id ?? null;
}
let BookingImportService = class BookingImportService {
    extractor;
    constructor(extractor) {
        this.extractor = extractor;
    }
    isAvailable() {
        return this.extractor.isAvailable();
    }
    verifyTripAccess(tripId, userId) {
        return (0, tripAccess_1.verifyTripAccess)(tripId, userId);
    }
    canEdit(trip, user) {
        return (0, permissions_1.checkPermission)('reservation_edit', user.role, trip.user_id, user.id, trip.user_id !== user.id);
    }
    /**
     * Parse uploaded files through kitinerary-extractor and return a preview list.
     * Does NOT persist anything.
     */
    async preview(files) {
        if (!this.extractor.isAvailable()) {
            throw new common_1.HttpException({ error: 'KItinerary extractor is not available on this server' }, 503);
        }
        const allItems = [];
        const allWarnings = [];
        for (const file of files) {
            let kiItems;
            try {
                kiItems = await this.extractor.extract(file.buffer, file.originalname);
            }
            catch (err) {
                allWarnings.push(`${file.originalname}: extraction failed — ${err instanceof Error ? err.message : String(err)}`);
                continue;
            }
            if (kiItems.length === 0) {
                allWarnings.push(`${file.originalname}: no reservations found`);
                continue;
            }
            const { items, warnings } = (0, kitinerary_mapper_1.mapReservations)(kiItems, file.originalname);
            allItems.push(...items);
            allWarnings.push(...warnings);
        }
        return { items: allItems, warnings: allWarnings };
    }
    /**
     * Persist a confirmed list of parsed items.
     * Creates place rows for hotel/restaurant/event venues, then calls createReservation.
     * Broadcasts reservation:created (and accommodation:created if applicable) per item.
     */
    async confirm(tripId, items, socketId) {
        const created = [];
        for (const item of items) {
            try {
                const { _venue, _accommodation, source: _src, ...reservationData } = item;
                // Auto-create a place row for venue-based reservations
                let placeId;
                if (_venue?.name) {
                    // Geocode before creating so the broadcast carries the coordinates
                    let lat = _venue.lat;
                    let lng = _venue.lng;
                    if (lat == null && (_venue.address || _venue.name)) {
                        try {
                            const queries = [
                                _venue.address ? `${_venue.name} ${_venue.address}` : null,
                                _venue.address ?? null,
                                _venue.name,
                            ].filter((q) => !!q);
                            for (const q of queries) {
                                const results = await (0, mapsService_1.searchNominatim)(q);
                                const hit = results[0];
                                if (hit?.lat != null && hit?.lng != null) {
                                    lat = hit.lat;
                                    lng = hit.lng;
                                    break;
                                }
                            }
                        }
                        catch {
                            // geocoding failure is non-fatal
                        }
                    }
                    const place = (0, placeService_1.createPlace)(tripId, {
                        name: _venue.name,
                        lat,
                        lng,
                        address: _venue.address,
                        website: _venue.website,
                        phone: _venue.phone,
                    });
                    placeId = place.id;
                    (0, websocket_1.broadcast)(tripId, 'place:created', { place }, socketId);
                }
                // Build create_accommodation for hotel reservations.
                // start_day_id / end_day_id are resolved from check-in/out ISO dates so
                // the accommodation row is actually inserted (createReservation gates on them).
                let createAccommodation;
                if (item.type === 'hotel' && _accommodation) {
                    const startDayId = resolveDayId(tripId, _accommodation.check_in);
                    const endDayId = resolveDayId(tripId, _accommodation.check_out);
                    createAccommodation = {
                        place_id: placeId,
                        start_day_id: startDayId ?? undefined,
                        end_day_id: endDayId ?? undefined,
                        check_in: _accommodation.check_in,
                        check_out: _accommodation.check_out,
                        confirmation: _accommodation.confirmation,
                    };
                }
                const { reservation, accommodationCreated } = (0, reservationService_1.createReservation)(tripId, {
                    ...reservationData,
                    place_id: placeId,
                    create_accommodation: createAccommodation,
                });
                (0, websocket_1.broadcast)(tripId, 'reservation:created', { reservation }, socketId);
                if (accommodationCreated) {
                    (0, websocket_1.broadcast)(tripId, 'accommodation:created', {}, socketId);
                }
                created.push(reservation);
            }
            catch (err) {
                console.error(`[booking-import] Failed to create reservation "${item.title}":`, err instanceof Error ? err.message : err);
            }
        }
        return { created };
    }
};
exports.BookingImportService = BookingImportService;
exports.BookingImportService = BookingImportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [kitinerary_extractor_service_1.KitineraryExtractorService])
], BookingImportService);
