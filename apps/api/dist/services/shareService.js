"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrUpdateShareLink = createOrUpdateShareLink;
exports.getShareLink = getShareLink;
exports.deleteShareLink = deleteShareLink;
exports.getSharedTripData = getSharedTripData;
exports.getSharedPlacePhotoPath = getSharedPlacePhotoPath;
const database_1 = require("../db/database");
const crypto_1 = __importDefault(require("crypto"));
const queryHelpers_1 = require("./queryHelpers");
const placePhotoCache_1 = require("./placePhotoCache");
const PLACE_PHOTO_PROXY_PREFIX = '/api/maps/place-photo/';
/**
 * Place photo proxy URLs (`/api/maps/place-photo/<id>/bytes`) are served by the
 * JWT-guarded MapsController, so they 401 for an unauthenticated shared-trip
 * viewer. Rewrite them to the public, token-scoped equivalent
 * (`/api/shared/<token>/place-photo/<id>/bytes`) so thumbnails load in a shared
 * link. A simple prefix swap keeps the already-encoded placeId segment intact, so
 * the URL round-trips. Non-proxy URLs (data:, /uploads/, null) pass through.
 */
function rewritePlacePhotoUrl(url, token) {
    if (typeof url === 'string' && url.startsWith(PLACE_PHOTO_PROXY_PREFIX)) {
        return `/api/shared/${token}/place-photo/${url.slice(PLACE_PHOTO_PROXY_PREFIX.length)}`;
    }
    return url ?? null;
}
/**
 * Creates a new share link or updates the permissions on an existing one.
 * Returns an object with the token string and whether it was newly created.
 */
