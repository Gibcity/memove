"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTripAccess = void 0;
exports.listNotes = listNotes;
exports.dayExists = dayExists;
exports.createNote = createNote;
exports.getNote = getNote;
exports.updateNote = updateNote;
exports.deleteNote = deleteNote;
const database_1 = require("../db/database");
var tripAccess_1 = require("./tripAccess");
Object.defineProperty(exports, "verifyTripAccess", { enumerable: true, get: function () { return tripAccess_1.verifyTripAccess; } });
function listNotes(dayId, tripId) {
    return database_1.db.prepare('SELECT * FROM day_notes WHERE day_id = ? AND trip_id = ? ORDER BY sort_order ASC, created_at ASC').all(dayId, tripId);
}
function dayExists(dayId, tripId) {
    return database_1.db.prepare('SELECT id FROM days WHERE id = ? AND trip_id = ?').get(dayId, tripId);
}
function createNote(dayId, tripId, text, time, icon, sort_order) {
    const result = database_1.db.prepare('INSERT INTO day_notes (day_id, trip_id, text, time, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(dayId, tripId, text.trim(), time || null, icon || '\uD83D\uDCDD', sort_order ?? 9999);
    return database_1.db.prepare('SELECT * FROM day_notes WHERE id = ?').get(result.lastInsertRowid);
}
function getNote(id, dayId, tripId) {
    return database_1.db.prepare('SELECT * FROM day_notes WHERE id = ? AND day_id = ? AND trip_id = ?').get(id, dayId, tripId);
}
function updateNote(id, current, fields) {
    database_1.db.prepare('UPDATE day_notes SET text = ?, time = ?, icon = ?, sort_order = ? WHERE id = ?').run(fields.text !== undefined ? fields.text.trim() : current.text, fields.time !== undefined ? fields.time : current.time, fields.icon !== undefined ? fields.icon : current.icon, fields.sort_order !== undefined ? fields.sort_order : current.sort_order, id);
    return database_1.db.prepare('SELECT * FROM day_notes WHERE id = ?').get(id);
}
function deleteNote(id) {
    database_1.db.prepare('DELETE FROM day_notes WHERE id = ?').run(id);
}
