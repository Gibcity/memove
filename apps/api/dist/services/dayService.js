"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DayReorderError = exports.verifyTripAccess = void 0;
exports.getAssignmentsForDay = getAssignmentsForDay;
exports.listDays = listDays;
exports.createDay = createDay;
exports.getDay = getDay;
exports.updateDay = updateDay;
exports.deleteDay = deleteDay;
exports.reorderDays = reorderDays;
exports.insertDay = insertDay;
exports.listAccommodations = listAccommodations;
exports.validateAccommodationRefs = validateAccommodationRefs;
exports.createAccommodation = createAccommodation;
exports.getAccommodation = getAccommodation;
exports.updateAccommodation = updateAccommodation;
exports.deleteAccommodation = deleteAccommodation;
const database_1 = require("../db/database");
const queryHelpers_1 = require("./queryHelpers");
var tripAccess_1 = require("./tripAccess");
Object.defineProperty(exports, "verifyTripAccess", { enumerable: true, get: function () { return tripAccess_1.verifyTripAccess; } });
// ---------------------------------------------------------------------------
// Day assignment helpers
// ---------------------------------------------------------------------------
function getAssignmentsForDay(dayId) {
    const assignments = database_1.db.prepare(`
    SELECT da.*, p.id as place_id, p.name as place_name, p.description as place_description,
      p.lat, p.lng, p.address, p.category_id, p.price, p.currency as place_currency,
      COALESCE(da.assignment_time, p.place_time) as place_time,
      COALESCE(da.assignment_end_time, p.end_time) as end_time,
      p.duration_minutes, p.notes as place_notes,
      p.image_url, p.transport_mode, p.google_place_id, p.website, p.phone,
      c.name as category_name, c.color as category_color, c.icon as category_icon
    FROM day_assignments da
    JOIN places p ON da.place_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE da.day_id = ?
    ORDER BY da.order_index ASC, da.created_at ASC
  `).all(dayId);
    return assignments.map(a => {
        const tags = database_1.db.prepare(`
      SELECT t.* FROM tags t
      JOIN place_tags pt ON t.id = pt.tag_id
      WHERE pt.place_id = ?
    `).all(a.place_id);
        return {
            id: a.id,
            day_id: a.day_id,
            order_index: a.order_index,
            notes: a.notes,
            created_at: a.created_at,
            place: {
                id: a.place_id,
                name: a.place_name,
                description: a.place_description,
                lat: a.lat,
                lng: a.lng,
                address: a.address,
                category_id: a.category_id,
                price: a.price,
                currency: a.place_currency,
                place_time: a.place_time,
                end_time: a.end_time,
                duration_minutes: a.duration_minutes,
                notes: a.place_notes,
                image_url: a.image_url,
                transport_mode: a.transport_mode,
                google_place_id: a.google_place_id,
                website: a.website,
                phone: a.phone,
                category: a.category_id ? {
                    id: a.category_id,
                    name: a.category_name,
                    color: a.category_color,
                    icon: a.category_icon,
                } : null,
                tags,
            }
        };
    });
}
// ---------------------------------------------------------------------------
// Day CRUD
// ---------------------------------------------------------------------------
function listDays(tripId) {
    const days = database_1.db.prepare('SELECT * FROM days WHERE trip_id = ? ORDER BY day_number ASC').all(tripId);
    if (days.length === 0) {
        return { days: [] };
    }
    const dayIds = days.map(d => d.id);
    const dayPlaceholders = dayIds.map(() => '?').join(',');
    const allAssignments = database_1.db.prepare(`
    SELECT da.*, p.id as place_id, p.name as place_name, p.description as place_description,
      p.lat, p.lng, p.address, p.category_id, p.price, p.currency as place_currency,
      COALESCE(da.assignment_time, p.place_time) as place_time,
      COALESCE(da.assignment_end_time, p.end_time) as end_time,
      p.duration_minutes, p.notes as place_notes,
      p.image_url, p.transport_mode, p.google_place_id, p.website, p.phone,
      c.name as category_name, c.color as category_color, c.icon as category_icon
    FROM day_assignments da
    JOIN places p ON da.place_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE da.day_id IN (${dayPlaceholders})
    ORDER BY da.order_index ASC, da.created_at ASC
  `).all(...dayIds);
    const placeIds = [...new Set(allAssignments.map(a => a.place_id))];
    const tagsByPlaceId = (0, queryHelpers_1.loadTagsByPlaceIds)(placeIds, { compact: true });
    const allAssignmentIds = allAssignments.map(a => a.id);
    const participantsByAssignment = (0, queryHelpers_1.loadParticipantsByAssignmentIds)(allAssignmentIds);
    const assignmentsByDayId = {};
    for (const a of allAssignments) {
        if (!assignmentsByDayId[a.day_id])
            assignmentsByDayId[a.day_id] = [];
        assignmentsByDayId[a.day_id].push((0, queryHelpers_1.formatAssignmentWithPlace)(a, tagsByPlaceId[a.place_id] || [], participantsByAssignment[a.id] || []));
    }
    const allNotes = database_1.db.prepare(`SELECT * FROM day_notes WHERE day_id IN (${dayPlaceholders}) ORDER BY sort_order ASC, created_at ASC`).all(...dayIds);
    const notesByDayId = {};
    for (const note of allNotes) {
        if (!notesByDayId[note.day_id])
            notesByDayId[note.day_id] = [];
        notesByDayId[note.day_id].push(note);
    }
    const daysWithAssignments = days.map(day => ({
        ...day,
        assignments: assignmentsByDayId[day.id] || [],
        notes_items: notesByDayId[day.id] || [],
    }));
    return { days: daysWithAssignments };
}
function createDay(tripId, date, notes) {
    const maxDay = database_1.db.prepare('SELECT MAX(day_number) as max FROM days WHERE trip_id = ?').get(tripId);
    const dayNumber = (maxDay.max || 0) + 1;
    const result = database_1.db.prepare('INSERT INTO days (trip_id, day_number, date, notes) VALUES (?, ?, ?, ?)').run(tripId, dayNumber, date || null, notes || null);
    const day = database_1.db.prepare('SELECT * FROM days WHERE id = ?').get(result.lastInsertRowid);
    return { ...day, assignments: [] };
}
function getDay(id, tripId) {
    return database_1.db.prepare('SELECT * FROM days WHERE id = ? AND trip_id = ?').get(id, tripId);
}
function updateDay(id, current, fields) {
    database_1.db.prepare('UPDATE days SET notes = ?, title = ? WHERE id = ?').run(fields.notes || null, 'title' in fields ? (fields.title ?? null) : current.title, id);
    const updatedDay = database_1.db.prepare('SELECT * FROM days WHERE id = ?').get(id);
    return { ...updatedDay, assignments: getAssignmentsForDay(id) };
}
function deleteDay(id) {
    database_1.db.prepare('DELETE FROM days WHERE id = ?').run(id);
}
// ---------------------------------------------------------------------------
// Day reorder / insert (#589)
//
// Reordering keeps every day ROW stable (so assignments, notes, accommodations,
// photos and multi-day reservation positions ride along by id) and only changes
// each row's day_number — its position. On a dated trip the calendar dates stay
// pinned to their slots (position i keeps the i-th date) and the day's content
// moves across them. Because a booking's day is derived from the date part of
// reservation_time, every booking on a day whose date changed gets that date
// re-stamped onto the day's new date (time-of-day preserved), so day_id stays
// consistent and the booking moves with its day.
// ---------------------------------------------------------------------------
const MS_PER_DAY = 24 * 60 * 60 * 1000;
function addDays(date, n) {
    const [y, m, d] = date.split('-').map(Number);
    const t = Date.UTC(y, m - 1, d) + n * MS_PER_DAY;
    const dt = new Date(t);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
function dayDelta(from, to) {
    const [fy, fm, fd] = from.split('-').map(Number);
    const [ty, tm, td] = to.split('-').map(Number);
    return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / MS_PER_DAY);
}
/** Replace the date part of an ISO-ish timestamp, keeping any time suffix. */
function withDatePart(timestamp, date) {
    return date + (timestamp.length > 10 ? timestamp.slice(10) : '');
}
/**
 * After day dates have been re-pinned, re-stamp the date of every booking on a
 * moved day so reservation_time/reservation_end_time follow their day's new
 * date (time-of-day preserved). Transport endpoints (flight legs) shift by the
 * same per-booking day delta so multi-leg timing stays internally consistent.
 */