function createOrUpdateShareLink(tripId, createdBy, permissions) {
    const { share_map = true, share_bookings = true, share_packing = false, share_budget = false, share_collab = false, } = permissions;
    const existing = database_1.db.prepare('SELECT token FROM share_tokens WHERE trip_id = ?').get(tripId);
    if (existing) {
        database_1.db.prepare('UPDATE share_tokens SET share_map = ?, share_bookings = ?, share_packing = ?, share_budget = ?, share_collab = ? WHERE trip_id = ?')
            .run(share_map ? 1 : 0, share_bookings ? 1 : 0, share_packing ? 1 : 0, share_budget ? 1 : 0, share_collab ? 1 : 0, tripId);
        return { token: existing.token, created: false };
    }
    // New share links default to a 90-day TTL. Existing tokens that were
    // created before the expires_at migration keep NULL here and remain
    // valid indefinitely until the owner rotates them; that preserves
    // behaviour for anyone who's already sharing a link.
    const token = crypto_1.default.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    database_1.db.prepare('INSERT INTO share_tokens (trip_id, token, created_by, share_map, share_bookings, share_packing, share_budget, share_collab, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(tripId, token, createdBy, share_map ? 1 : 0, share_bookings ? 1 : 0, share_packing ? 1 : 0, share_budget ? 1 : 0, share_collab ? 1 : 0, expiresAt);
    return { token, created: true };
}
/**
 * Returns share token info for a trip, or null if no share link exists.
 */
function getShareLink(tripId) {
    const row = database_1.db.prepare('SELECT * FROM share_tokens WHERE trip_id = ?').get(tripId);
    if (!row)
        return null;
    return {
        token: row.token,
        created_at: row.created_at,
        share_map: !!row.share_map,
        share_bookings: !!row.share_bookings,
        share_packing: !!row.share_packing,
        share_budget: !!row.share_budget,
        share_collab: !!row.share_collab,
    };
}
/**
 * Deletes the share token for a trip.
 */
function deleteShareLink(tripId) {
    database_1.db.prepare('DELETE FROM share_tokens WHERE trip_id = ?').run(tripId);
}
/**
 * Loads the full public trip data for a share token, filtered by the token's
 * permission flags. Returns null if the token is invalid or the trip is gone.
 */
function getSharedTripData(token) {
    const shareRow = database_1.db.prepare("SELECT * FROM share_tokens WHERE token = ? AND (expires_at IS NULL OR expires_at > datetime('now'))").get(token);
    if (!shareRow)
        return null;
    const tripId = shareRow.trip_id;
    // Trip
    const trip = database_1.db.prepare('SELECT id, title, description, start_date, end_date, cover_image, currency FROM trips WHERE id = ?').get(tripId);
    if (!trip)
        return null;
    // Days with assignments
    const days = database_1.db.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number ASC').all(tripId);
    const dayIds = days.map(d => d.id);
    let assignments = {};
    let dayNotes = {};
    if (dayIds.length > 0) {
        const ph = dayIds.map(() => '?').join(',');
        const allAssignments = database_1.db.prepare(`
      SELECT da.*, p.id as place_id, p.name as place_name, p.description as place_description,
        p.lat, p.lng, p.address, p.category_id, p.price, p.currency as place_currency,
        COALESCE(da.assignment_time, p.place_time) as place_time,
        COALESCE(da.assignment_end_time, p.end_time) as end_time,
        p.duration_minutes, p.notes as place_notes, p.image_url, p.transport_mode,
        c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM day_assignments da
      JOIN places p ON da.place_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE da.day_id IN (${ph})
      ORDER BY da.order_index ASC, da.created_at ASC
    `).all(...dayIds);
        const placeIds = [...new Set(allAssignments.map((a) => a.place_id))];
        const tagsByPlace = (0, queryHelpers_1.loadTagsByPlaceIds)(placeIds, { compact: true });
        const byDay = {};
        for (const a of allAssignments) {
            if (!byDay[a.day_id])
                byDay[a.day_id] = [];
            byDay[a.day_id].push({
                id: a.id, day_id: a.day_id, order_index: a.order_index, notes: a.notes,
                place: {
                    id: a.place_id, name: a.place_name, description: a.place_description,
                    lat: a.lat, lng: a.lng, address: a.address, category_id: a.category_id,
                    price: a.price, place_time: a.place_time, end_time: a.end_time,
                    image_url: rewritePlacePhotoUrl(a.image_url, token), transport_mode: a.transport_mode,
                    category: a.category_id ? { id: a.category_id, name: a.category_name, color: a.category_color, icon: a.category_icon } : null,
                    tags: tagsByPlace[a.place_id] || [],
                }
            });
        }
        assignments = byDay;
        const allNotes = database_1.db.prepare(`SELECT * FROM day_notes WHERE day_id IN (${ph}) ORDER BY sort_order ASC, created_at ASC`).all(...dayIds);
        const notesByDay = {};
        for (const n of allNotes) {
            if (!notesByDay[n.day_id])
                notesByDay[n.day_id] = [];
            notesByDay[n.day_id].push(n);
        }
        dayNotes = notesByDay;
    }
    // Places
    const places = database_1.db.prepare(`
    SELECT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon
    FROM places p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.trip_id = ? ORDER BY p.created_at DESC
  `).all(tripId).map((p) => ({ ...p, image_url: rewritePlacePhotoUrl(p.image_url, token) }));
    // Reservations — include per-day positions so the client can render the same order as the planner
    const reservations = database_1.db.prepare('SELECT * FROM reservations WHERE trip_id = ? ORDER BY reservation_time ASC').all(tripId);
    const dayPositions = database_1.db.prepare(`
    SELECT rdp.reservation_id, rdp.day_id, rdp.position
    FROM reservation_day_positions rdp
    JOIN reservations r ON rdp.reservation_id = r.id
    WHERE r.trip_id = ?
  `).all(tripId);
    const posMap = new Map();
    for (const dp of dayPositions) {
        if (!posMap.has(dp.reservation_id))
            posMap.set(dp.reservation_id, {});
        posMap.get(dp.reservation_id)[dp.day_id] = dp.position;
    }
    for (const r of reservations) {
        r.day_positions = posMap.get(r.id) || null;
    }
    // Accommodations
    const accommodations = database_1.db.prepare(`
    SELECT a.*, p.name as place_name, p.address as place_address, p.lat as place_lat, p.lng as place_lng
    FROM day_accommodations a JOIN places p ON a.place_id = p.id
    WHERE a.trip_id = ?
  `).all(tripId);
    // Packing
    const packing = database_1.db.prepare('SELECT * FROM packing_items WHERE trip_id = ? ORDER BY sort_order ASC').all(tripId);
    // Budget
    const budget = database_1.db.prepare('SELECT * FROM budget_items WHERE trip_id = ? ORDER BY category ASC').all(tripId);
    // Categories
    const categories = database_1.db.prepare('SELECT * FROM categories').all();
    const permissions = {
        share_map: !!shareRow.share_map,
        share_bookings: !!shareRow.share_bookings,
        share_packing: !!shareRow.share_packing,
        share_budget: !!shareRow.share_budget,
        share_collab: !!shareRow.share_collab,
    };
    // Collab messages (only if owner chose to share)
    const collabMessages = permissions.share_collab
        ? database_1.db.prepare('SELECT m.*, u.username, u.avatar FROM collab_messages m JOIN users u ON m.user_id = u.id WHERE m.trip_id = ? AND m.deleted = 0 ORDER BY m.created_at').all(tripId)
        : [];
    return {
        trip, days, assignments, dayNotes, places, categories, permissions,
        reservations: permissions.share_bookings ? reservations : [],
        accommodations: permissions.share_bookings ? accommodations : [],
        packing: permissions.share_packing ? packing : [],
        budget: permissions.share_budget ? budget : [],
        collab: collabMessages,
    };
}
/**
 * Resolves the on-disk path for a cached place photo requested through a public
 * share link. Validates that the token is valid + unexpired and that the place
 * actually belongs to that token's trip (matched via the stored proxy URL, which
 * covers both Google `placeId` and Wikimedia `coords:` pseudo-IDs without
 * depending on google_place_id). Returns null — never throws — so the caller
 * answers a plain 404, mirroring the authenticated bytes endpoint.
 */
function getSharedPlacePhotoPath(token, placeId) {
    const shareRow = database_1.db.prepare("SELECT trip_id FROM share_tokens WHERE token = ? AND (expires_at IS NULL OR expires_at > datetime('now'))").get(token);
    if (!shareRow)
        return null;
    const expectedUrl = `${PLACE_PHOTO_PROXY_PREFIX}${encodeURIComponent(placeId)}/bytes`;
    const place = database_1.db.prepare('SELECT 1 FROM places WHERE trip_id = ? AND image_url = ?').get(shareRow.trip_id, expectedUrl);
    if (!place)
        return null;
    return (0, placePhotoCache_1.serveFilePath)(placeId);
}
