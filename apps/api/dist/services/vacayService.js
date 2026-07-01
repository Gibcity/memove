"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOwnPlan = getOwnPlan;
exports.getActivePlan = getActivePlan;
exports.getActivePlanId = getActivePlanId;
exports.shiftOwnerEntriesForTripWindow = shiftOwnerEntriesForTripWindow;
exports.getPlanUsers = getPlanUsers;
exports.notifyPlanUsers = notifyPlanUsers;
exports.applyHolidayCalendars = applyHolidayCalendars;
exports.migrateHolidayCalendars = migrateHolidayCalendars;
exports.updatePlan = updatePlan;
exports.addHolidayCalendar = addHolidayCalendar;
exports.updateHolidayCalendar = updateHolidayCalendar;
exports.deleteHolidayCalendar = deleteHolidayCalendar;
exports.setUserColor = setUserColor;
exports.sendInvite = sendInvite;
exports.acceptInvite = acceptInvite;
exports.declineInvite = declineInvite;
exports.cancelInvite = cancelInvite;
exports.dissolvePlan = dissolvePlan;
exports.getAvailableUsers = getAvailableUsers;
exports.listYears = listYears;
exports.addYear = addYear;
exports.deleteYear = deleteYear;
exports.getEntries = getEntries;
exports.toggleEntry = toggleEntry;
exports.toggleCompanyHoliday = toggleCompanyHoliday;
exports.getStats = getStats;
exports.updateStats = updateStats;
exports.getPlanData = getPlanData;
exports.getCountries = getCountries;
exports.getHolidays = getHolidays;
const database_1 = require("../db/database");
// ---------------------------------------------------------------------------
// Holiday cache (shared in-process)
// ---------------------------------------------------------------------------
const holidayCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000;
// ---------------------------------------------------------------------------
// Color palette for auto-assign
// ---------------------------------------------------------------------------
const COLORS = [
    '#6366f1', '#ec4899', '#14b8a6', '#8b5cf6', '#ef4444',
    '#3b82f6', '#22c55e', '#06b6d4', '#f43f5e', '#a855f7',
    '#10b981', '#0ea5e9', '#64748b', '#be185d', '#0d9488',
];
// ---------------------------------------------------------------------------
// Plan management
// ---------------------------------------------------------------------------
function getOwnPlan(userId) {
    let plan = database_1.db.prepare('SELECT * FROM vacay_plans WHERE owner_id = ?').get(userId);
    if (!plan) {
        database_1.db.prepare('INSERT INTO vacay_plans (owner_id) VALUES (?)').run(userId);
        plan = database_1.db.prepare('SELECT * FROM vacay_plans WHERE owner_id = ?').get(userId);
        const yr = new Date().getFullYear();
        database_1.db.prepare('INSERT OR IGNORE INTO vacay_years (plan_id, year) VALUES (?, ?)').run(plan.id, yr);
        database_1.db.prepare('INSERT OR IGNORE INTO vacay_user_years (user_id, plan_id, year, vacation_days, carried_over) VALUES (?, ?, ?, 30, 0)').run(userId, plan.id, yr);
        database_1.db.prepare('INSERT OR IGNORE INTO vacay_user_colors (user_id, plan_id, color) VALUES (?, ?, ?)').run(userId, plan.id, '#6366f1');
    }
    return plan;
}
function getActivePlan(userId) {
    const membership = database_1.db.prepare(`
    SELECT plan_id FROM vacay_plan_members WHERE user_id = ? AND status = 'accepted'
  `).get(userId);
    if (membership) {
        return database_1.db.prepare('SELECT * FROM vacay_plans WHERE id = ?').get(membership.plan_id);
    }
    return getOwnPlan(userId);
}
function getActivePlanId(userId) {
    return getActivePlan(userId).id;
}
function shiftOwnerEntriesForTripWindow(ownerId, oldStart, oldEnd, newStart) {
    const row = database_1.db.prepare('SELECT CAST(julianday(?) - julianday(?) AS INTEGER) AS days').get(newStart, oldStart);
    const offset = row?.days ?? 0;
    if (offset === 0)
        return;
    const plan = getOwnPlan(ownerId);
    database_1.db.prepare(`UPDATE OR IGNORE vacay_entries
        SET date = date(date, ? || ' days')
      WHERE plan_id = ?
        AND user_id = ?
        AND date BETWEEN ? AND ?`).run(`${offset >= 0 ? '+' : ''}${offset}`, plan.id, ownerId, oldStart, oldEnd);
}
function getPlanUsers(planId) {
    const plan = database_1.db.prepare('SELECT * FROM vacay_plans WHERE id = ?').get(planId);
    if (!plan)
        return [];
    const owner = database_1.db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(plan.owner_id);
    const members = database_1.db.prepare(`
    SELECT u.id, u.username, u.email FROM vacay_plan_members m
    JOIN users u ON m.user_id = u.id
    WHERE m.plan_id = ? AND m.status = 'accepted'
  `).all(planId);
    return [owner, ...members];
}
// ---------------------------------------------------------------------------
// WebSocket notifications
// ---------------------------------------------------------------------------
function notifyPlanUsers(planId, excludeSid, event = 'vacay:update') {
    try {
        const { broadcastToUser } = require('../websocket');
        const plan = database_1.db.prepare('SELECT owner_id FROM vacay_plans WHERE id = ?').get(planId);
        if (!plan)
            return;
        const userIds = [plan.owner_id];
        const members = database_1.db.prepare("SELECT user_id FROM vacay_plan_members WHERE plan_id = ? AND status = 'accepted'").all(planId);
        members.forEach(m => userIds.push(m.user_id));
        userIds.forEach(id => broadcastToUser(id, { type: event }, excludeSid));
    }
    catch { /* websocket not available */ }
}
// ---------------------------------------------------------------------------
// Holiday calendar helpers
// ---------------------------------------------------------------------------
async function applyHolidayCalendars(planId) {
    const plan = database_1.db.prepare('SELECT holidays_enabled FROM vacay_plans WHERE id = ?').get(planId);
    if (!plan?.holidays_enabled)
        return;
    const calendars = database_1.db.prepare('SELECT * FROM vacay_holiday_calendars WHERE plan_id = ? ORDER BY sort_order, id').all(planId);
    if (calendars.length === 0)
        return;
    const years = database_1.db.prepare('SELECT year FROM vacay_years WHERE plan_id = ?').all(planId);
    for (const cal of calendars) {
        const country = cal.region.split('-')[0];
        const region = cal.region.includes('-') ? cal.region : null;
        for (const { year } of years) {
            try {
                const cacheKey = `${year}-${country}`;
                let holidays = holidayCache.get(cacheKey)?.data;
                if (!holidays) {
                    const resp = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
                    holidays = await resp.json();
                    holidayCache.set(cacheKey, { data: holidays, time: Date.now() });
                }
                const hasRegions = holidays.some((h) => h.counties && h.counties.length > 0);
                if (hasRegions && !region)
                    continue;
                for (const h of holidays) {
                    if (h.global || !h.counties || (region && h.counties.includes(region))) {
                        database_1.db.prepare('DELETE FROM vacay_entries WHERE plan_id = ? AND date = ?').run(planId, h.date);
                        database_1.db.prepare('DELETE FROM vacay_company_holidays WHERE plan_id = ? AND date = ?').run(planId, h.date);
                    }
                }
            }
            catch { /* API error, skip */ }
        }
    }
}
async function migrateHolidayCalendars(planId, plan) {
    const existing = database_1.db.prepare('SELECT id FROM vacay_holiday_calendars WHERE plan_id = ?').get(planId);
    if (existing)
        return;
    if (plan.holidays_enabled && plan.holidays_region) {
        database_1.db.prepare('INSERT INTO vacay_holiday_calendars (plan_id, region, label, color, sort_order) VALUES (?, ?, NULL, ?, 0)').run(planId, plan.holidays_region, '#fecaca');
    }
}
async function updatePlan(planId, body, socketId) {
    const { block_weekends, holidays_enabled, holidays_region, company_holidays_enabled, carry_over_enabled, weekend_days, week_start } = body;
    const updates = [];
    const params = [];
    if (block_weekends !== undefined) {
        updates.push('block_weekends = ?');
        params.push(block_weekends ? 1 : 0);
    }
    if (holidays_enabled !== undefined) {
        updates.push('holidays_enabled = ?');
        params.push(holidays_enabled ? 1 : 0);
    }
    if (holidays_region !== undefined) {
        updates.push('holidays_region = ?');
        params.push(holidays_region);
    }
    if (company_holidays_enabled !== undefined) {
        updates.push('company_holidays_enabled = ?');
        params.push(company_holidays_enabled ? 1 : 0);
    }
    if (carry_over_enabled !== undefined) {
        updates.push('carry_over_enabled = ?');
        params.push(carry_over_enabled ? 1 : 0);
    }
    if (weekend_days !== undefined) {
        updates.push('weekend_days = ?');
        params.push(String(weekend_days));
    }
    if (week_start !== undefined) {
        updates.push('week_start = ?');
        params.push(week_start === 0 ? 0 : 1);
    }
    if (updates.length > 0) {
        params.push(planId);
        database_1.db.prepare(`UPDATE vacay_plans SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    if (company_holidays_enabled === true) {
        const companyDates = database_1.db.prepare('SELECT date FROM vacay_company_holidays WHERE plan_id = ?').all(planId);
        for (const { date } of companyDates) {
            database_1.db.prepare('DELETE FROM vacay_entries WHERE plan_id = ? AND date = ?').run(planId, date);
        }
    }
    const updatedPlan = database_1.db.prepare('SELECT * FROM vacay_plans WHERE id = ?').get(planId);
    await migrateHolidayCalendars(planId, updatedPlan);
    await applyHolidayCalendars(planId);
    if (carry_over_enabled === false) {
        database_1.db.prepare('UPDATE vacay_user_years SET carried_over = 0 WHERE plan_id = ?').run(planId);
    }
    if (carry_over_enabled === true) {
        const years = database_1.db.prepare('SELECT year FROM vacay_years WHERE plan_id = ? ORDER BY year').all(planId);
        const users = getPlanUsers(planId);
        for (let i = 0; i < years.length - 1; i++) {
            const yr = years[i].year;
            const nextYr = years[i + 1].year;
            for (const u of users) {
                const used = database_1.db.prepare("SELECT COUNT(*) as count FROM vacay_entries WHERE user_id = ? AND plan_id = ? AND date LIKE ?").get(u.id, planId, `${yr}-%`).count;
                const config = database_1.db.prepare('SELECT * FROM vacay_user_years WHERE user_id = ? AND plan_id = ? AND year = ?').get(u.id, planId, yr);
                const total = (config ? config.vacation_days : 30) + (config ? config.carried_over : 0);
                const carry = Math.max(0, total - used);
                database_1.db.prepare(`
          INSERT INTO vacay_user_years (user_id, plan_id, year, vacation_days, carried_over) VALUES (?, ?, ?, 30, ?)
          ON CONFLICT(user_id, plan_id, year) DO UPDATE SET carried_over = ?
        `).run(u.id, planId, nextYr, carry, carry);
            }
        }
    }
    notifyPlanUsers(planId, socketId, 'vacay:settings');
    const updated = database_1.db.prepare('SELECT * FROM vacay_plans WHERE id = ?').get(planId);
    const updatedCalendars = database_1.db.prepare('SELECT * FROM vacay_holiday_calendars WHERE plan_id = ? ORDER BY sort_order, id').all(planId);
    return {
        plan: {
            ...updated,
            block_weekends: !!updated.block_weekends,
            holidays_enabled: !!updated.holidays_enabled,
            company_holidays_enabled: !!updated.company_holidays_enabled,
            carry_over_enabled: !!updated.carry_over_enabled,
            holiday_calendars: updatedCalendars,
        },
    };
}
// ---------------------------------------------------------------------------
// Holiday calendars CRUD
// ---------------------------------------------------------------------------
function addHolidayCalendar(planId, region, label, color, sortOrder, socketId) {
    const result = database_1.db.prepare('INSERT INTO vacay_holiday_calendars (plan_id, region, label, color, sort_order) VALUES (?, ?, ?, ?, ?)').run(planId, region, label || null, color || '#fecaca', sortOrder ?? 0);
    const cal = database_1.db.prepare('SELECT * FROM vacay_holiday_calendars WHERE id = ?').get(result.lastInsertRowid);
    notifyPlanUsers(planId, socketId, 'vacay:settings');
    return cal;
}
function updateHolidayCalendar(calId, planId, body, socketId) {
    const cal = database_1.db.prepare('SELECT * FROM vacay_holiday_calendars WHERE id = ? AND plan_id = ?').get(calId, planId);
    if (!cal)
        return null;
    const { region, label, color, sort_order } = body;
    const updates = [];
    const params = [];
    if (region !== undefined) {
        updates.push('region = ?');
        params.push(region);
    }
    if (label !== undefined) {
        updates.push('label = ?');
        params.push(label);
    }
    if (color !== undefined) {
        updates.push('color = ?');
        params.push(color);
    }
    if (sort_order !== undefined) {
        updates.push('sort_order = ?');
        params.push(sort_order);
    }
    if (updates.length > 0) {
        params.push(calId);
        database_1.db.prepare(`UPDATE vacay_holiday_calendars SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    const updated = database_1.db.prepare('SELECT * FROM vacay_holiday_calendars WHERE id = ?').get(calId);
    notifyPlanUsers(planId, socketId, 'vacay:settings');
    return updated;
}
function deleteHolidayCalendar(calId, planId, socketId) {
    const cal = database_1.db.prepare('SELECT * FROM vacay_holiday_calendars WHERE id = ? AND plan_id = ?').get(calId, planId);
    if (!cal)
        return false;
    database_1.db.prepare('DELETE FROM vacay_holiday_calendars WHERE id = ?').run(calId);
    notifyPlanUsers(planId, socketId, 'vacay:settings');
    return true;
}
// ---------------------------------------------------------------------------
// User colors
// ---------------------------------------------------------------------------
function setUserColor(userId, planId, color, socketId) {
    database_1.db.prepare(`
    INSERT INTO vacay_user_colors (user_id, plan_id, color) VALUES (?, ?, ?)
    ON CONFLICT(user_id, plan_id) DO UPDATE SET color = excluded.color
  `).run(userId, planId, color || '#6366f1');
    notifyPlanUsers(planId, socketId, 'vacay:update');
}
// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------
function sendInvite(planId, inviterId, inviterUsername, inviterEmail, targetUserId) {
    if (targetUserId === inviterId)
        return { error: 'Cannot invite yourself', status: 400 };
    const targetUser = database_1.db.prepare('SELECT id, username FROM users WHERE id = ?').get(targetUserId);
    if (!targetUser)
        return { error: 'User not found', status: 404 };
    const existing = database_1.db.prepare('SELECT id, status FROM vacay_plan_members WHERE plan_id = ? AND user_id = ?').get(planId, targetUserId);
    if (existing) {
        if (existing.status === 'accepted')
            return { error: 'Already fused', status: 400 };
        if (existing.status === 'pending')
            return { error: 'Invite already pending', status: 400 };
    }
    const targetFusion = database_1.db.prepare("SELECT id FROM vacay_plan_members WHERE user_id = ? AND status = 'accepted'").get(targetUserId);
    if (targetFusion)
        return { error: 'User is already fused with another plan', status: 400 };
    database_1.db.prepare('INSERT INTO vacay_plan_members (plan_id, user_id, status) VALUES (?, ?, ?)').run(planId, targetUserId, 'pending');
    try {
        const { broadcastToUser } = require('../websocket');
        broadcastToUser(targetUserId, {
            type: 'vacay:invite',
            from: { id: inviterId, username: inviterUsername },
            planId,
        });
    }
    catch { /* websocket not available */ }
    // Notify invited user
    Promise.resolve().then(() => __importStar(require('../services/notificationService'))).then(({ send }) => {
        send({ event: 'vacay_invite', actorId: inviterId, scope: 'user', targetId: targetUserId, params: { actor: inviterEmail, planId: String(planId) } }).catch(() => { });
    });
    return {};
}
function acceptInvite(userId, planId, socketId) {
    const invite = database_1.db.prepare("SELECT * FROM vacay_plan_members WHERE plan_id = ? AND user_id = ? AND status = 'pending'").get(planId, userId);
    if (!invite)
        return { error: 'No pending invite', status: 404 };
    database_1.db.prepare("UPDATE vacay_plan_members SET status = 'accepted' WHERE id = ?").run(invite.id);
    // Migrate data from user's own plan
    const ownPlan = database_1.db.prepare('SELECT id FROM vacay_plans WHERE owner_id = ?').get(userId);
    if (ownPlan && ownPlan.id !== planId) {
        database_1.db.prepare('UPDATE vacay_entries SET plan_id = ? WHERE plan_id = ? AND user_id = ?').run(planId, ownPlan.id, userId);
        const ownYears = database_1.db.prepare('SELECT * FROM vacay_user_years WHERE user_id = ? AND plan_id = ?').all(userId, ownPlan.id);
        for (const y of ownYears) {
            database_1.db.prepare('INSERT OR IGNORE INTO vacay_user_years (user_id, plan_id, year, vacation_days, carried_over) VALUES (?, ?, ?, ?, ?)').run(userId, planId, y.year, y.vacation_days, y.carried_over);
        }
        const colorRow = database_1.db.prepare('SELECT color FROM vacay_user_colors WHERE user_id = ? AND plan_id = ?').get(userId, ownPlan.id);
        if (colorRow) {
            database_1.db.prepare('INSERT OR IGNORE INTO vacay_user_colors (user_id, plan_id, color) VALUES (?, ?, ?)').run(userId, planId, colorRow.color);
        }
    }
    // Auto-assign unique color
    const existingColors = database_1.db.prepare('SELECT color FROM vacay_user_colors WHERE plan_id = ? AND user_id != ?').all(planId, userId).map(r => r.color);
    const myColor = database_1.db.prepare('SELECT color FROM vacay_user_colors WHERE user_id = ? AND plan_id = ?').get(userId, planId);
    const effectiveColor = myColor?.color || '#6366f1';
    if (existingColors.includes(effectiveColor)) {
        const available = COLORS.find(c => !existingColors.includes(c));
        if (available) {
            database_1.db.prepare(`INSERT INTO vacay_user_colors (user_id, plan_id, color) VALUES (?, ?, ?)
        ON CONFLICT(user_id, plan_id) DO UPDATE SET color = excluded.color`).run(userId, planId, available);
        }
    }
    else if (!myColor) {
        database_1.db.prepare('INSERT OR IGNORE INTO vacay_user_colors (user_id, plan_id, color) VALUES (?, ?, ?)').run(userId, planId, effectiveColor);
    }
    // Ensure user has rows for all plan years
    const targetYears = database_1.db.prepare('SELECT year FROM vacay_years WHERE plan_id = ?').all(planId);
    for (const y of targetYears) {
        database_1.db.prepare('INSERT OR IGNORE INTO vacay_user_years (user_id, plan_id, year, vacation_days, carried_over) VALUES (?, ?, ?, 30, 0)').run(userId, planId, y.year);
    }
    notifyPlanUsers(planId, socketId, 'vacay:accepted');
    return {};
}
function declineInvite(userId, planId, socketId) {
    database_1.db.prepare("DELETE FROM vacay_plan_members WHERE plan_id = ? AND user_id = ? AND status = 'pending'").run(planId, userId);
    notifyPlanUsers(planId, socketId, 'vacay:declined');
}
function cancelInvite(planId, targetUserId) {
    database_1.db.prepare("DELETE FROM vacay_plan_members WHERE plan_id = ? AND user_id = ? AND status = 'pending'").run(planId, targetUserId);
    try {
        const { broadcastToUser } = require('../websocket');
        broadcastToUser(targetUserId, { type: 'vacay:cancelled' });
    }
    catch { /* */ }
}
// ---------------------------------------------------------------------------
// Plan dissolution
// ---------------------------------------------------------------------------
function dissolvePlan(userId, socketId) {
    const plan = getActivePlan(userId);
    const isOwnerFlag = plan.owner_id === userId;
    const allUserIds = getPlanUsers(plan.id).map(u => u.id);
    const companyHolidays = database_1.db.prepare('SELECT date, note FROM vacay_company_holidays WHERE plan_id = ?').all(plan.id);
    if (isOwnerFlag) {
        const members = database_1.db.prepare("SELECT user_id FROM vacay_plan_members WHERE plan_id = ? AND status = 'accepted'").all(plan.id);
        for (const m of members) {
            const memberPlan = getOwnPlan(m.user_id);
            database_1.db.prepare('UPDATE vacay_entries SET plan_id = ? WHERE plan_id = ? AND user_id = ?').run(memberPlan.id, plan.id, m.user_id);
            for (const ch of companyHolidays) {
                database_1.db.prepare('INSERT OR IGNORE INTO vacay_company_holidays (plan_id, date, note) VALUES (?, ?, ?)').run(memberPlan.id, ch.date, ch.note);
            }
        }
        database_1.db.prepare('DELETE FROM vacay_plan_members WHERE plan_id = ?').run(plan.id);
    }
    else {
        const ownPlan = getOwnPlan(userId);
        database_1.db.prepare('UPDATE vacay_entries SET plan_id = ? WHERE plan_id = ? AND user_id = ?').run(ownPlan.id, plan.id, userId);
        for (const ch of companyHolidays) {
            database_1.db.prepare('INSERT OR IGNORE INTO vacay_company_holidays (plan_id, date, note) VALUES (?, ?, ?)').run(ownPlan.id, ch.date, ch.note);
        }
        database_1.db.prepare("DELETE FROM vacay_plan_members WHERE plan_id = ? AND user_id = ?").run(plan.id, userId);
    }
    try {
        const { broadcastToUser } = require('../websocket');
        allUserIds.filter(id => id !== userId).forEach(id => broadcastToUser(id, { type: 'vacay:dissolved' }));
    }
    catch { /* */ }
}
// ---------------------------------------------------------------------------
// Available users
// ---------------------------------------------------------------------------
function getAvailableUsers(userId, planId) {
    return database_1.db.prepare(`
    SELECT u.id, u.username, u.email FROM users u
    WHERE u.id != ?
    AND u.id NOT IN (SELECT user_id FROM vacay_plan_members WHERE plan_id = ?)
    AND u.id NOT IN (SELECT user_id FROM vacay_plan_members WHERE status = 'accepted')
    AND u.id NOT IN (SELECT owner_id FROM vacay_plans WHERE id IN (
      SELECT plan_id FROM vacay_plan_members WHERE status = 'accepted'
    ))
    ORDER BY u.username
  `).all(userId, planId);
}
// ---------------------------------------------------------------------------
// Years
// ---------------------------------------------------------------------------
function listYears(planId) {
    const rows = database_1.db.prepare('SELECT year FROM vacay_years WHERE plan_id = ? ORDER BY year').all(planId);
    return rows.map(y => y.year);
}
function addYear(planId, year, socketId) {
    try {
        database_1.db.prepare('INSERT INTO vacay_years (plan_id, year) VALUES (?, ?)').run(planId, year);
        const plan = database_1.db.prepare('SELECT * FROM vacay_plans WHERE id = ?').get(planId);
        const carryOverEnabled = plan ? !!plan.carry_over_enabled : true;
        const users = getPlanUsers(planId);
        for (const u of users) {
            let carriedOver = 0;
            if (carryOverEnabled) {
                const prevConfig = database_1.db.prepare('SELECT * FROM vacay_user_years WHERE user_id = ? AND plan_id = ? AND year = ?').get(u.id, planId, year - 1);
                if (prevConfig) {
                    const used = database_1.db.prepare("SELECT COUNT(*) as count FROM vacay_entries WHERE user_id = ? AND plan_id = ? AND date LIKE ?").get(u.id, planId, `${year - 1}-%`).count;
                    const total = prevConfig.vacation_days + prevConfig.carried_over;
                    carriedOver = Math.max(0, total - used);
                }
            }
            database_1.db.prepare('INSERT OR IGNORE INTO vacay_user_years (user_id, plan_id, year, vacation_days, carried_over) VALUES (?, ?, ?, 30, ?)').run(u.id, planId, year, carriedOver);
        }
    }
    catch { /* year already exists */ }
    notifyPlanUsers(planId, socketId, 'vacay:settings');
    return listYears(planId);
}
function deleteYear(planId, year, socketId) {
    database_1.db.prepare('DELETE FROM vacay_years WHERE plan_id = ? AND year = ?').run(planId, year);
    database_1.db.prepare("DELETE FROM vacay_entries WHERE plan_id = ? AND date LIKE ?").run(planId, `${year}-%`);
    database_1.db.prepare("DELETE FROM vacay_company_holidays WHERE plan_id = ? AND date LIKE ?").run(planId, `${year}-%`);
    database_1.db.prepare('DELETE FROM vacay_user_years WHERE plan_id = ? AND year = ?').run(planId, year);
    // Recalculate carry-over for year+1 if it exists, since its previous year has changed
    const nextYearExists = database_1.db.prepare('SELECT id FROM vacay_years WHERE plan_id = ? AND year = ?').get(planId, year + 1);
    if (nextYearExists) {
        const plan = database_1.db.prepare('SELECT * FROM vacay_plans WHERE id = ?').get(planId);
        const carryOverEnabled = plan ? !!plan.carry_over_enabled : true;
        const users = getPlanUsers(planId);
        const prevYear = database_1.db.prepare('SELECT year FROM vacay_years WHERE plan_id = ? AND year < ? ORDER BY year DESC LIMIT 1').get(planId, year + 1);
        for (const u of users) {
            let carry = 0;
            if (carryOverEnabled && prevYear) {
                const prevConfig = database_1.db.prepare('SELECT * FROM vacay_user_years WHERE user_id = ? AND plan_id = ? AND year = ?').get(u.id, planId, prevYear.year);
                if (prevConfig) {
                    const used = database_1.db.prepare("SELECT COUNT(*) as count FROM vacay_entries WHERE user_id = ? AND plan_id = ? AND date LIKE ?").get(u.id, planId, `${prevYear.year}-%`).count;
                    const total = prevConfig.vacation_days + prevConfig.carried_over;
                    carry = Math.max(0, total - used);
                }
            }
            database_1.db.prepare('UPDATE vacay_user_years SET carried_over = ? WHERE user_id = ? AND plan_id = ? AND year = ?').run(carry, u.id, planId, year + 1);
        }
    }
    notifyPlanUsers(planId, socketId, 'vacay:settings');
    return listYears(planId);
}
// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------
function getEntries(planId, year) {
    const entries = database_1.db.prepare(`
    SELECT e.*, u.username as person_name, COALESCE(c.color, '#6366f1') as person_color
    FROM vacay_entries e
    JOIN users u ON e.user_id = u.id
    LEFT JOIN vacay_user_colors c ON c.user_id = e.user_id AND c.plan_id = e.plan_id
    WHERE e.plan_id = ? AND e.date LIKE ?
  `).all(planId, `${year}-%`);
    const companyHolidays = database_1.db.prepare("SELECT * FROM vacay_company_holidays WHERE plan_id = ? AND date LIKE ?").all(planId, `${year}-%`);
    return { entries, companyHolidays };
}
function toggleEntry(userId, planId, date, socketId) {
    const existing = database_1.db.prepare('SELECT id FROM vacay_entries WHERE user_id = ? AND date = ? AND plan_id = ?').get(userId, date, planId);
    if (existing) {
        database_1.db.prepare('DELETE FROM vacay_entries WHERE id = ?').run(existing.id);
        notifyPlanUsers(planId, socketId);
        return { action: 'removed' };
    }
    else {
        database_1.db.prepare('INSERT INTO vacay_entries (plan_id, user_id, date, note) VALUES (?, ?, ?, ?)').run(planId, userId, date, '');
        notifyPlanUsers(planId, socketId);
        return { action: 'added' };
    }
}
function toggleCompanyHoliday(planId, date, note, socketId) {
    const existing = database_1.db.prepare('SELECT id FROM vacay_company_holidays WHERE plan_id = ? AND date = ?').get(planId, date);
    if (existing) {
        database_1.db.prepare('DELETE FROM vacay_company_holidays WHERE id = ?').run(existing.id);
        notifyPlanUsers(planId, socketId);
        return { action: 'removed' };
    }
    else {
        database_1.db.prepare('INSERT INTO vacay_company_holidays (plan_id, date, note) VALUES (?, ?, ?)').run(planId, date, note || '');
        database_1.db.prepare('DELETE FROM vacay_entries WHERE plan_id = ? AND date = ?').run(planId, date);
        notifyPlanUsers(planId, socketId);
        return { action: 'added' };
    }
}
// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
function getStats(planId, year) {
    const plan = database_1.db.prepare('SELECT * FROM vacay_plans WHERE id = ?').get(planId);
    const carryOverEnabled = plan ? !!plan.carry_over_enabled : true;
    const users = getPlanUsers(planId);
    return users.map(u => {
        const used = database_1.db.prepare("SELECT COUNT(*) as count FROM vacay_entries WHERE user_id = ? AND plan_id = ? AND date LIKE ?").get(u.id, planId, `${year}-%`).count;
        const config = database_1.db.prepare('SELECT * FROM vacay_user_years WHERE user_id = ? AND plan_id = ? AND year = ?').get(u.id, planId, year);
        const vacationDays = config ? config.vacation_days : 30;
        const carriedOver = carryOverEnabled ? (config ? config.carried_over : 0) : 0;
        const total = vacationDays + carriedOver;
        const remaining = total - used;
        const colorRow = database_1.db.prepare('SELECT color FROM vacay_user_colors WHERE user_id = ? AND plan_id = ?').get(u.id, planId);
        const nextYearExists = database_1.db.prepare('SELECT id FROM vacay_years WHERE plan_id = ? AND year = ?').get(planId, year + 1);
        if (nextYearExists && carryOverEnabled) {
            const carry = Math.max(0, remaining);
            database_1.db.prepare(`
        INSERT INTO vacay_user_years (user_id, plan_id, year, vacation_days, carried_over) VALUES (?, ?, ?, 30, ?)
        ON CONFLICT(user_id, plan_id, year) DO UPDATE SET carried_over = ?
      `).run(u.id, planId, year + 1, carry, carry);
        }
        return {
            user_id: u.id, person_name: u.username, person_color: colorRow?.color || '#6366f1',
            year, vacation_days: vacationDays, carried_over: carriedOver,
            total_available: total, used, remaining,
        };
    });
}
function updateStats(userId, planId, year, vacationDays, socketId) {
    database_1.db.prepare(`
    INSERT INTO vacay_user_years (user_id, plan_id, year, vacation_days, carried_over) VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(user_id, plan_id, year) DO UPDATE SET vacation_days = excluded.vacation_days
  `).run(userId, planId, year, vacationDays);
    notifyPlanUsers(planId, socketId);
}
// ---------------------------------------------------------------------------
// GET /plan composite
// ---------------------------------------------------------------------------
function getPlanData(userId) {
    const plan = getActivePlan(userId);
    const activePlanId = plan.id;
    const users = getPlanUsers(activePlanId).map(u => {
        const colorRow = database_1.db.prepare('SELECT color FROM vacay_user_colors WHERE user_id = ? AND plan_id = ?').get(u.id, activePlanId);
        return { ...u, color: colorRow?.color || '#6366f1' };
    });
    const pendingInvites = database_1.db.prepare(`
    SELECT m.id, m.user_id, u.username, u.email, m.created_at
    FROM vacay_plan_members m JOIN users u ON m.user_id = u.id
    WHERE m.plan_id = ? AND m.status = 'pending'
  `).all(activePlanId);
    const incomingInvites = database_1.db.prepare(`
    SELECT m.id, m.plan_id, u.username, u.email, m.created_at
    FROM vacay_plan_members m
    JOIN vacay_plans p ON m.plan_id = p.id
    JOIN users u ON p.owner_id = u.id
    WHERE m.user_id = ? AND m.status = 'pending'
  `).all(userId);
    const holidayCalendars = database_1.db.prepare('SELECT * FROM vacay_holiday_calendars WHERE plan_id = ? ORDER BY sort_order, id').all(activePlanId);
    return {
        plan: {
            ...plan,
            block_weekends: !!plan.block_weekends,
            holidays_enabled: !!plan.holidays_enabled,
            company_holidays_enabled: !!plan.company_holidays_enabled,
            carry_over_enabled: !!plan.carry_over_enabled,
            holiday_calendars: holidayCalendars,
        },
        users,
        pendingInvites,
        incomingInvites,
        isOwner: plan.owner_id === userId,
        isFused: users.length > 1,
    };
}
// ---------------------------------------------------------------------------
// Holidays (nager.at proxy with cache)
// ---------------------------------------------------------------------------
async function getCountries() {
    const cacheKey = 'countries';
    const cached = holidayCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL)
        return { data: cached.data };
    try {
        const resp = await fetch('https://date.nager.at/api/v3/AvailableCountries');
        const data = await resp.json();
        holidayCache.set(cacheKey, { data, time: Date.now() });
        return { data };
    }
    catch {
        return { error: 'Failed to fetch countries' };
    }
}
async function getHolidays(year, country) {
    const cacheKey = `${year}-${country}`;
    const cached = holidayCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL)
        return { data: cached.data };
    try {
        const resp = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`);
        const data = await resp.json();
        holidayCache.set(cacheKey, { data, time: Date.now() });
        return { data };
    }
    catch {
        return { error: 'Failed to fetch holidays' };
    }
}
