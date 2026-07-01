"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTripAccess = void 0;
exports.loadEndpointsByTrip = loadEndpointsByTrip;
exports.listReservations = listReservations;
exports.getUpcomingReservations = getUpcomingReservations;
exports.getReservationWithJoins = getReservationWithJoins;
exports.createReservation = createReservation;
exports.updatePositions = updatePositions;
exports.getReservation = getReservation;
exports.updateReservation = updateReservation;
exports.deleteReservation = deleteReservation;
const database_1 = require("../db/database");
var tripAccess_1 = require("./tripAccess");
Object.defineProperty(exports, "verifyTripAccess", { enumerable: true, get: function () { return tripAccess_1.verifyTripAccess; } });
function loadEndpointsByTrip(tripId) {
    const rows = database_1.db.prepare(`
    SELECT e.* FROM reservation_endpoints e
    JOIN reservations r ON e.reservation_id = r.id
    WHERE r.trip_id = ?
    ORDER BY e.reservation_id, e.sequence
  `).all(tripId);
    const map = new Map();
    for (const r of rows) {
        const list = map.get(r.reservation_id) ?? [];
        list.push(r);
        map.set(r.reservation_id, list);
    }
    return map;
}
function loadEndpoints(reservationId) {
    return database_1.db.prepare('SELECT * FROM reservation_endpoints WHERE reservation_id = ? ORDER BY sequence').all(reservationId);
}
// Resolve the day row whose date matches the date portion of an ISO-ish
// timestamp. Used to keep `day_id` / `end_day_id` in sync with
// `reservation_time` / `reservation_end_time` so non-transport bookings
// (tours, restaurants, events, ...) end up on the right day in the UI,
// which now filters by day_id instead of reservation_time.
function resolveDayIdFromTime(tripId, time) {
    if (!time)
        return null;
    const datePart = time.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart))
        return null;
    const row = database_1.db
        .prepare('SELECT id FROM days WHERE trip_id = ? AND date = ? LIMIT 1')
        .get(tripId, datePart);
    return row?.id ?? null;
}
function saveEndpoints(reservationId, endpoints) {
    // Bind the transaction lazily on each call. Binding at module load time
    // captures the DB connection that was open then, which becomes invalid
    // after demo-reset / restore-from-backup closes and reinitialises the
    // connection — every later endpoint save would throw
    // "The database connection is not open".
    const tx = database_1.db.transaction((rid, eps) => {
        database_1.db.prepare('DELETE FROM reservation_endpoints WHERE reservation_id = ?').run(rid);
        const insert = database_1.db.prepare(`
      INSERT INTO reservation_endpoints (reservation_id, role, sequence, name, code, lat, lng, timezone, local_time, local_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        eps.forEach((e, i) => {
            insert.run(rid, e.role, e.sequence ?? i, e.name, e.code ?? null, e.lat, e.lng, e.timezone ?? null, e.local_time ?? null, e.local_date ?? null);
        });
    });
    tx(reservationId, endpoints);
}
function listReservations(tripId) {
    const reservations = database_1.db.prepare(`
    SELECT r.*, d.day_number, p.name as place_name, r.assignment_id,
      ap.place_id as accommodation_place_id, acc_p.name as accommodation_name,
      ap.start_day_id as accommodation_start_day_id, ap.end_day_id as accommodation_end_day_id
    FROM reservations r
    LEFT JOIN days d ON r.day_id = d.id
    LEFT JOIN places p ON r.place_id = p.id
    LEFT JOIN day_accommodations ap ON r.accommodation_id = ap.id
    LEFT JOIN places acc_p ON ap.place_id = acc_p.id
    WHERE r.trip_id = ?
    ORDER BY r.reservation_time ASC, r.created_at ASC
  `).all(tripId);
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
    const endpointsMap = loadEndpointsByTrip(tripId);
    for (const r of reservations) {
        r.day_positions = posMap.get(r.id) || null;
        r.endpoints = endpointsMap.get(r.id) || [];
        // accommodation_id is a TEXT column; the integer FK reads back as a numeric
        // string (e.g. "14.0"). Normalize to an int so clients can parse it.
        r.accommodation_id = r.accommodation_id == null ? null : Math.trunc(Number(r.accommodation_id));
    }
    return reservations;
}
/**
 * Upcoming reservations across all of a user's active trips, soonest first.
 * Used by the dashboard's "Upcoming reservations" widget. A reservation counts
 * as upcoming when its own time is in the future, or — for timeless entries —
 * when its day falls on or after today. Cancelled bookings are skipped.
 */
function getUpcomingReservations(userId, limit = 6) {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();
    const reservations = database_1.db.prepare(`
    SELECT r.id, r.trip_id, r.title, r.type, r.status, r.location,
           r.reservation_time, r.confirmation_number,
           t.title as trip_title, t.cover_image as trip_cover,
           d.date as day_date, p.name as place_name, p.image_url as place_image
    FROM reservations r
    JOIN trips t ON t.id = r.trip_id
    LEFT JOIN trip_members tm ON tm.trip_id = t.id AND tm.user_id = ?
    LEFT JOIN days d ON r.day_id = d.id
    LEFT JOIN places p ON r.place_id = p.id
    WHERE (t.user_id = ? OR tm.user_id IS NOT NULL)
      AND t.is_archived = 0
      AND r.status != 'cancelled'
      AND (
        (r.reservation_time IS NOT NULL AND r.reservation_time >= ?)
        OR (r.reservation_time IS NULL AND d.date IS NOT NULL AND d.date >= ?)
      )
    ORDER BY COALESCE(r.reservation_time, d.date) ASC
    LIMIT ?
  `).all(userId, userId, now, today, limit);
    return reservations;
}
function getReservationWithJoins(id) {
    const row = database_1.db.prepare(`
    SELECT r.*, d.day_number, p.name as place_name, r.assignment_id,
      ap.place_id as accommodation_place_id, acc_p.name as accommodation_name,
      ap.start_day_id as accommodation_start_day_id, ap.end_day_id as accommodation_end_day_id
    FROM reservations r
    LEFT JOIN days d ON r.day_id = d.id
    LEFT JOIN places p ON r.place_id = p.id
    LEFT JOIN day_accommodations ap ON r.accommodation_id = ap.id
    LEFT JOIN places acc_p ON ap.place_id = acc_p.id
    WHERE r.id = ?
  `).get(id);
    if (!row)
        return undefined;
    row.endpoints = loadEndpoints(row.id);
    // accommodation_id is a TEXT column; the integer FK reads back as a numeric
    // string (e.g. "14.0"). Normalize to an int so clients can parse it.
    row.accommodation_id = row.accommodation_id == null ? null : Math.trunc(Number(row.accommodation_id));
    return row;
}
function createReservation(tripId, data) {
    const { title, reservation_time, reservation_end_time, location, confirmation_number, notes, day_id, end_day_id, place_id, assignment_id, status, type, accommodation_id, metadata, create_accommodation, endpoints, needs_review } = data;
    let accommodationCreated = false;
    // Auto-create accommodation for hotel reservations
    let resolvedAccommodationId = accommodation_id || null;
    if (type === 'hotel' && !resolvedAccommodationId && create_accommodation) {
        const { place_id: accPlaceId, start_day_id, end_day_id, check_in, check_out, confirmation: accConf } = create_accommodation;
        if (start_day_id && end_day_id) {
            const accResult = database_1.db.prepare('INSERT INTO day_accommodations (trip_id, place_id, start_day_id, end_day_id, check_in, check_out, confirmation) VALUES (?, ?, ?, ?, ?, ?, ?)').run(tripId, accPlaceId || null, start_day_id, end_day_id, check_in || null, check_out || null, accConf || confirmation_number || null);
            resolvedAccommodationId = Number(accResult.lastInsertRowid);
            accommodationCreated = true;
        }
    }
    // Derive day_id / end_day_id from reservation_time when the client
    // didn't explicitly set them (non-hotel bookings only — hotels store
    // their date range on the linked day_accommodation).
    const resolvedType = type || 'other';
    let resolvedDayId = day_id ?? null;
    if (resolvedDayId == null && resolvedType !== 'hotel' && reservation_time) {
        resolvedDayId = resolveDayIdFromTime(tripId, reservation_time);
    }
    let resolvedEndDayId = end_day_id ?? null;
    if (resolvedEndDayId == null && resolvedType !== 'hotel' && reservation_end_time) {
        resolvedEndDayId = resolveDayIdFromTime(tripId, reservation_end_time);
    }
    const result = database_1.db.prepare(`
    INSERT INTO reservations (trip_id, day_id, end_day_id, place_id, assignment_id, title, reservation_time, reservation_end_time, location, confirmation_number, notes, status, type, accommodation_id, metadata, needs_review)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tripId, resolvedDayId, resolvedEndDayId, place_id || null, assignment_id || null, title, reservation_time || null, reservation_end_time || null, location || null, confirmation_number || null, notes || null, status || 'pending', resolvedType, resolvedAccommodationId, metadata ? JSON.stringify(metadata) : null, needs_review ? 1 : 0);
    if (endpoints && endpoints.length > 0) {
        saveEndpoints(Number(result.lastInsertRowid), endpoints);
    }
    // Sync check-in/out to accommodation if linked
    if (accommodation_id && metadata) {
        const meta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
        if (meta.check_in_time || meta.check_in_end_time || meta.check_out_time) {
            database_1.db.prepare('UPDATE day_accommodations SET check_in = COALESCE(?, check_in), check_in_end = COALESCE(?, check_in_end), check_out = COALESCE(?, check_out) WHERE id = ?')
                .run(meta.check_in_time || null, meta.check_in_end_time || null, meta.check_out_time || null, accommodation_id);
        }
        if (confirmation_number) {
            database_1.db.prepare('UPDATE day_accommodations SET confirmation = COALESCE(?, confirmation) WHERE id = ?')
                .run(confirmation_number, accommodation_id);
        }
    }
    const reservation = getReservationWithJoins(Number(result.lastInsertRowid));
    return { reservation, accommodationCreated };
}
function updatePositions(tripId, positions, dayId) {
    if (dayId) {
        // Per-day positions for multi-day reservations
        const stmt = database_1.db.prepare('INSERT OR REPLACE INTO reservation_day_positions (reservation_id, day_id, position) VALUES (?, ?, ?)');
        const updateMany = database_1.db.transaction((items) => {
            for (const item of items) {
                stmt.run(item.id, dayId, item.day_plan_position);
            }
        });
        updateMany(positions);
    }
    else {
        // Legacy: update global position
        const stmt = database_1.db.prepare('UPDATE reservations SET day_plan_position = ? WHERE id = ? AND trip_id = ?');
        const updateMany = database_1.db.transaction((items) => {
            for (const item of items) {
                stmt.run(item.day_plan_position, item.id, tripId);
            }
        });
        updateMany(positions);
    }
}
function getReservation(id, tripId) {
    return database_1.db.prepare('SELECT * FROM reservations WHERE id = ? AND trip_id = ?').get(id, tripId);
}
function updateReservation(id, tripId, data, current) {
    const { title, reservation_time, reservation_end_time, location, confirmation_number, notes, day_id, end_day_id, place_id, assignment_id, status, type, accommodation_id, metadata, create_accommodation, endpoints, needs_review } = data;
    let accommodationChanged = false;
    // Update or create accommodation for hotel reservations
    let resolvedAccId = accommodation_id !== undefined ? (accommodation_id || null) : (current.accommodation_id ?? null);
    if (resolvedAccId) {
        const accExists = database_1.db.prepare('SELECT id FROM day_accommodations WHERE id = ?').get(resolvedAccId);
        if (!accExists)
            resolvedAccId = null;
    }
    if (type === 'hotel' && create_accommodation) {
        const { place_id: accPlaceId, start_day_id, end_day_id, check_in, check_out, confirmation: accConf } = create_accommodation;
        if (start_day_id && end_day_id) {
            if (resolvedAccId) {
                database_1.db.prepare('UPDATE day_accommodations SET place_id = ?, start_day_id = ?, end_day_id = ?, check_in = ?, check_out = ?, confirmation = ? WHERE id = ?')
                    .run(accPlaceId || null, start_day_id, end_day_id, check_in || null, check_out || null, accConf || confirmation_number || null, resolvedAccId);
            }
            else if (accPlaceId) {
                const accResult = database_1.db.prepare('INSERT INTO day_accommodations (trip_id, place_id, start_day_id, end_day_id, check_in, check_out, confirmation) VALUES (?, ?, ?, ?, ?, ?, ?)').run(tripId, accPlaceId, start_day_id, end_day_id, check_in || null, check_out || null, accConf || confirmation_number || null);
                resolvedAccId = Number(accResult.lastInsertRowid);
            }
            accommodationChanged = true;
        }
    }
    const resolvedType = (type ?? current.type) || 'other';
    const nextReservationTime = resolvedType === 'hotel'
        ? null
        : (reservation_time !== undefined ? (reservation_time || null) : current.reservation_time);
    const nextReservationEndTime = resolvedType === 'hotel'
        ? null
        : (reservation_end_time !== undefined ? (reservation_end_time || null) : current.reservation_end_time);
    // day_id / end_day_id: honour an explicit value from the client,
    // otherwise derive from the (possibly updated) reservation_time so the
    // planner renders the booking on the correct day.
    let nextDayId;
    if (day_id != null) {
        // Explicit day from the client (e.g. moved on the planner).
        nextDayId = day_id;
    }
    else if (resolvedType !== 'hotel' && nextReservationTime) {
        // No day set but we have a date — pin it to the matching day so the booking
        // still shows in the Plan (covers bookings saved without a selected day, and
        // the case where an earlier edit cleared day_id).
        nextDayId = resolveDayIdFromTime(tripId, nextReservationTime);
    }
    else if (day_id === undefined) {
        // Field absent and nothing to derive from — keep whatever it had.
        nextDayId = current.day_id ?? null;
    }
    else {
        nextDayId = null;
    }
    let nextEndDayId;
    if (end_day_id !== undefined) {
        nextEndDayId = end_day_id ?? null;
    }
    else if (reservation_end_time !== undefined && resolvedType !== 'hotel') {
        nextEndDayId = resolveDayIdFromTime(tripId, nextReservationEndTime);
    }
    else {
        nextEndDayId = current.end_day_id ?? null;
    }
    database_1.db.prepare(`
    UPDATE reservations SET
      title = COALESCE(?, title),
      reservation_time = ?,
      reservation_end_time = ?,
      location = ?,
      confirmation_number = ?,
      notes = ?,
      day_id = ?,
      end_day_id = ?,
      place_id = ?,
      assignment_id = ?,
      status = COALESCE(?, status),
      type = COALESCE(?, type),
      accommodation_id = ?,
      metadata = ?,
      needs_review = COALESCE(?, needs_review)
    WHERE id = ?
  `).run(title || null, nextReservationTime, nextReservationEndTime, location !== undefined ? (location || null) : current.location, confirmation_number !== undefined ? (confirmation_number || null) : current.confirmation_number, notes !== undefined ? (notes || null) : current.notes, nextDayId, nextEndDayId, place_id !== undefined ? (place_id || null) : current.place_id, assignment_id !== undefined ? (assignment_id || null) : current.assignment_id, status || null, type || null, resolvedAccId, metadata !== undefined ? (metadata ? JSON.stringify(metadata) : null) : current.metadata, needs_review === undefined ? null : (needs_review ? 1 : 0), id);
    if (endpoints !== undefined) {
        saveEndpoints(Number(id), endpoints);
    }
    // Sync check-in/out to accommodation if linked
    const resolvedMeta = metadata !== undefined ? metadata : (current.metadata ? JSON.parse(current.metadata) : null);
    if (resolvedAccId && resolvedMeta) {
        const meta = typeof resolvedMeta === 'string' ? JSON.parse(resolvedMeta) : resolvedMeta;
        if (meta.check_in_time || meta.check_in_end_time || meta.check_out_time) {
            database_1.db.prepare('UPDATE day_accommodations SET check_in = COALESCE(?, check_in), check_in_end = COALESCE(?, check_in_end), check_out = COALESCE(?, check_out) WHERE id = ?')
                .run(meta.check_in_time || null, meta.check_in_end_time || null, meta.check_out_time || null, resolvedAccId);
        }
        const resolvedConf = confirmation_number !== undefined ? confirmation_number : current.confirmation_number;
        if (resolvedConf) {
            database_1.db.prepare('UPDATE day_accommodations SET confirmation = COALESCE(?, confirmation) WHERE id = ?')
                .run(resolvedConf, resolvedAccId);
        }
    }
    const reservation = getReservationWithJoins(id);
    return { reservation, accommodationChanged };
}
function deleteReservation(id, tripId) {
    const reservation = database_1.db.prepare('SELECT id, title, type, accommodation_id FROM reservations WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!reservation)
        return { deleted: undefined, accommodationDeleted: false, deletedBudgetItemId: null };
    let accommodationDeleted = false;
    if (reservation.accommodation_id) {
        database_1.db.prepare('DELETE FROM day_accommodations WHERE id = ?').run(reservation.accommodation_id);
        accommodationDeleted = true;
    }
    const linkedBudget = database_1.db.prepare('SELECT id FROM budget_items WHERE trip_id = ? AND reservation_id = ?').get(tripId, id);
    if (linkedBudget) {
        database_1.db.prepare('DELETE FROM budget_items WHERE id = ?').run(linkedBudget.id);
    }
    database_1.db.prepare('DELETE FROM reservations WHERE id = ?').run(id);
    return { deleted: reservation, accommodationDeleted, deletedBudgetItemId: linkedBudget ? linkedBudget.id : null };
}