function restampReservationDates(tripId, oldDateById, newDateById) {
    const reservations = database_1.db.prepare('SELECT id, day_id, end_day_id, reservation_time, reservation_end_time FROM reservations WHERE trip_id = ?').all(tripId);
    const setTime = database_1.db.prepare('UPDATE reservations SET reservation_time = ? WHERE id = ?');
    const setEndTime = database_1.db.prepare('UPDATE reservations SET reservation_end_time = ? WHERE id = ?');
    const endpoints = database_1.db.prepare('SELECT id, local_date FROM reservation_endpoints WHERE reservation_id = ?');
    const setEndpointDate = database_1.db.prepare('UPDATE reservation_endpoints SET local_date = ? WHERE id = ?');
    for (const r of reservations) {
        if (r.day_id != null && r.reservation_time) {
            const oldDate = oldDateById.get(r.day_id);
            const newDate = newDateById.get(r.day_id);
            if (oldDate && newDate && oldDate !== newDate) {
                setTime.run(withDatePart(r.reservation_time, newDate), r.id);
                // Shift each transport leg's local_date by the same number of days.
                const delta = dayDelta(oldDate, newDate);
                if (delta !== 0) {
                    for (const ep of endpoints.all(r.id)) {
                        if (ep.local_date)
                            setEndpointDate.run(addDays(ep.local_date, delta), ep.id);
                    }
                }
            }
        }
        if (r.end_day_id != null && r.reservation_end_time) {
            const oldDate = oldDateById.get(r.end_day_id);
            const newDate = newDateById.get(r.end_day_id);
            if (oldDate && newDate && oldDate !== newDate) {
                setEndTime.run(withDatePart(r.reservation_end_time, newDate), r.id);
            }
        }
    }
}
/** A stay must not end before it begins after a reorder/insert. */
function assertNoInvertedAccommodation(tripId) {
    const spans = database_1.db.prepare(`
    SELECT a.id, s.day_number AS start_no, e.day_number AS end_no
    FROM day_accommodations a
    JOIN days s ON a.start_day_id = s.id
    JOIN days e ON a.end_day_id = e.id
    WHERE a.trip_id = ?
  `).all(tripId);
    for (const span of spans) {
        if (span.start_no > span.end_no) {
            throw new DayReorderError('This move would make an accommodation end before it starts.');
        }
    }
}
/** Thrown for invalid reorder/insert requests; mapped to HTTP 400 by the controller. */
class DayReorderError extends Error {
}
exports.DayReorderError = DayReorderError;
/**
 * Reorder whole days. `orderedIds` is the desired full sequence of this trip's
 * day ids (a permutation of the current ids).
 */
