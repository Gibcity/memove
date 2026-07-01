"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCategories = listCategories;
exports.createCategory = createCategory;
exports.getCategoryById = getCategoryById;
exports.updateCategory = updateCategory;
exports.deleteCategory = deleteCategory;
const database_1 = require("../db/database");
function listCategories() {
    return database_1.db.prepare('SELECT * FROM categories ORDER BY name ASC').all();
}
function createCategory(userId, name, color, icon) {
    const result = database_1.db.prepare('INSERT INTO categories (name, color, icon, user_id) VALUES (?, ?, ?, ?)').run(name, color || '#6366f1', icon || '\uD83D\uDCCD', userId);
    return database_1.db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
}
function getCategoryById(categoryId) {
    return database_1.db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
}
function updateCategory(categoryId, name, color, icon) {
    database_1.db.prepare(`
    UPDATE categories SET
      name = COALESCE(?, name),
      color = COALESCE(?, color),
      icon = COALESCE(?, icon)
    WHERE id = ?
  `).run(name || null, color || null, icon || null, categoryId);
    return database_1.db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
}
function deleteCategory(categoryId) {
    database_1.db.prepare('DELETE FROM categories WHERE id = ?').run(categoryId);
}
