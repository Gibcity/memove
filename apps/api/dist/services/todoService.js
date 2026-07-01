"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTripAccess = void 0;
exports.listItems = listItems;
exports.createItem = createItem;
exports.updateItem = updateItem;
exports.deleteItem = deleteItem;
exports.getCategoryAssignees = getCategoryAssignees;
exports.updateCategoryAssignees = updateCategoryAssignees;
exports.reorderItems = reorderItems;
const database_1 = require("../db/database");
var tripAccess_1 = require("./tripAccess");
Object.defineProperty(exports, "verifyTripAccess", { enumerable: true, get: function () { return tripAccess_1.verifyTripAccess; } });
// ── Items ──────────────────────────────────────────────────────────────────
function listItems(tripId) {
    return database_1.db.prepare('SELECT * FROM todo_items WHERE trip_id = ? ORDER BY sort_order ASC, created_at ASC').all(tripId);
}
function createItem(tripId, data) {
    const maxOrder = database_1.db.prepare('SELECT MAX(sort_order) as max FROM todo_items WHERE trip_id = ?').get(tripId);
    const sortOrder = (maxOrder.max !== null ? maxOrder.max : -1) + 1;
    const result = database_1.db.prepare('INSERT INTO todo_items (trip_id, name, checked, category, sort_order, due_date, description, assigned_user_id, priority) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?)').run(tripId, data.name, data.category || null, sortOrder, data.due_date || null, data.description || null, data.assigned_user_id || null, data.priority || 0);
    return database_1.db.prepare('SELECT * FROM todo_items WHERE id = ?').get(result.lastInsertRowid);
}
function updateItem(tripId, id, data, bodyKeys) {
    const item = database_1.db.prepare('SELECT * FROM todo_items WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!item)
        return null;
    database_1.db.prepare(`
    UPDATE todo_items SET
      name = COALESCE(?, name),
      checked = CASE WHEN ? IS NOT NULL THEN ? ELSE checked END,
      category = COALESCE(?, category),
      due_date = CASE WHEN ? THEN ? ELSE due_date END,
      description = CASE WHEN ? THEN ? ELSE description END,
      assigned_user_id = CASE WHEN ? THEN ? ELSE assigned_user_id END,
      priority = CASE WHEN ? THEN ? ELSE priority END
    WHERE id = ?
  `).run(data.name || null, data.checked !== undefined ? 1 : null, data.checked ? 1 : 0, data.category || null, bodyKeys.includes('due_date') ? 1 : 0, data.due_date ?? null, bodyKeys.includes('description') ? 1 : 0, data.description ?? null, bodyKeys.includes('assigned_user_id') ? 1 : 0, data.assigned_user_id ?? null, bodyKeys.includes('priority') ? 1 : 0, data.priority ?? 0, id);
    return database_1.db.prepare('SELECT * FROM todo_items WHERE id = ?').get(id);
}
function deleteItem(tripId, id) {
    const item = database_1.db.prepare('SELECT id FROM todo_items WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!item)
        return false;
    database_1.db.prepare('DELETE FROM todo_items WHERE id = ?').run(id);
    return true;
}
// ── Category Assignees ─────────────────────────────────────────────────────
function getCategoryAssignees(tripId) {
    const rows = database_1.db.prepare(`
    SELECT tca.category_name, tca.user_id, u.username, u.avatar
    FROM todo_category_assignees tca
    JOIN users u ON tca.user_id = u.id
    WHERE tca.trip_id = ?
  `).all(tripId);
    const assignees = {};
    for (const row of rows) {
        if (!assignees[row.category_name])
            assignees[row.category_name] = [];
        assignees[row.category_name].push({ user_id: row.user_id, username: row.username, avatar: row.avatar });
    }
    return assignees;
}
function updateCategoryAssignees(tripId, categoryName, userIds) {
    database_1.db.prepare('DELETE FROM todo_category_assignees WHERE trip_id = ? AND category_name = ?').run(tripId, categoryName);
    if (Array.isArray(userIds) && userIds.length > 0) {
        const insert = database_1.db.prepare('INSERT OR IGNORE INTO todo_category_assignees (trip_id, category_name, user_id) VALUES (?, ?, ?)');
        for (const uid of userIds)
            insert.run(tripId, categoryName, uid);
    }
    return database_1.db.prepare(`
    SELECT tca.user_id, u.username, u.avatar
    FROM todo_category_assignees tca
    JOIN users u ON tca.user_id = u.id
    WHERE tca.trip_id = ? AND tca.category_name = ?
  `).all(tripId, categoryName);
}
// ── Reorder ────────────────────────────────────────────────────────────────
function reorderItems(tripId, orderedIds) {
    const update = database_1.db.prepare('UPDATE todo_items SET sort_order = ? WHERE id = ? AND trip_id = ?');
    const updateMany = database_1.db.transaction((ids) => {
        ids.forEach((id, index) => {
            update.run(index, id, tripId);
        });
    });
    updateMany(orderedIds);
}