function reorderDays(tripId, orderedIds) {
    const rows = database_1.db.prepare('SELECT id, day_number, date FROM days WHERE trip_id = ? ORDER BY day_number').all(tripId);
    const existingIds = new Set(rows.map(r => r.id));
    if (orderedIds.length !== rows.length || !orderedIds.every(id => existingIds.has(id))) {
        throw new DayReorderError('orderedIds must be a permutation of the trip day ids.');
    }
    const oldDateById = new Map(rows.map(r => [r.id, r.date]));
    // Dates stay pinned to slots: position i keeps the i-th date (ascending).
    const sortedDates = rows.map(r => r.date).filter((d) => !!d).sort();
    const isDated = sortedDates.length > 0;
    const setDayNumber = database_1.db.prepare('UPDATE days SET day_number = ? WHERE id = ?');
    const setDayNumberAndDate = database_1.db.prepare('UPDATE days SET day_number = ?, date = ? WHERE id = ?');
    database_1.db.exec('BEGIN');
    try {
        // Two-phase renumber to dodge UNIQUE(trip_id, day_number) collisions.
        orderedIds.forEach((id, i) => setDayNumber.run(-(i + 1), id));
        const newDateById = new Map();
        orderedIds.forEach((id, i) => {
            const date = isDated ? (sortedDates[i] ?? null) : null;
            setDayNumberAndDate.run(i + 1, date, id);
            newDateById.set(id, date);
        });
        if (isDated)
            restampReservationDates(tripId, oldDateById, newDateById);
        assertNoInvertedAccommodation(tripId);
        database_1.db.exec('COMMIT');
    }
    catch (e) {
        database_1.db.exec('ROLLBACK');
        throw e;
    }
    return listDays(tripId);
}
/**
 * Insert a new empty day at a 1-based position (default: append at the end).
 * On a dated trip the trip gains one calendar day: dates re-pin so the slots
 * stay contiguous, the trip's end_date extends by one day, and bookings on
 * shifted days have their dates re-stamped (same rules as reorderDays).
 */
