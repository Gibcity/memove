"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBudgetTools = registerBudgetTools;
const zod_1 = require("zod");
const database_1 = require("../../db/database");
const authService_1 = require("../../services/authService");
const budgetService_1 = require("../../services/budgetService");
const exchangeRateService_1 = require("../../services/exchangeRateService");
const tripService_1 = require("../../services/tripService");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
/** Reusable Zod shape for the per-payer amounts on a budget item. */
const payersSchema = zod_1.z.array(zod_1.z.object({
    user_id: zod_1.z.number().int().positive(),
    amount: zod_1.z.number().nonnegative(),
})).describe('Who actually paid, and how much each paid, in the expense currency. Ask the user; do not guess.');
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
/**
 * Resolve the equal-split participants for a new budget item. When member_ids is
 * omitted, default to the whole trip (owner + all members), deduped — reproducing
 * the client's own create flow (CostsPanel seeds participants from all members).
 * An explicit empty array means "planning-only, no split" and is passed through.
 */
function resolveMemberIds(tripId, member_ids) {
    if (member_ids !== undefined)
        return member_ids;
    const owner = (0, tripService_1.getTripOwner)(tripId);
    if (!owner)
        return undefined;
    const { members } = (0, tripService_1.listMembers)(tripId, owner.user_id);
    return Array.from(new Set([owner.user_id, ...members.map(m => m.id)]));
}
function registerBudgetTools(server, userId, scopes) {
    const R = (0, scopes_1.canRead)(scopes, 'budget');
    const W = (0, scopes_1.canWrite)(scopes, 'budget');
    if ((0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.BUDGET)) {
        // --- BUDGET ---
        if (W)
            server.registerTool('create_budget_item', {
                description: 'Add a budget/expense item to a trip. The cost is split equally among member_ids (omit to split across all trip members, or pass [] for a planning-only entry with no split). Use `payers` to record who actually paid and how much. Ask the user which trip members share this expense and who paid — resolve user IDs with list_trip_members — rather than guessing.',
                inputSchema: {
                    tripId: zod_1.z.number().int().positive(),
                    name: zod_1.z.string().min(1).max(200),
                    category: zod_1.z.string().max(100).optional().describe('Budget category (e.g. Accommodation, Food, Transport)'),
                    total_price: zod_1.z.number().nonnegative(),
                    currency: zod_1.z.string().max(10).nullable().optional().describe('ISO currency code (e.g. "EUR"); defaults to the trip currency'),
                    member_ids: zod_1.z.array(zod_1.z.number().int().positive()).optional().describe('Trip member user IDs splitting this expense. Omit to split across all trip members (owner + members); pass [] for no split.'),
                    payers: payersSchema.optional().describe('Who paid how much, in the expense currency. When given, total_price is derived from the sum. Ask the user; do not guess.'),
                    expense_date: zod_1.z.string().max(40).nullable().optional().describe('Date the expense occurred, YYYY-MM-DD'),
                    note: zod_1.z.string().max(500).optional(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
            }, async ({ tripId, name, category, total_price, currency, member_ids, payers, expense_date, note }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                if (!(0, database_1.canAccessTrip)(tripId, userId))
                    return (0, _shared_1.noAccess)();
                if (!(0, _shared_1.hasTripPermission)('budget_edit', tripId, userId))
                    return (0, _shared_1.permissionDenied)();
                const members = resolveMemberIds(tripId, member_ids);
                const item = (0, budgetService_1.createBudgetItem)(tripId, { category, name, total_price, currency, member_ids: members, payers, expense_date, note });
                (0, _shared_1.safeBroadcast)(tripId, 'budget:created', { item });
                return (0, _shared_1.ok)({ item });
            });
        if (W)
            server.registerTool('delete_budget_item', {
                description: 'Delete a budget item from a trip.',
                inputSchema: {
                    tripId: zod_1.z.number().int().positive(),
                    itemId: zod_1.z.number().int().positive(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
            }, async ({ tripId, itemId }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                if (!(0, database_1.canAccessTrip)(tripId, userId))
                    return (0, _shared_1.noAccess)();
                if (!(0, _shared_1.hasTripPermission)('budget_edit', tripId, userId))
                    return (0, _shared_1.permissionDenied)();
                const deleted = (0, budgetService_1.deleteBudgetItem)(itemId, tripId);
                if (!deleted)
                    return { content: [{ type: 'text', text: 'Budget item not found.' }], isError: true };
                (0, _shared_1.safeBroadcast)(tripId, 'budget:deleted', { itemId });
                return (0, _shared_1.ok)({ success: true });
            });
        // --- BUDGET (update) ---
        if (W)
            server.registerTool('update_budget_item', {
                description: 'Update an existing budget/expense item in a trip. You can also re-split it via member_ids and record who actually paid via payers (amounts in the expense currency). When changing who shares an expense or who paid, ask the user rather than guessing; resolve user IDs with list_trip_members.',
                inputSchema: {
                    tripId: zod_1.z.number().int().positive(),
                    itemId: zod_1.z.number().int().positive(),
                    name: zod_1.z.string().min(1).max(200).optional(),
                    category: zod_1.z.string().max(100).optional(),
                    total_price: zod_1.z.number().nonnegative().optional(),
                    member_ids: zod_1.z.array(zod_1.z.number().int().positive()).optional().describe('Trip member user IDs splitting this expense; replaces the current split. Omit to leave unchanged, pass [] for no split.'),
                    payers: payersSchema.optional().describe('Replaces who paid how much, in the expense currency. Omit to leave unchanged. Ask the user; do not guess.'),
                    persons: zod_1.z.number().int().positive().nullable().optional(),
                    days: zod_1.z.number().int().positive().nullable().optional(),
                    note: zod_1.z.string().max(500).nullable().optional(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
            }, async ({ tripId, itemId, name, category, total_price, member_ids, payers, persons, days, note }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                if (!(0, database_1.canAccessTrip)(tripId, userId))
                    return (0, _shared_1.noAccess)();
                if (!(0, _shared_1.hasTripPermission)('budget_edit', tripId, userId))
                    return (0, _shared_1.permissionDenied)();
                const item = (0, budgetService_1.updateBudgetItem)(itemId, tripId, { name, category, total_price, member_ids, payers, persons, days, note });
                if (!item)
                    return { content: [{ type: 'text', text: 'Budget item not found.' }], isError: true };
                (0, _shared_1.safeBroadcast)(tripId, 'budget:updated', { item });
                return (0, _shared_1.ok)({ item });
            });
        // --- BUDGET ADVANCED ---
        if (W)
            server.registerTool('create_budget_item_with_members', {
                description: 'Create a budget/expense item and set the trip members splitting it in one atomic operation. If userIds is omitted, the cost is split across all trip members; pass an explicit list to split among a subset, or an empty array for a planning-only entry with no split. Ask the user which members share this expense rather than guessing; resolve user IDs with list_trip_members. Only use when the item does not yet exist — if it already exists, use set_budget_item_members directly.',
                inputSchema: {
                    tripId: zod_1.z.number().int().positive(),
                    name: zod_1.z.string().min(1).max(200),
                    category: zod_1.z.string().max(100).optional().describe('Budget category (e.g. Accommodation, Food, Transport)'),
                    total_price: zod_1.z.number().nonnegative(),
                    note: zod_1.z.string().max(500).optional(),
                    userIds: zod_1.z.array(zod_1.z.number().int().positive()).optional().describe('User IDs splitting this item; omit to split across all trip members, or pass an empty array for no split'),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
            }, async ({ tripId, name, category, total_price, note, userIds }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                if (!(0, database_1.canAccessTrip)(tripId, userId))
                    return (0, _shared_1.noAccess)();
                if (!(0, _shared_1.hasTripPermission)('budget_edit', tripId, userId))
                    return (0, _shared_1.permissionDenied)();
                // Omitted userIds → default to the whole trip, matching create_budget_item.
                const members = (userIds && userIds.length > 0) ? userIds : resolveMemberIds(tripId, undefined);
                try {
                    const item = database_1.db.transaction(() => {
                        const created = (0, budgetService_1.createBudgetItem)(tripId, { category, name, total_price, note, member_ids: members });
                        return (0, budgetService_1.getBudgetItem)(created.id, tripId);
                    })();
                    (0, _shared_1.safeBroadcast)(tripId, 'budget:created', { item });
                    if (members && members.length > 0)
                        (0, _shared_1.safeBroadcast)(tripId, 'budget:members-updated', { item });
                    return (0, _shared_1.ok)({ item });
                }
                catch {
                    return { content: [{ type: 'text', text: 'Failed to create budget item.' }], isError: true };
                }
            });
        if (W)
            server.registerTool('set_budget_item_members', {
                description: 'Set which trip members are splitting a budget item (replaces current member list). Ask the user which members share the expense; resolve user IDs with list_trip_members.',
                inputSchema: {
                    tripId: zod_1.z.number().int().positive(),
                    itemId: zod_1.z.number().int().positive(),
                    userIds: zod_1.z.array(zod_1.z.number().int().positive()).describe('User IDs splitting this item; empty array clears all'),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
            }, async ({ tripId, itemId, userIds }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                if (!(0, database_1.canAccessTrip)(tripId, userId))
                    return (0, _shared_1.noAccess)();
                if (!(0, _shared_1.hasTripPermission)('budget_edit', tripId, userId))
                    return (0, _shared_1.permissionDenied)();
                const result = (0, budgetService_1.updateMembers)(itemId, tripId, userIds);
                if (!result)
                    return { content: [{ type: 'text', text: 'Budget item not found.' }], isError: true };
                const item = (0, budgetService_1.getBudgetItem)(itemId, tripId);
                (0, _shared_1.safeBroadcast)(tripId, 'budget:members-updated', { item });
                return (0, _shared_1.ok)({ item });
            });
        if (W)
            server.registerTool('toggle_budget_member_paid', {
                description: 'Mark or unmark a member as having paid their share of a budget item.',
                inputSchema: {
                    tripId: zod_1.z.number().int().positive(),
                    itemId: zod_1.z.number().int().positive(),
                    memberId: zod_1.z.number().int().positive().describe('User ID of the member'),
                    paid: zod_1.z.boolean(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
            }, async ({ tripId, itemId, memberId, paid }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                if (!(0, database_1.canAccessTrip)(tripId, userId))
                    return (0, _shared_1.noAccess)();
                if (!(0, _shared_1.hasTripPermission)('budget_edit', tripId, userId))
                    return (0, _shared_1.permissionDenied)();
                const member = (0, budgetService_1.toggleMemberPaid)(itemId, tripId, memberId, paid);
                (0, _shared_1.safeBroadcast)(tripId, 'budget:member-paid-updated', { itemId, member });
                return (0, _shared_1.ok)({ member });
            });
        // --- SETTLEMENTS (settle-up payments between members) ---
        if (R)
            server.registerTool('get_settlement_summary', {
                description: "See each member's net balance and the suggested payments to settle shared expenses. Amounts are in the trip's base currency. Call this before recording a settlement so you know who should pay whom and how much.",
                inputSchema: {
                    tripId: zod_1.z.number().int().positive(),
                    base: zod_1.z.string().max(10).optional().describe('ISO currency code to compute balances in; defaults to the trip currency'),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
            }, async ({ tripId, base }) => {
                if (!(0, database_1.canAccessTrip)(tripId, userId))
                    return (0, _shared_1.noAccess)();
                const trip = database_1.db.prepare('SELECT currency FROM trips WHERE id = ?').get(tripId);
                const tripCurrency = trip?.currency || 'EUR';
                const effectiveBase = (base || tripCurrency).toUpperCase();
                const rates = await (0, exchangeRateService_1.getRates)(effectiveBase);
                const summary = (0, budgetService_1.calculateSettlement)(tripId, { base: effectiveBase, rates, tripCurrency });
                return (0, _shared_1.ok)({ summary });
            });
        if (R)
            server.registerTool('list_settlements', {
                description: 'List the recorded settle-up payments for a trip (who paid whom, how much, when).',
                inputSchema: {
                    tripId: zod_1.z.number().int().positive(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
            }, async ({ tripId }) => {
                if (!(0, database_1.canAccessTrip)(tripId, userId))
                    return (0, _shared_1.noAccess)();
                return (0, _shared_1.ok)({ settlements: (0, budgetService_1.listSettlements)(tripId) });
            });
        if (W)
            server.registerTool('create_settlement', {
                description: "Record a settle-up payment: from_user_id paid to_user_id the given amount (in the trip's base currency) to settle shared expenses. Use get_settlement_summary first to find who owes whom and how much.",
                inputSchema: {
                    tripId: zod_1.z.number().int().positive(),
                    from_user_id: zod_1.z.number().int().positive().describe('User ID of the member who paid'),
                    to_user_id: zod_1.z.number().int().positive().describe('User ID of the member who received the payment'),
                    amount: zod_1.z.number().positive().describe("Amount paid, in the trip's base currency"),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
            }, async ({ tripId, from_user_id, to_user_id, amount }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                if (!(0, database_1.canAccessTrip)(tripId, userId))
                    return (0, _shared_1.noAccess)();
                if (!(0, _shared_1.hasTripPermission)('budget_edit', tripId, userId))
                    return (0, _shared_1.permissionDenied)();
                const settlement = (0, budgetService_1.createSettlement)(tripId, { from_user_id, to_user_id, amount }, userId);
                (0, _shared_1.safeBroadcast)(tripId, 'budget:settlement-created', { settlement });
                return (0, _shared_1.ok)({ settlement });
            });
        if (W)
            server.registerTool('update_settlement', {
                description: 'Update a recorded settle-up payment (who paid, who received, and the amount).',
                inputSchema: {
                    tripId: zod_1.z.number().int().positive(),
                    settlementId: zod_1.z.number().int().positive(),
                    from_user_id: zod_1.z.number().int().positive().describe('User ID of the member who paid'),
                    to_user_id: zod_1.z.number().int().positive().describe('User ID of the member who received the payment'),
                    amount: zod_1.z.number().positive().describe("Amount paid, in the trip's base currency"),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
            }, async ({ tripId, settlementId, from_user_id, to_user_id, amount }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                if (!(0, database_1.canAccessTrip)(tripId, userId))
                    return (0, _shared_1.noAccess)();
                if (!(0, _shared_1.hasTripPermission)('budget_edit', tripId, userId))
                    return (0, _shared_1.permissionDenied)();
                const settlement = (0, budgetService_1.updateSettlement)(settlementId, tripId, { from_user_id, to_user_id, amount });
                if (!settlement)
                    return { content: [{ type: 'text', text: 'Settlement not found.' }], isError: true };
                (0, _shared_1.safeBroadcast)(tripId, 'budget:settlement-updated', { settlement });
                return (0, _shared_1.ok)({ settlement });
            });
        if (W)
            server.registerTool('delete_settlement', {
                description: 'Delete a recorded settle-up payment. This is the undo for create_settlement and restores the affected balances.',
                inputSchema: {
                    tripId: zod_1.z.number().int().positive(),
                    settlementId: zod_1.z.number().int().positive(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
            }, async ({ tripId, settlementId }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                if (!(0, database_1.canAccessTrip)(tripId, userId))
                    return (0, _shared_1.noAccess)();
                if (!(0, _shared_1.hasTripPermission)('budget_edit', tripId, userId))
                    return (0, _shared_1.permissionDenied)();
                const deleted = (0, budgetService_1.deleteSettlement)(settlementId, tripId);
                if (!deleted)
                    return { content: [{ type: 'text', text: 'Settlement not found.' }], isError: true };
                (0, _shared_1.safeBroadcast)(tripId, 'budget:settlement-deleted', { settlementId });
                return (0, _shared_1.ok)({ success: true });
            });
    } // isAddonEnabled(BUDGET)
}
