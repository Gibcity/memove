"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAssignmentWithPlace = getAssignmentWithPlace;
exports.listDayAssignments = listDayAssignments;
exports.dayExists = dayExists;
exports.placeExists = placeExists;
exports.createAssignment = createAssignment;
exports.assignmentExistsInDay = assignmentExistsInDay;
exports.deleteAssignment = deleteAssignment;
exports.reorderAssignments = reorderAssignments;
exports.getAssignmentForTrip = getAssignmentForTrip;
exports.moveAssignment = moveAssignment;
exports.getParticipants = getParticipants;
exports.updateTime = updateTime;
exports.setParticipants = setParticipants;
const database_1 = require("../db/database");
const queryHelpers_1 = require("./queryHelpers");
function getAssignmentWithPlace(assignmentId) {
    const a = database_1.db.prepare(`
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
    WHERE da.id = ?
  `).get(assignmentId);
    if (!a)
        return null;
    const tags = database_1.db.prepare(`
    SELECT t.* FROM tags t
    JOIN place_tags pt ON t.id = pt.tag_id
    WHERE pt.place_id = ?
  `).all(a.place_id);
    const participants = database_1.db.prepare(`
    SELECT ap.user_id, u.username, u.avatar
    FROM assignment_participants ap
    JOIN users u ON ap.user_id = u.id
    WHERE ap.assignment_id = ?
  `).all(a.id);
    return {
        id: a.id,
        day_id: a.day_id,
        place_id: a.place_id,
        order_index: a.order_index,
        notes: a.notes,
        assignment_time: a.assignment_time ?? null,
        assignment_end_time: a.assignment_end_time ?? null,
        participants,
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
}
function listDayAssignments(dayId) {
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
    const placeIds = [...new Set(assignments.map(a => a.place_id))];
    const tagsByPlaceId = (0, queryHelpers_1.loadTagsByPlaceIds)(placeIds, { compact: true });
    const assignmentIds = assignments.map(a => a.id);
    const participantsByAssignment = (0, queryHelpers_1.loadParticipantsByAssignmentIds)(assignmentIds);
    return assignments.map(a => {
        return (0, queryHelpers_1.formatAssignmentWithPlace)(a, tagsByPlaceId[a.place_id] || [], participantsByAssignment[a.id] || []);
    });
}
function dayExists(dayId, tripId) {
    return !!database_1.db.prepare('SELECT id FROM days WHERE id = ? AND trip_id = ?').get(dayId, tripId);
}
function placeExists(placeId, tripId) {
    return !!database_1.db.prepare('SELECT id FROM places WHERE id = ? AND trip_id = ?').get(placeId, tripId);
}
function createAssignment(dayId, placeId, notes) {
    const maxOrder = database_1.db.prepare('SELECT MAX(order_index) as max FROM day_assignments WHERE day_id = ?').get(dayId);
    const orderIndex = (maxOrder.max !== null ? maxOrder.max : -1) + 1;
    const result = database_1.db.prepare('INSERT INTO day_assignments (day_id, place_id, order_index, notes) VALUES (?, ?, ?, ?)').run(dayId, placeId, orderIndex, notes || null);
    return getAssignmentWithPlace(result.lastInsertRowid);
}
function assignmentExistsInDay(id, dayId, tripId) {
    return !!database_1.db.prepare('SELECT da.id FROM day_assignments da JOIN days d ON da.day_id = d.id WHERE da.id = ? AND da.day_id = ? AND d.trip_id = ?').get(id, dayId, tripId);
}
function deleteAssignment(id) {
    database_1.db.prepare('DELETE FROM day_assignments WHERE id = ?').run(id);
}
function reorderAssignments(dayId, orderedIds) {
    const update = database_1.db.prepare('UPDATE day_assignments SET order_index = ? WHERE id = ? AND day_id = ?');
    database_1.db.exec('BEGIN');
    try {
        orderedIds.forEach((id, index) => {
            update.run(index, id, dayId);
        });
        database_1.db.exec('COMMIT');
    }
    catch (e) {
        database_1.db.exec('ROLLBACK');
        throw e;
    }
}
function getAssignmentForTrip(id, tripId) {
    return database_1.db.prepare(`
    SELECT da.* FROM day_assignments da
    JOIN days d ON da.day_id = d.id
    WHERE da.id = ? AND d.trip_id = ?
  `).get(id, tripId);
}
function moveAssignment(id, newDayId, orderIndex, oldDayId) {
    database_1.db.prepare('UPDATE day_assignments SET day_id = ?, order_index = ? WHERE id = ?').run(newDayId, orderIndex || 0, id);
    const updated = getAssignmentWithPlace(Number(id));
    return { assignment: updated, oldDayId };
}
function getParticipants(assignmentId) {
    return database_1.db.prepare(`
    SELECT ap.user_id, u.username, u.avatar
    FROM assignment_participants ap
    JOIN users u ON ap.user_id = u.id
    WHERE ap.assignment_id = ?
  `).all(assignmentId);
}
function updateTime(id, placeTime, endTime) {
    database_1.db.prepare('UPDATE day_assignments SET assignment_time = ?, assignment_end_time = ? WHERE id = ?')
        .run(placeTime ?? null, endTime ?? null, id);
    // Auto-sort: reorder timed assignments chronologically within the day
    if (placeTime) {
        const assignment = database_1.db.prepare('SELECT day_id FROM day_assignments WHERE id = ?').get(id);
        if (assignment) {
            const dayAssignments = database_1.db.prepare(`
        SELECT da.id, COALESCE(da.assignment_time, p.place_time) as effective_time
        FROM day_assignments da
        JOIN places p ON da.place_id = p.id
        WHERE da.day_id = ?
        ORDER BY da.order_index ASC
      `).all(assignment.day_id);
            // Separate timed and untimed, sort timed by time
            const timed = dayAssignments.filter(a => a.effective_time).sort((a, b) => {
                const ta = a.effective_time.includes(':') ? a.effective_time : '99:99';
                const tb = b.effective_time.includes(':') ? b.effective_time : '99:99';
                return ta.localeCompare(tb);
            });
            const untimed = dayAssignments.filter(a => !a.effective_time);
            // Interleave: timed in chronological order, untimed keep relative position
            const reordered = [...timed, ...untimed];
            const update = database_1.db.prepare('UPDATE day_assignments SET order_index = ? WHERE id = ?');
            reordered.forEach((a, i) => update.run(i, a.id));
        }
    }
    return getAssignmentWithPlace(Number(id));
}
function setParticipants(assignmentId, userIds) {
    database_1.db.prepare('DELETE FROM assignment_participants WHERE assignment_id = ?').run(assignmentId);
    if (userIds.length > 0) {
        const insert = database_1.db.prepare('INSERT OR IGNORE INTO assignment_participants (assignment_id, user_id) VALUES (?, ?)');
        for (const userId of userIds)
            insert.run(assignmentId, userId);
    }
    return database_1.db.prepare(`
    SELECT ap.user_id, u.username, u.avatar
    FROM assignment_participants ap
    JOIN users u ON ap.user_id = u.id
    WHERE ap.assignment_id = ?
  `).all(assignmentId);
}
