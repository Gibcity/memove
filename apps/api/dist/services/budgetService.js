"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTripAccess = exports.avatarUrl = void 0;
exports.listBudgetItems = listBudgetItems;
exports.createBudgetItem = createBudgetItem;
exports.getBudgetItem = getBudgetItem;
exports.linkBudgetItemToReservation = linkBudgetItemToReservation;
exports.updateBudgetItem = updateBudgetItem;
exports.setItemPayers = setItemPayers;
exports.deleteBudgetItem = deleteBudgetItem;
exports.updateMembers = updateMembers;
exports.toggleMemberPaid = toggleMemberPaid;
exports.getPerPersonSummary = getPerPersonSummary;
exports.calculateSettlement = calculateSettlement;
exports.listSettlements = listSettlements;
exports.createSettlement = createSettlement;
exports.updateSettlement = updateSettlement;
exports.deleteSettlement = deleteSettlement;
exports.reorderBudgetItems = reorderBudgetItems;
exports.reorderBudgetCategories = reorderBudgetCategories;
const database_1 = require("../db/database");
const avatarUrl_1 = require("./avatarUrl");
Object.defineProperty(exports, "avatarUrl", { enumerable: true, get: function () { return avatarUrl_1.avatarUrl; } });
var tripAccess_1 = require("./tripAccess");
Object.defineProperty(exports, "verifyTripAccess", { enumerable: true, get: function () { return tripAccess_1.verifyTripAccess; } });
function loadItemMembers(itemId) {
    const rows = database_1.db.prepare(`
    SELECT bm.user_id, bm.paid, u.username, u.avatar
    FROM budget_item_members bm
    JOIN users u ON bm.user_id = u.id
    WHERE bm.budget_item_id = ?
  `).all(itemId);
    return rows.map(m => ({ ...m, avatar_url: (0, avatarUrl_1.avatarUrl)(m) }));
}
function loadItemPayers(itemId) {
    const rows = database_1.db.prepare(`
    SELECT bp.user_id, bp.amount, u.username, u.avatar
    FROM budget_item_payers bp
    JOIN users u ON bp.user_id = u.id
    WHERE bp.budget_item_id = ?
  `).all(itemId);
    return rows.map(p => ({ ...p, avatar_url: (0, avatarUrl_1.avatarUrl)(p) }));
}
/** Replace the payer rows of an item and keep total_price = sum of payer amounts. */
function writeItemPayers(itemId, payers) {
    database_1.db.prepare('DELETE FROM budget_item_payers WHERE budget_item_id = ?').run(itemId);
    const insert = database_1.db.prepare('INSERT OR IGNORE INTO budget_item_payers (budget_item_id, user_id, amount) VALUES (?, ?, ?)');
    let total = 0;
    for (const p of payers) {
        if (!(p.amount > 0))
            continue;
        insert.run(itemId, p.user_id, p.amount);
        total += p.amount;
    }
    database_1.db.prepare('UPDATE budget_items SET total_price = ? WHERE id = ?').run(total, itemId);
    return total;
}
// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------
function listBudgetItems(tripId) {
    const items = database_1.db.prepare(`
    SELECT bi.* FROM budget_items bi
    LEFT JOIN budget_category_order bco ON bco.trip_id = bi.trip_id AND bco.category = bi.category
    WHERE bi.trip_id = ?
    ORDER BY COALESCE(bco.sort_order, 999999) ASC, bi.sort_order ASC
  `).all(tripId);
    const itemIds = items.map(i => i.id);
    const membersByItem = {};
    if (itemIds.length > 0) {
        const allMembers = database_1.db.prepare(`
      SELECT bm.budget_item_id, bm.user_id, bm.paid, u.username, u.avatar
      FROM budget_item_members bm
      JOIN users u ON bm.user_id = u.id
      WHERE bm.budget_item_id IN (${itemIds.map(() => '?').join(',')})
    `).all(...itemIds);
        for (const m of allMembers) {
            if (!membersByItem[m.budget_item_id])
                membersByItem[m.budget_item_id] = [];
            membersByItem[m.budget_item_id].push({
                user_id: m.user_id, paid: m.paid, username: m.username, avatar_url: (0, avatarUrl_1.avatarUrl)(m),
            });
        }
    }
    const payersByItem = {};
    if (itemIds.length > 0) {
        const allPayers = database_1.db.prepare(`
      SELECT bp.budget_item_id, bp.user_id, bp.amount, u.username, u.avatar
      FROM budget_item_payers bp
      JOIN users u ON bp.user_id = u.id
      WHERE bp.budget_item_id IN (${itemIds.map(() => '?').join(',')})
    `).all(...itemIds);
        for (const p of allPayers) {
            if (!payersByItem[p.budget_item_id])
                payersByItem[p.budget_item_id] = [];
            payersByItem[p.budget_item_id].push({
                user_id: p.user_id, amount: p.amount, username: p.username, avatar_url: (0, avatarUrl_1.avatarUrl)(p),
            });
        }
    }
    items.forEach(item => {
        item.members = membersByItem[item.id] || [];
        item.payers = payersByItem[item.id] || [];
    });
    return items;
}
function createBudgetItem(tripId, data) {
    const maxOrder = database_1.db.prepare('SELECT MAX(sort_order) as max FROM budget_items WHERE trip_id = ?').get(tripId);
    const sortOrder = (maxOrder.max !== null ? maxOrder.max : -1) + 1;
    const cat = data.category || 'other';
    // Ensure category has a sort_order entry
    const catExists = database_1.db.prepare('SELECT 1 FROM budget_category_order WHERE trip_id = ? AND category = ?').get(tripId, cat);
    if (!catExists) {
        const maxCatOrder = database_1.db.prepare('SELECT MAX(sort_order) as max FROM budget_category_order WHERE trip_id = ?').get(tripId);
        const catOrder = (maxCatOrder?.max !== null && maxCatOrder?.max !== undefined ? maxCatOrder.max : -1) + 1;
        database_1.db.prepare('INSERT OR IGNORE INTO budget_category_order (trip_id, category, sort_order) VALUES (?, ?, ?)').run(tripId, cat, catOrder);
    }
    // total_price is derived from explicit payers when given; otherwise the caller
    // value (planning entries, or a bill no one has paid yet).
    const payerTotal = (data.payers || []).reduce((a, p) => a + (p.amount > 0 ? p.amount : 0), 0);
    const total = data.payers && data.payers.length > 0 ? payerTotal : (data.total_price || 0);
    const result = database_1.db.prepare('INSERT INTO budget_items (trip_id, category, name, total_price, currency, exchange_rate, persons, days, note, sort_order, expense_date, reservation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(tripId, cat, data.name, total, data.currency || null, data.exchange_rate != null ? data.exchange_rate : 1, data.member_ids ? data.member_ids.length : (data.persons != null ? data.persons : null), data.days !== undefined && data.days !== null ? data.days : null, data.note || null, sortOrder, data.expense_date || null, data.reservation_id != null ? data.reservation_id : null);
    const itemId = result.lastInsertRowid;
    if (data.payers && data.payers.length > 0)
        writeItemPayers(itemId, data.payers);
    if (data.member_ids && data.member_ids.length > 0) {
        const insert = database_1.db.prepare('INSERT OR IGNORE INTO budget_item_members (budget_item_id, user_id, paid) VALUES (?, ?, 0)');
        for (const uid of data.member_ids)
            insert.run(itemId, uid);
    }
    const item = database_1.db.prepare('SELECT * FROM budget_items WHERE id = ?').get(itemId);
    item.members = loadItemMembers(itemId);
    item.payers = loadItemPayers(itemId);
    return item;
}
/** Fetch a single budget item hydrated with its members and payers, scoped to the trip. */
function getBudgetItem(id, tripId) {
    const item = database_1.db.prepare('SELECT * FROM budget_items WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!item)
        return null;
    item.members = loadItemMembers(id);
    item.payers = loadItemPayers(id);
    return item;
}
function linkBudgetItemToReservation(tripId, reservationId, data) {
    const item = createBudgetItem(tripId, data);
    database_1.db.prepare('UPDATE budget_items SET reservation_id = ? WHERE id = ?').run(reservationId, item.id);
    item.reservation_id = reservationId;
    return item;
}
function updateBudgetItem(id, tripId, data) {
    const item = database_1.db.prepare('SELECT * FROM budget_items WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!item)
        return null;
    database_1.db.prepare(`
    UPDATE budget_items SET
      category = COALESCE(?, category),
      name = COALESCE(?, name),
      total_price = CASE WHEN ? IS NOT NULL THEN ? ELSE total_price END,
      currency = CASE WHEN ? THEN ? ELSE currency END,
      exchange_rate = CASE WHEN ? IS NOT NULL THEN ? ELSE exchange_rate END,
      persons = CASE WHEN ? IS NOT NULL THEN ? ELSE persons END,
      days = CASE WHEN ? THEN ? ELSE days END,
      note = CASE WHEN ? THEN ? ELSE note END,
      sort_order = CASE WHEN ? IS NOT NULL THEN ? ELSE sort_order END,
      expense_date = CASE WHEN ? THEN ? ELSE expense_date END
    WHERE id = ?
  `).run(data.category || null, data.name || null, data.total_price !== undefined ? 1 : null, data.total_price !== undefined ? data.total_price : 0, data.currency !== undefined ? 1 : 0, data.currency !== undefined ? (data.currency || null) : null, data.exchange_rate !== undefined ? 1 : null, data.exchange_rate !== undefined ? data.exchange_rate : 1, data.persons !== undefined ? 1 : null, data.persons !== undefined ? data.persons : null, data.days !== undefined ? 1 : 0, data.days !== undefined ? data.days : null, data.note !== undefined ? 1 : 0, data.note !== undefined ? data.note : null, data.sort_order !== undefined ? 1 : null, data.sort_order !== undefined ? data.sort_order : 0, data.expense_date !== undefined ? 1 : 0, data.expense_date !== undefined ? (data.expense_date || null) : null, id);
    // Optional inline payer/member replacement (the edit modal saves all at once).
    if (data.payers !== undefined) {
        writeItemPayers(id, data.payers);
        // writeItemPayers derives total_price from the payer sum (0 for no payers).
        // A "recorded total, nobody assigned" expense clears payers but still carries
        // an explicit total_price — re-apply it so it isn't clobbered to 0.
        if (data.payers.length === 0 && data.total_price !== undefined) {
            database_1.db.prepare('UPDATE budget_items SET total_price = ? WHERE id = ?').run(data.total_price, id);
        }
    }
    if (data.member_ids !== undefined) {
        database_1.db.prepare('DELETE FROM budget_item_members WHERE budget_item_id = ?').run(id);
        const insert = database_1.db.prepare('INSERT OR IGNORE INTO budget_item_members (budget_item_id, user_id, paid) VALUES (?, ?, 0)');
        for (const uid of data.member_ids)
            insert.run(id, uid);
        database_1.db.prepare('UPDATE budget_items SET persons = ? WHERE id = ?').run(data.member_ids.length || null, id);
    }
    // If category changed, update category order table
    if (data.category) {
        const catExists = database_1.db.prepare('SELECT 1 FROM budget_category_order WHERE trip_id = ? AND category = ?').get(tripId, data.category);
        if (!catExists) {
            const maxCatOrder = database_1.db.prepare('SELECT MAX(sort_order) as max FROM budget_category_order WHERE trip_id = ?').get(tripId);
            const catOrder = (maxCatOrder?.max !== null && maxCatOrder?.max !== undefined ? maxCatOrder.max : -1) + 1;
            database_1.db.prepare('INSERT OR IGNORE INTO budget_category_order (trip_id, category, sort_order) VALUES (?, ?, ?)').run(tripId, data.category, catOrder);
        }
    }
    const updated = database_1.db.prepare('SELECT * FROM budget_items WHERE id = ?').get(id);
    updated.members = loadItemMembers(id);
    updated.payers = loadItemPayers(id);
    return updated;
}
// ---------------------------------------------------------------------------
// Payers
// ---------------------------------------------------------------------------
function setItemPayers(id, tripId, payers) {
    const item = database_1.db.prepare('SELECT id FROM budget_items WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!item)
        return null;
    writeItemPayers(id, payers);
    const updated = database_1.db.prepare('SELECT * FROM budget_items WHERE id = ?').get(id);
    updated.members = loadItemMembers(id);
    updated.payers = loadItemPayers(id);
    return updated;
}
function deleteBudgetItem(id, tripId) {
    const item = database_1.db.prepare('SELECT id FROM budget_items WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!item)
        return false;
    database_1.db.prepare('DELETE FROM budget_items WHERE id = ?').run(id);
    return true;
}
// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------
function updateMembers(id, tripId, userIds) {
    const item = database_1.db.prepare('SELECT * FROM budget_items WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!item)
        return null;
    const existingPaid = {};
    const existing = database_1.db.prepare('SELECT user_id, paid FROM budget_item_members WHERE budget_item_id = ?').all(id);
    for (const e of existing)
        existingPaid[e.user_id] = e.paid;
    database_1.db.prepare('DELETE FROM budget_item_members WHERE budget_item_id = ?').run(id);
    if (userIds.length > 0) {
        const insert = database_1.db.prepare('INSERT OR IGNORE INTO budget_item_members (budget_item_id, user_id, paid) VALUES (?, ?, ?)');
        for (const userId of userIds)
            insert.run(id, userId, existingPaid[userId] || 0);
        database_1.db.prepare('UPDATE budget_items SET persons = ? WHERE id = ?').run(userIds.length, id);
    }
    else {
        database_1.db.prepare('UPDATE budget_items SET persons = NULL WHERE id = ?').run(id);
    }
    const members = loadItemMembers(id).map(m => ({ ...m, avatar_url: (0, avatarUrl_1.avatarUrl)(m) }));
    const updated = database_1.db.prepare('SELECT * FROM budget_items WHERE id = ?').get(id);
    return { members, item: updated };
}
function toggleMemberPaid(id, tripId, userId, paid) {
    // Resolve the item within the caller's trip before updating.
    const item = database_1.db.prepare('SELECT id FROM budget_items WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!item)
        return null;
    database_1.db.prepare('UPDATE budget_item_members SET paid = ? WHERE budget_item_id = ? AND user_id = ?')
        .run(paid ? 1 : 0, id, userId);
    const member = database_1.db.prepare(`
    SELECT bm.user_id, bm.paid, u.username, u.avatar
    FROM budget_item_members bm JOIN users u ON bm.user_id = u.id
    WHERE bm.budget_item_id = ? AND bm.user_id = ?
  `).get(id, userId);
    return member ? { ...member, avatar_url: (0, avatarUrl_1.avatarUrl)(member) } : null;
}
// ---------------------------------------------------------------------------
// Per-person summary
// ---------------------------------------------------------------------------
function getPerPersonSummary(tripId) {
    const summary = database_1.db.prepare(`
    SELECT bm.user_id, u.username, u.avatar,
      SUM(bi.total_price * 1.0 / (SELECT COUNT(*) FROM budget_item_members WHERE budget_item_id = bi.id)) as total_assigned,
      SUM(CASE WHEN bm.paid = 1 THEN bi.total_price * 1.0 / (SELECT COUNT(*) FROM budget_item_members WHERE budget_item_id = bi.id) ELSE 0 END) as total_paid,
      COUNT(bi.id) as items_count
    FROM budget_item_members bm
    JOIN budget_items bi ON bm.budget_item_id = bi.id
    JOIN users u ON bm.user_id = u.id
    WHERE bi.trip_id = ?
    GROUP BY bm.user_id
  `).all(tripId);
    return summary.map(s => ({ ...s, avatar_url: (0, avatarUrl_1.avatarUrl)(s) }));
}
// ---------------------------------------------------------------------------
// Settlement calculation (greedy debt matching)
// ---------------------------------------------------------------------------
function calculateSettlement(tripId, opts = {}) {
    const base = (opts.base || opts.tripCurrency || 'EUR').toUpperCase();
    const tripCurrency = (opts.tripCurrency || base).toUpperCase();
    const rates = opts.rates ?? null;
    // Amount in some currency → base. Pre-rework rows store currency = NULL, which
    // means "the trip's own currency". rates[X] = units of X per 1 base.
    const toBase = (amount, itemCurrency) => {
        const cur = (itemCurrency || tripCurrency).toUpperCase();
        if (cur === base || !rates)
            return amount;
        const r = rates[cur];
        return r && r > 0 ? amount / r : amount;
    };
    const items = database_1.db.prepare('SELECT * FROM budget_items WHERE trip_id = ?').all(tripId);
    const allMembers = database_1.db.prepare(`
    SELECT bm.budget_item_id, bm.user_id, u.username, u.avatar
    FROM budget_item_members bm
    JOIN users u ON bm.user_id = u.id
    WHERE bm.budget_item_id IN (SELECT id FROM budget_items WHERE trip_id = ?)
  `).all(tripId);
    const allPayers = database_1.db.prepare(`
    SELECT bp.budget_item_id, bp.user_id, bp.amount, u.username, u.avatar
    FROM budget_item_payers bp
    JOIN users u ON bp.user_id = u.id
    WHERE bp.budget_item_id IN (SELECT id FROM budget_items WHERE trip_id = ?)
  `).all(tripId);
    // Net balance per user, in the requested base currency: positive = is owed
    // money, negative = owes money. Each expense's amounts are converted from their
    // own currency to the base with live rates, so mixed-currency trips net correctly.
    const balances = {};
    const ensure = (id, src) => {
        if (!balances[id])
            balances[id] = { user_id: id, username: src.username || '', avatar_url: (0, avatarUrl_1.avatarUrl)(src), balance: 0 };
        return balances[id];
    };
    for (const item of items) {
        const members = allMembers.filter(m => m.budget_item_id === item.id);
        const payers = allPayers.filter(p => p.budget_item_id === item.id);
        if (members.length === 0)
            continue; // planning-only entry → doesn't affect balances
        const paidBase = payers.reduce((a, p) => a + toBase(p.amount > 0 ? p.amount : 0, item.currency), 0);
        const sharePerMember = paidBase / members.length;
        // Payers are credited what they actually paid (converted to base)…
        for (const p of payers)
            ensure(p.user_id, p).balance += toBase(p.amount > 0 ? p.amount : 0, item.currency);
        // …and every split participant owes an equal share of the base total.
        for (const m of members)
            ensure(m.user_id, m).balance -= sharePerMember;
    }
    // Persisted settle-up transfers already moved money: the payer's debt shrinks,
    // the receiver's credit shrinks, so the corresponding flow disappears. A transfer
    // counts even when neither user has an expense-derived balance yet — a manual
    // payment, or one left behind after its expense was deleted, then correctly
    // surfaces as an amount still to square up instead of silently vanishing.
    const settlements = listSettlements(tripId);
    const ensureSettled = (id, username, avatar_url) => {
        if (!balances[id])
            balances[id] = { user_id: id, username: username || '', avatar_url: avatar_url ?? null, balance: 0 };
        return balances[id];
    };
    for (const s of settlements) {
        ensureSettled(s.from_user_id, s.from_username, s.from_avatar_url).balance += s.amount;
        ensureSettled(s.to_user_id, s.to_username, s.to_avatar_url).balance -= s.amount;
    }
    // Calculate optimized payment flows (greedy algorithm)
    const people = Object.values(balances).filter(b => Math.abs(b.balance) > 0.01);
    const debtors = people.filter(p => p.balance < -0.01).map(p => ({ ...p, amount: -p.balance }));
    const creditors = people.filter(p => p.balance > 0.01).map(p => ({ ...p, amount: p.balance }));
    // Sort by amount descending for efficient matching
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);
    const flows = [];
    let di = 0, ci = 0;
    while (di < debtors.length && ci < creditors.length) {
        const transfer = Math.min(debtors[di].amount, creditors[ci].amount);
        if (transfer > 0.01) {
            flows.push({
                from: { user_id: debtors[di].user_id, username: debtors[di].username, avatar_url: debtors[di].avatar_url },
                to: { user_id: creditors[ci].user_id, username: creditors[ci].username, avatar_url: creditors[ci].avatar_url },
                amount: Math.round(transfer * 100) / 100,
            });
        }
        debtors[di].amount -= transfer;
        creditors[ci].amount -= transfer;
        if (debtors[di].amount < 0.01)
            di++;
        if (creditors[ci].amount < 0.01)
            ci++;
    }
    return {
        balances: Object.values(balances).map(b => ({ ...b, balance: Math.round(b.balance * 100) / 100 })),
        flows,
        settlements,
    };
}
// ---------------------------------------------------------------------------
// Settlements (persisted settle-up transfers — history + undo)
// ---------------------------------------------------------------------------
function listSettlements(tripId) {
    const rows = database_1.db.prepare(`
    SELECT s.id, s.trip_id, s.from_user_id, s.to_user_id, s.amount, s.created_at, s.created_by_user_id,
           fu.username AS from_username, fu.avatar AS from_avatar,
           tu.username AS to_username,   tu.avatar AS to_avatar
    FROM budget_settlements s
    JOIN users fu ON s.from_user_id = fu.id
    JOIN users tu ON s.to_user_id = tu.id
    WHERE s.trip_id = ?
    ORDER BY s.created_at DESC, s.id DESC
  `).all(tripId);
    return rows.map(r => ({
        id: r.id, trip_id: r.trip_id,
        from_user_id: r.from_user_id, to_user_id: r.to_user_id,
        amount: r.amount, created_at: r.created_at, created_by_user_id: r.created_by_user_id,
        from_username: r.from_username, from_avatar_url: (0, avatarUrl_1.avatarUrl)({ avatar: r.from_avatar }),
        to_username: r.to_username, to_avatar_url: (0, avatarUrl_1.avatarUrl)({ avatar: r.to_avatar }),
    }));
}
function createSettlement(tripId, data, createdByUserId) {
    const result = database_1.db.prepare('INSERT INTO budget_settlements (trip_id, from_user_id, to_user_id, amount, created_by_user_id) VALUES (?, ?, ?, ?, ?)').run(tripId, data.from_user_id, data.to_user_id, Math.round(data.amount * 100) / 100, createdByUserId ?? null);
    return listSettlements(tripId).find(s => s.id === Number(result.lastInsertRowid)) || null;
}
function updateSettlement(id, tripId, data) {
    const row = database_1.db.prepare('SELECT id FROM budget_settlements WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!row)
        return null;
    database_1.db.prepare('UPDATE budget_settlements SET from_user_id = ?, to_user_id = ?, amount = ? WHERE id = ?').run(data.from_user_id, data.to_user_id, Math.round(data.amount * 100) / 100, id);
    return listSettlements(tripId).find(s => s.id === Number(id)) || null;
}
function deleteSettlement(id, tripId) {
    const row = database_1.db.prepare('SELECT id FROM budget_settlements WHERE id = ? AND trip_id = ?').get(id, tripId);
    if (!row)
        return false;
    database_1.db.prepare('DELETE FROM budget_settlements WHERE id = ?').run(id);
    return true;
}
// ---------------------------------------------------------------------------
// Reorder
// ---------------------------------------------------------------------------
function reorderBudgetItems(tripId, orderedIds) {
    const update = database_1.db.prepare('UPDATE budget_items SET sort_order = ? WHERE id = ? AND trip_id = ?');
    database_1.db.transaction(() => {
        orderedIds.forEach((id, index) => update.run(index, id, tripId));
    })();
}
function reorderBudgetCategories(tripId, orderedCategories) {
    const upsert = database_1.db.prepare('INSERT INTO budget_category_order (trip_id, category, sort_order) VALUES (?, ?, ?) ON CONFLICT(trip_id, category) DO UPDATE SET sort_order = excluded.sort_order');
    database_1.db.transaction(() => {
        orderedCategories.forEach((cat, index) => upsert.run(tripId, cat, index));
    })();
}