function insertDay(tripId, position) {
    const rows = database_1.db.prepare('SELECT id, day_number, date FROM days WHERE trip_id = ? ORDER BY day_number').all(tripId);
    const n = rows.length;
    const pos = Math.min(Math.max(position ?? n + 1, 1), n + 1);
    const datedRows = rows.filter(r => r.date);
    const isDated = datedRows.length > 0;
    const setDayNumber = database_1.db.prepare('UPDATE days SET day_number = ? WHERE id = ?');
    if (!isDated) {
        database_1.db.exec('BEGIN');
        try {
            const toShift = rows.filter(r => r.day_number >= pos);
            toShift.forEach(r => setDayNumber.run(-r.day_number, r.id));
            const result = database_1.db.prepare('INSERT INTO days (trip_id, day_number, date) VALUES (?, ?, NULL)').run(tripId, pos);
            toShift.forEach(r => setDayNumber.run(r.day_number + 1, r.id));
            database_1.db.exec('COMMIT');
            const day = database_1.db.prepare('SELECT * FROM days WHERE id = ?').get(result.lastInsertRowid);
            return { ...day, assignments: [], notes_items: [] };
        }
        catch (e) {
            database_1.db.exec('ROLLBACK');
            throw e;
        }
    }
    // Dated trip: rebuild N+1 contiguous dates from the earliest date.
    const start = datedRows.map(r => r.date).sort()[0];
    const dates = Array.from({ length: n + 1 }, (_, i) => addDays(start, i));
    const oldDateById = new Map(rows.map(r => [r.id, r.date]));
    const setDayNumberAndDate = database_1.db.prepare('UPDATE days SET day_number = ?, date = ? WHERE id = ?');
    database_1.db.exec('BEGIN');
    try {
        rows.forEach((r, i) => setDayNumber.run(-(i + 1), r.id));
        const result = database_1.db.prepare('INSERT INTO days (trip_id, day_number, date) VALUES (?, ?, ?)').run(tripId, pos, dates[pos - 1]);
        const newId = Number(result.lastInsertRowid);
        const orderedIds = rows.map(r => r.id);
        orderedIds.splice(pos - 1, 0, newId);
        const newDateById = new Map();
        orderedIds.forEach((id, i) => {
            setDayNumberAndDate.run(i + 1, dates[i], id);
            newDateById.set(id, dates[i]);
        });
        restampReservationDates(tripId, oldDateById, newDateById);
        assertNoInvertedAccommodation(tripId);
        database_1.db.prepare('UPDATE trips SET end_date = ? WHERE id = ?').run(dates[dates.length - 1], tripId);
        database_1.db.exec('COMMIT');
        const day = database_1.db.prepare('SELECT * FROM days WHERE id = ?').get(newId);
        return { ...day, assignments: [], notes_items: [] };
    }
    catch (e) {
        database_1.db.exec('ROLLBACK');
        throw e;
    }
}
function getAccommodationWithPlace(id) {
    return database_1.db.prepare(`
    SELECT a.*, p.name as place_name, p.address as place_address, p.image_url as place_image, p.lat as place_lat, p.lng as place_lng
    FROM day_accommodations a
    LEFT JOIN places p ON a.place_id = p.id
    WHERE a.id = ?
  `).get(id);
}
// ---------------------------------------------------------------------------
// Accommodation CRUD
// ---------------------------------------------------------------------------
function listAccommodations(tripId) {
    return database_1.db.prepare(`
    SELECT a.*, p.name as place_name, p.address as place_address, p.image_url as place_image, p.lat as place_lat, p.lng as place_lng,
           r.title as reservation_title
    FROM day_accommodations a
    LEFT JOIN places p ON a.place_id = p.id
    LEFT JOIN reservations r ON r.accommodation_id = a.id
    WHERE a.trip_id = ?
    ORDER BY a.created_at ASC
  `).all(tripId);
}
function validateAccommodationRefs(tripId, placeId, startDayId, endDayId) {
    const errors = [];
    if (placeId !== undefined) {
        const place = database_1.db.prepare('SELECT id FROM places WHERE id = ? AND trip_id = ?').get(placeId, tripId);
        if (!place)
            errors.push({ field: 'place_id', message: 'Place not found' });
    }
    if (startDayId !== undefined) {
        const startDay = database_1.db.prepare('SELECT id FROM days WHERE id = ? AND trip_id = ?').get(startDayId, tripId);
        if (!startDay)
            errors.push({ field: 'start_day_id', message: 'Start day not found' });
    }
    if (endDayId !== undefined) {
        const endDay = database_1.db.prepare('SELECT id FROM days WHERE id = ? AND trip_id = ?').get(endDayId, tripId);
        if (!endDay)
            errors.push({ field: 'end_day_id', message: 'End day not found' });
    }
    return errors;
}
function createAccommodation(tripId, data) {
    const { place_id, start_day_id, end_day_id, check_in, check_in_end, check_out, confirmation, notes } = data;
    const result = database_1.db.prepare('INSERT INTO day_accommodations (trip_id, place_id, start_day_id, end_day_id, check_in, check_in_end, check_out, confirmation, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(tripId, place_id, start_day_id, end_day_id, check_in || null, check_in_end || null, check_out || null, confirmation || null, notes || null);
    const accommodationId = result.lastInsertRowid;
    // Auto-create linked reservation for this accommodation
    const placeName = database_1.db.prepare('SELECT name FROM places WHERE id = ?').get(place_id)?.name || 'Hotel';
    const startDayDate = database_1.db.prepare('SELECT date FROM days WHERE id = ?').get(start_day_id)?.date || null;
    const meta = {};
    if (check_in)
        meta.check_in_time = check_in;
    if (check_in_end)
        meta.check_in_end_time = check_in_end;
    if (check_out)
        meta.check_out_time = check_out;
    database_1.db.prepare(`
    INSERT INTO reservations (trip_id, day_id, title, reservation_time, location, confirmation_number, notes, status, type, accommodation_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', 'hotel', ?, ?)
  `).run(tripId, start_day_id, placeName, startDayDate || null, null, confirmation || null, notes || null, accommodationId, Object.keys(meta).length > 0 ? JSON.stringify(meta) : null);
    return getAccommodationWithPlace(accommodationId);
}
function getAccommodation(id, tripId) {
    return database_1.db.prepare('SELECT * FROM day_accommodations WHERE id = ? AND trip_id = ?').get(id, tripId);
}
function updateAccommodation(id, existing, fields) {
    const newPlaceId = fields.place_id !== undefined ? fields.place_id : existing.place_id;
    const newStartDayId = fields.start_day_id !== undefined ? fields.start_day_id : existing.start_day_id;
    const newEndDayId = fields.end_day_id !== undefined ? fields.end_day_id : existing.end_day_id;
    const newCheckIn = fields.check_in !== undefined ? fields.check_in : existing.check_in;
    const newCheckInEnd = fields.check_in_end !== undefined ? fields.check_in_end : existing.check_in_end;
    const newCheckOut = fields.check_out !== undefined ? fields.check_out : existing.check_out;
    const newConfirmation = fields.confirmation !== undefined ? fields.confirmation : existing.confirmation;
    const newNotes = fields.notes !== undefined ? fields.notes : existing.notes;
    database_1.db.prepare('UPDATE day_accommodations SET place_id = ?, start_day_id = ?, end_day_id = ?, check_in = ?, check_in_end = ?, check_out = ?, confirmation = ?, notes = ? WHERE id = ?').run(newPlaceId, newStartDayId, newEndDayId, newCheckIn, newCheckInEnd, newCheckOut, newConfirmation, newNotes, id);
    // Sync check-in/out/confirmation to linked reservation
    const linkedRes = database_1.db.prepare('SELECT id, metadata FROM reservations WHERE accommodation_id = ?').get(Number(id));
    if (linkedRes) {
        const meta = linkedRes.metadata ? JSON.parse(linkedRes.metadata) : {};
        if (newCheckIn)
            meta.check_in_time = newCheckIn;
        if (newCheckInEnd)
            meta.check_in_end_time = newCheckInEnd;
        if (newCheckOut)
            meta.check_out_time = newCheckOut;
        database_1.db.prepare('UPDATE reservations SET metadata = ?, confirmation_number = COALESCE(?, confirmation_number) WHERE id = ?')
            .run(JSON.stringify(meta), newConfirmation || null, linkedRes.id);
    }
    return getAccommodationWithPlace(Number(id));
}
/** Delete accommodation and its linked reservation (and any linked budget item). */
function deleteAccommodation(id) {
    const linkedRes = database_1.db.prepare('SELECT id FROM reservations WHERE accommodation_id = ?').get(Number(id));
    let deletedBudgetItemId = null;
    if (linkedRes) {
        const linkedBudget = database_1.db.prepare('SELECT id FROM budget_items WHERE reservation_id = ?').get(linkedRes.id);
        if (linkedBudget) {
            database_1.db.prepare('DELETE FROM budget_items WHERE id = ?').run(linkedBudget.id);
            deletedBudgetItemId = linkedBudget.id;
        }
        database_1.db.prepare('DELETE FROM reservations WHERE id = ?').run(linkedRes.id);
    }
    database_1.db.prepare('DELETE FROM day_accommodations WHERE id = ?').run(id);
    return { linkedReservationId: linkedRes ? linkedRes.id : null, deletedBudgetItemId };
}
