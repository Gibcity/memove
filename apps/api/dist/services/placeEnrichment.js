"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickEnrichmentMatch = pickEnrichmentMatch;
exports.enrichImportedPlaces = enrichImportedPlaces;
const database_1 = require("../db/database");
const websocket_1 = require("../websocket");
const mapsService_1 = require("./mapsService");
/** How close a search hit must be to the imported coordinates to be trusted. */
const MATCH_RADIUS_METERS = 250;
/** Bias the text search to roughly the imported area. */
const SEARCH_BIAS_RADIUS_METERS = 2000;
/** Concurrent enrichment lookups — small, to stay friendly to the Maps quota. */
const ENRICH_CONCURRENCY = 3;
function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
/**
 * Pick the search result that is the same place as the import: it must be a
 * Google result (have a google_place_id) with coordinates within
 * MATCH_RADIUS_METERS of the imported point. Returns the closest such hit, or
 * null when nothing is close enough — in which case the place is left as
 * imported rather than risking a wrong-place overwrite (common-name / romanized
 * lists). Exported for unit testing.
 */
function pickEnrichmentMatch(candidates, target, maxMeters = MATCH_RADIUS_METERS) {
    let best = null;
    for (const c of candidates || []) {
        const gpid = c.google_place_id;
        const lat = c.lat;
        const lng = c.lng;
        if (typeof gpid !== 'string' || !gpid)
            continue;
        if (typeof lat !== 'number' || typeof lng !== 'number')
            continue;
        const dist = haversineMeters(target, { lat, lng });
        if (dist > maxMeters)
            continue;
        if (!best || dist < best.dist)
            best = { c, dist };
    }
    return best?.c ?? null;
}
async function mapWithConcurrency(items, limit, fn) {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (cursor < items.length) {
            const item = items[cursor++];
            await fn(item);
        }
    });
    await Promise.all(workers);
}
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
async function enrichOne(tripId, userId, place, lang) {
    // Already linked (shouldn't happen for list imports) — nothing to resolve.
    if (place.google_place_id)
        return;
    if (typeof place.lat !== 'number' || typeof place.lng !== 'number')
        return;
    const { places: results } = await (0, mapsService_1.searchPlaces)(userId, place.name, lang, {
        lat: place.lat,
        lng: place.lng,
        radius: SEARCH_BIAS_RADIUS_METERS,
    });
    const match = pickEnrichmentMatch(results, { lat: place.lat, lng: place.lng });
    if (!match)
        return;
    const gpid = str(match.google_place_id);
    if (!gpid)
        return;
    // COALESCE so enrichment only fills empty columns — never overwrites data the
    // import already captured (e.g. Naver's address) or anything the user edited.
    database_1.db.prepare(`UPDATE places
       SET google_place_id = COALESCE(google_place_id, ?),
           address         = COALESCE(address, ?),
           website         = COALESCE(website, ?),
           phone           = COALESCE(phone, ?),
           updated_at      = CURRENT_TIMESTAMP
     WHERE id = ? AND trip_id = ?`).run(gpid, str(match.address), str(match.website), str(match.phone), place.id, tripId);
    // Photo is best-effort: Google often has none, and getPlacePhoto throws 404 in
    // that case — a missing photo must never abort the rest of the enrichment.
    try {
        const photo = await (0, mapsService_1.getPlacePhoto)(userId, gpid, place.lat, place.lng, place.name);
        if (photo?.photoUrl) {
            database_1.db.prepare('UPDATE places SET image_url = COALESCE(image_url, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND trip_id = ?').run(photo.photoUrl, place.id, tripId);
        }
    }
    catch {
        /* no photo — leave image_url as-is */
    }
    // Push the enriched row to every connected client (no socket exclusion: the
    // importer's own client should also receive the late update).
    const updated = (0, database_1.getPlaceWithTags)(place.id);
    if (updated)
        (0, websocket_1.broadcast)(tripId, 'place:updated', { place: updated }, undefined);
}
/**
 * Enrich a batch of just-imported places in the background. Never throws —
 * any per-place failure is swallowed so one bad lookup can't take down the
 * detached task or the process. No-ops when no Google Maps key is configured.
 */
async function enrichImportedPlaces(tripId, userId, places, lang) {
    try {
        if (!places.length)
            return;
        if (!(0, mapsService_1.getMapsKey)(userId))
            return;
        await mapWithConcurrency(places, ENRICH_CONCURRENCY, async (place) => {
            try {
                await enrichOne(tripId, userId, place, lang);
            }
            catch (err) {
                console.error(`[Places] enrichment failed for place ${place.id}:`, err instanceof Error ? err.message : err);
            }
        });
    }
    catch (err) {
        console.error('[Places] import enrichment pass failed:', err instanceof Error ? err.message : err);
    }
}
