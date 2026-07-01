"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTripAccess = void 0;
exports.listItems = listItems;
exports.createItem = createItem;
exports.updateItem = updateItem;
exports.deleteItem = deleteItem;
exports.bulkImport = bulkImport;
exports.listBags = listBags;
exports.setBagMembers = setBagMembers;
exports.createBag = createBag;
exports.updateBag = updateBag;
exports.deleteBag = deleteBag;
exports.listTemplates = listTemplates;
exports.applyTemplate = applyTemplate;
exports.saveAsTemplate = saveAsTemplate;
exports.getCategoryAssignees = getCategoryAssignees;
exports.updateCategoryAssignees = updateCategoryAssignees;
exports.reorderItems = reorderItems;
const database_1 = require("../db/database");
const avatarUrl_1 = require("./avatarUrl");
const BAG_COLORS = ['#6366f1', '#ec4899', '#f97316', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444', '#f59e0b', '#3b82f6', '#84cc16', '#d946ef', '#14b8a6', '#f43f5e', '#a855f7', '#eab308', '#64748b'];
var tripAccess_1 = require("./tripAccess");
Object.defineProperty(exports, "verifyTripAccess", { enumerable: true, get: function () { return tripAccess_1.verifyTripAccess; } });
// ── Items ──────────────────────────────────────────────────────────────────
function listItems(tripId) {
    return database_1.db.prepare('SELECT * FROM packing_items WHERE trip_id = ? ORDER BY sort_order ASC, created_at ASC').all(tripId);
}
function createItem(tripId, data) {
    const maxOrder = database_1.db.prepare('SELECT MAX(sort_order) as max FROM packing_items WHERE trip_id = ?').get(tripId);
    const sortOrder = (maxOrder.max !== null ? maxOrder.max : -1) + 1;
    const qty = Math.max(1, Math.min(999, Number(data.quantity) || 1));
    const result = database_1.db.prepare('INSERT INTO packing_items (trip_id, name, checked, category, sort_order, quantity) VALUES (?, ?, ?, ?, ?, ?)').run(tripId, data.name, data.checked ? 1 : 0, data.category || 'Allgemein', sortOrder, qty);
    return database_1.db.prepare('SELECT * FROM packing_items WHERE id = ?').get(result.lastInsertRowid);
}
function updateItem(tripId, id, data, bodyKeys) {
    const item = database_1.db.prepare('SELECT * FROM packing_items WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!item)
        return null;
    database_1.db.prepare(`
    UPDATE packing_items SET
      name = COALESCE(?, name),
      checked = CASE WHEN ? IS NOT NULL THEN ? ELSE checked END,
      category = COALESCE(?, category),
      weight_grams = CASE WHEN ? THEN ? ELSE weight_grams END,
      bag_id = CASE WHEN ? THEN ? ELSE bag_id END,
      quantity = CASE WHEN ? THEN ? ELSE quantity END
    WHERE id = ?
  `).run(data.name || null, data.checked !== undefined ? 1 : null, data.checked ? 1 : 0, data.category || null, bodyKeys.includes('weight_grams') ? 1 : 0, data.weight_grams ?? null, bodyKeys.includes('bag_id') ? 1 : 0, data.bag_id ?? null, bodyKeys.includes('quantity') ? 1 : 0, data.quantity ? Math.max(1, Math.min(999, Number(data.quantity))) : 1, id);
    return database_1.db.prepare('SELECT * FROM packing_items WHERE id = ?').get(id);
}
function deleteItem(tripId, id) {
    const item = database_1.db.prepare('SELECT id FROM packing_items WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!item)
        return false;
    database_1.db.prepare('DELETE FROM packing_items WHERE id = ?').run(id);
    return true;
}
function bulkImport(tripId, items) {
    const maxOrder = database_1.db.prepare('SELECT MAX(sort_order) as max FROM packing_items WHERE trip_id = ?').get(tripId);
    let sortOrder = (maxOrder.max !== null ? maxOrder.max : -1) + 1;
    const stmt = database_1.db.prepare('INSERT INTO packing_items (trip_id, name, checked, category, weight_grams, bag_id, sort_order, quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const created = [];
    const insertAll = database_1.db.transaction(() => {
        for (const item of items) {
            if (!item.name?.trim())
                continue;
            const checked = item.checked ? 1 : 0;
            const weight = item.weight_grams ? parseInt(String(item.weight_grams)) || null : null;
            // Resolve bag by name if provided
            let bagId = null;
            if (item.bag?.trim()) {
                const bagName = item.bag.trim();
                const existing = database_1.db.prepare('SELECT id FROM packing_bags WHERE trip_id = ? AND name = ?').get(tripId, bagName);
                if (existing) {
                    bagId = existing.id;
                }
                else {
                    const bagCount = database_1.db.prepare('SELECT COUNT(*) as c FROM packing_bags WHERE trip_id = ?').get(tripId).c;
                    const newBag = database_1.db.prepare('INSERT INTO packing_bags (trip_id, name, color) VALUES (?, ?, ?)').run(tripId, bagName, BAG_COLORS[bagCount % BAG_COLORS.length]);
                    bagId = newBag.lastInsertRowid;
                }
            }
            const qty = Math.max(1, Math.min(999, Number(item.quantity) || 1));
            const result = stmt.run(tripId, item.name.trim(), checked, item.category?.trim() || 'Other', weight, bagId, sortOrder++, qty);
            created.push(database_1.db.prepare('SELECT * FROM packing_items WHERE id = ?').get(result.lastInsertRowid));
        }
    });
    insertAll();
    return created;
}
// ── Bags ───────────────────────────────────────────────────────────────────
function listBags(tripId) {
    const bags = database_1.db.prepare('SELECT * FROM packing_bags WHERE trip_id = ? ORDER BY sort_order, id').all(tripId);
    const members = database_1.db.prepare(`
    SELECT bm.bag_id, bm.user_id, u.username, u.avatar
    FROM packing_bag_members bm
    JOIN users u ON bm.user_id = u.id
    JOIN packing_bags b ON bm.bag_id = b.id
    WHERE b.trip_id = ?
  `).all(tripId);
    const membersByBag = new Map();
    for (const m of members) {
        if (!membersByBag.has(m.bag_id))
            membersByBag.set(m.bag_id, []);
        membersByBag.get(m.bag_id).push(m);
    }
    return bags.map(b => ({
        ...b,
        members: (membersByBag.get(b.id) || []).map(m => ({ ...m, avatar: (0, avatarUrl_1.avatarUrl)(m) })),
    }));
}
function setBagMembers(tripId, bagId, userIds) {
    const bag = database_1.db.prepare('SELECT * FROM packing_bags WHERE id = ? AND trip_id = ?').get(bagId, tripId);
    if (!bag)
        return null;
    database_1.db.prepare('DELETE FROM packing_bag_members WHERE bag_id = ?').run(bagId);
    const ins = database_1.db.prepare('INSERT OR IGNORE INTO packing_bag_members (bag_id, user_id) VALUES (?, ?)');
    for (const uid of userIds)
        ins.run(bagId, uid);
    const rows = database_1.db.prepare(`
    SELECT bm.user_id, u.username, u.avatar
    FROM packing_bag_members bm JOIN users u ON bm.user_id = u.id
    WHERE bm.bag_id = ?
  `).all(bagId);
    return rows.map(m => ({ ...m, avatar: (0, avatarUrl_1.avatarUrl)(m) }));
}
function createBag(tripId, data) {
    const maxOrder = database_1.db.prepare('SELECT MAX(sort_order) as max FROM packing_bags WHERE trip_id = ?').get(tripId);
    const result = database_1.db.prepare('INSERT INTO packing_bags (trip_id, name, color, sort_order) VALUES (?, ?, ?, ?)').run(tripId, data.name.trim(), data.color || '#6366f1', (maxOrder.max ?? -1) + 1);
    return database_1.db.prepare('SELECT * FROM packing_bags WHERE id = ?').get(result.lastInsertRowid);
}
function updateBag(tripId, bagId, data, bodyKeys) {
    const bag = database_1.db.prepare('SELECT * FROM packing_bags WHERE id = ? AND trip_id = ?').get(bagId, tripId);
    if (!bag)
        return null;
    database_1.db.prepare(`UPDATE packing_bags SET
    name = COALESCE(?, name),
    color = COALESCE(?, color),
    weight_limit_grams = ?,
    user_id = CASE WHEN ? THEN ? ELSE user_id END
    WHERE id = ?`).run(data.name?.trim() || null, data.color || null, data.weight_limit_grams ?? bag.weight_limit_grams ?? null, bodyKeys?.includes('user_id') ? 1 : 0, data.user_id ?? null, bagId);
    return database_1.db.prepare('SELECT b.*, u.username as assigned_username FROM packing_bags b LEFT JOIN users u ON b.user_id = u.id WHERE b.id = ?').get(bagId);
}
function deleteBag(tripId, bagId) {
    const bag = database_1.db.prepare('SELECT * FROM packing_bags WHERE id = ? AND trip_id = ?').get(bagId, tripId);
    if (!bag)
        return false;
    database_1.db.prepare('DELETE FROM packing_bags WHERE id = ?').run(bagId);
    return true;
}
// ── List Templates ─────────────────────────────────────────────────────────
/**
 * Read-only template list for trip members (name + item count), so non-admins
 * can pick a template to apply. Management (create/edit/delete) stays admin-only
 * under /api/admin/packing-templates.
 */
function listTemplates() {
    return database_1.db.prepare(`
    SELECT pt.id, pt.name,
      (SELECT COUNT(*) FROM packing_template_items ti JOIN packing_template_categories tc ON ti.category_id = tc.id WHERE tc.template_id = pt.id) as item_count
    FROM packing_templates pt
    ORDER BY pt.created_at DESC
  `).all();
}
// ── Apply Template ─────────────────────────────────────────────────────────
function applyTemplate(tripId, templateId) {
    const templateItems = database_1.db.prepare(`
    SELECT ti.name, tc.name as category
    FROM packing_template_items ti
    JOIN packing_template_categories tc ON ti.category_id = tc.id
    WHERE tc.template_id = ?
    ORDER BY tc.sort_order, ti.sort_order
  `).all(templateId);
    if (templateItems.length === 0)
        return null;
    const maxOrder = database_1.db.prepare('SELECT MAX(sort_order) as max FROM packing_items WHERE trip_id = ?').get(tripId);
    let sortOrder = (maxOrder.max !== null ? maxOrder.max : -1) + 1;
    const insert = database_1.db.prepare('INSERT INTO packing_items (trip_id, name, checked, category, sort_order) VALUES (?, ?, 0, ?, ?)');
    const added = [];
    for (const ti of templateItems) {
        const result = insert.run(tripId, ti.name, ti.category, sortOrder++);
        const item = database_1.db.prepare('SELECT * FROM packing_items WHERE id = ?').get(result.lastInsertRowid);
        added.push(item);
    }
    return added;
}
// ── Save as Template ──────────────────────────────────────────────────────
function saveAsTemplate(tripId, userId, templateName) {
    const items = database_1.db.prepare('SELECT name, category FROM packing_items WHERE trip_id = ? ORDER BY sort_order ASC').all(tripId);
    if (items.length === 0)
        return null;
    const result = database_1.db.prepare('INSERT INTO packing_templates (name, created_by) VALUES (?, ?)').run(templateName, userId);
    const templateId = result.lastInsertRowid;
    const categories = [...new Set(items.map(i => i.category || 'Other'))];
    const catIdMap = new Map();
    for (let i = 0; i < categories.length; i++) {
        const catResult = database_1.db.prepare('INSERT INTO packing_template_categories (template_id, name, sort_order) VALUES (?, ?, ?)').run(templateId, categories[i], i);
        catIdMap.set(categories[i], catResult.lastInsertRowid);
    }
    const itemsByCategory = new Map();
    for (const item of items) {
        const catId = catIdMap.get(item.category || 'Other');
        const order = itemsByCategory.get(item.category || 'Other') || 0;
        database_1.db.prepare('INSERT INTO packing_template_items (category_id, name, sort_order) VALUES (?, ?, ?)').run(catId, item.name, order);
        itemsByCategory.set(item.category || 'Other', order + 1);
    }
    return { id: Number(templateId), name: templateName, categoryCount: categories.length, itemCount: items.length };
}
// ── Category Assignees ─────────────────────────────────────────────────────
function getCategoryAssignees(tripId) {
    const rows = database_1.db.prepare(`
    SELECT pca.category_name, pca.user_id, u.username, u.avatar
    FROM packing_category_assignees pca
    JOIN users u ON pca.user_id = u.id
    WHERE pca.trip_id = ?
  `).all(tripId);
    // Group by category
    const assignees = {};
    for (const row of rows) {
        if (!assignees[row.category_name])
            assignees[row.category_name] = [];
        assignees[row.category_name].push({ user_id: row.user_id, username: row.username, avatar: (0, avatarUrl_1.avatarUrl)(row) });
    }
    return assignees;
}
function updateCategoryAssignees(tripId, categoryName, userIds) {
    database_1.db.prepare('DELETE FROM packing_category_assignees WHERE trip_id = ? AND category_name = ?').run(tripId, categoryName);
    if (Array.isArray(userIds) && userIds.length > 0) {
        const insert = database_1.db.prepare('INSERT OR IGNORE INTO packing_category_assignees (trip_id, category_name, user_id) VALUES (?, ?, ?)');
        for (const uid of userIds)
            insert.run(tripId, categoryName, uid);
    }
    const updated = database_1.db.prepare(`
    SELECT pca.user_id, u.username, u.avatar
    FROM packing_category_assignees pca
    JOIN users u ON pca.user_id = u.id
    WHERE pca.trip_id = ? AND pca.category_name = ?
  `).all(tripId, categoryName);
    return updated.map(m => ({ ...m, avatar: (0, avatarUrl_1.avatarUrl)(m) }));
}
// ── Reorder ────────────────────────────────────────────────────────────────
function reorderItems(tripId, orderedIds) {
    const update = database_1.db.prepare('UPDATE packing_items SET sort_order = ? WHERE id = ? AND trip_id = ?');
    const updateMany = database_1.db.transaction((ids) => {
        ids.forEach((id, index) => {
            update.run(index, id, tripId);
        });
    });
    updateMany(orderedIds);
}
