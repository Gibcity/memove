"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listTags = listTags;
exports.createTag = createTag;
exports.getTagByIdAndUser = getTagByIdAndUser;
exports.updateTag = updateTag;
exports.deleteTag = deleteTag;
const database_1 = require("../db/database");
function listTags(userId) {
    return database_1.db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC').all(userId);
}
function createTag(userId, name, color) {
    const result = database_1.db.prepare('INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)').run(userId, name, color || '#10b981');
    return database_1.db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid);
}
function getTagByIdAndUser(tagId, userId) {
    return database_1.db.prepare('SELECT * FROM tags WHERE id = ? AND user_id = ?').get(tagId, userId);
}
function updateTag(tagId, name, color) {
    database_1.db.prepare('UPDATE tags SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?')
        .run(name || null, color || null, tagId);
    return database_1.db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId);
}
function deleteTag(tagId) {
    database_1.db.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
}
