"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerVacayTools = registerVacayTools;
const zod_1 = require("zod");
const authService_1 = require("../../services/authService");
const vacayService_1 = require("../../services/vacayService");
const adminService_1 = require("../../services/adminService");
const addons_1 = require("../../addons");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
function registerVacayTools(server, userId, scopes) {
    const R = (0, scopes_1.canRead)(scopes, 'vacay');
    const W = (0, scopes_1.canWrite)(scopes, 'vacay');
    if ((0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.VACAY)) {
        if (R)
            server.registerTool('get_vacay_plan', {
                description: "Get the current user's active vacation plan (own or joined).",
                inputSchema: {},
                annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
            }, async () => {
                const plan = (0, vacayService_1.getPlanData)(userId);
                return (0, _shared_1.ok)({ plan });
            });
        if (W)
            server.registerTool('update_vacay_plan', {
                description: 'Update vacation plan settings (weekends blocking, holidays, carry-over).',
                inputSchema: {
                    block_weekends: zod_1.z.boolean().optional(),
                    holidays_enabled: zod_1.z.boolean().optional(),
                    holidays_region: zod_1.z.string().nullable().optional(),
                    company_holidays_enabled: zod_1.z.boolean().optional(),
                    carry_over_enabled: zod_1.z.boolean().optional(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
            }, async ({ block_weekends, holidays_enabled, holidays_region, company_holidays_enabled, carry_over_enabled }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                // updatePlan already returns the fully-hydrated { plan }; surface it so the
                // AI consumer sees the updated plan, matching get_vacay_plan.
                const result = await (0, vacayService_1.updatePlan)(planId, { block_weekends, holidays_enabled, holidays_region, company_holidays_enabled, carry_over_enabled }, undefined);
                return (0, _shared_1.ok)(result);
            });
        if (W)
            server.registerTool('set_vacay_color', {
                description: "Set the current user's color in the vacation plan calendar.",
                inputSchema: {
                    color: zod_1.z.string().describe('Hex color e.g. #6366f1'),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
            }, async ({ color }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                (0, vacayService_1.setUserColor)(userId, planId, color, undefined);
                // Echo the persisted color (mirrors the service default) so the AI consumer sees what was set.
                return (0, _shared_1.ok)({ success: true, color: color || '#6366f1' });
            });
        if (R)
            server.registerTool('get_available_vacay_users', {
                description: 'List users who can be invited to the current vacation plan.',
                inputSchema: {},
                annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
            }, async () => {
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                const users = (0, vacayService_1.getAvailableUsers)(userId, planId);
                return (0, _shared_1.ok)({ users });
            });
        if (W)
            server.registerTool('send_vacay_invite', {
                description: 'Invite a user to join the vacation plan by their user ID.',
                inputSchema: {
                    targetUserId: zod_1.z.number().int().positive(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
            }, async ({ targetUserId }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                const me = (0, authService_1.getCurrentUser)(userId);
                if (!me)
                    return { content: [{ type: 'text', text: 'User not found.' }], isError: true };
                const result = (0, vacayService_1.sendInvite)(planId, userId, me.username, me.email, targetUserId);
                if (result.error)
                    return { content: [{ type: 'text', text: result.error }], isError: true };
                return (0, _shared_1.ok)({ success: true });
            });
        if (W)
            server.registerTool('accept_vacay_invite', {
                description: 'Accept a pending invitation to join another user\'s vacation plan.',
                inputSchema: {
                    planId: zod_1.z.number().int().positive(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
            }, async ({ planId }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                const result = (0, vacayService_1.acceptInvite)(userId, planId, undefined);
                if (result.error)
                    return { content: [{ type: 'text', text: result.error }], isError: true };
                return (0, _shared_1.ok)({ success: true });
            });
        if (W)
            server.registerTool('decline_vacay_invite', {
                description: 'Decline a pending vacation plan invitation.',
                inputSchema: {
                    planId: zod_1.z.number().int().positive(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
            }, async ({ planId }) => {
                (0, vacayService_1.declineInvite)(userId, planId, undefined);
                return (0, _shared_1.ok)({ success: true });
            });
        if (W)
            server.registerTool('cancel_vacay_invite', {
                description: 'Cancel an outgoing invitation (owner cancels invite they sent).',
                inputSchema: {
                    targetUserId: zod_1.z.number().int().positive(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
            }, async ({ targetUserId }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                (0, vacayService_1.cancelInvite)(planId, targetUserId);
                return (0, _shared_1.ok)({ success: true });
            });
        if (W)
            server.registerTool('dissolve_vacay_plan', {
                description: 'Dissolve the shared plan — all members are removed and everyone returns to their own individual plan.',
                inputSchema: {},
                annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
            }, async () => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                (0, vacayService_1.dissolvePlan)(userId, undefined);
                return (0, _shared_1.ok)({ success: true });
            });
        if (R)
            server.registerTool('list_vacay_years', {
                description: 'List calendar years tracked in the current vacation plan.',
                inputSchema: {},
                annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
            }, async () => {
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                const years = (0, vacayService_1.listYears)(planId);
                return (0, _shared_1.ok)({ years });
            });
        if (W)
            server.registerTool('add_vacay_year', {
                description: 'Add a calendar year to the vacation plan.',
                inputSchema: {
                    year: zod_1.z.number().int().min(2000).max(2100),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
            }, async ({ year }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                const years = (0, vacayService_1.addYear)(planId, year, undefined);
                return (0, _shared_1.ok)({ years });
            });
        if (W)
            server.registerTool('delete_vacay_year', {
                description: 'Remove a calendar year from the vacation plan.',
                inputSchema: {
                    year: zod_1.z.number().int(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
            }, async ({ year }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                const years = (0, vacayService_1.deleteYear)(planId, year, undefined);
                return (0, _shared_1.ok)({ years });
            });
        if (R)
            server.registerTool('get_vacay_entries', {
                description: 'Get all vacation day entries for a plan and year.',
                inputSchema: {
                    year: zod_1.z.number().int(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
            }, async ({ year }) => {
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                const entries = (0, vacayService_1.getEntries)(planId, String(year));
                return (0, _shared_1.ok)({ entries });
            });
        if (W)
            server.registerTool('toggle_vacay_entry', {
                description: 'Toggle a day on or off as a vacation day for the current user.',
                inputSchema: {
                    date: zod_1.z.string().describe('ISO date YYYY-MM-DD'),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
            }, async ({ date }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                const result = (0, vacayService_1.toggleEntry)(userId, planId, date, undefined);
                return (0, _shared_1.ok)(result);
            });
        if (W)
            server.registerTool('toggle_company_holiday', {
                description: 'Toggle a date as a company holiday for the whole plan.',
                inputSchema: {
                    date: zod_1.z.string(),
                    note: zod_1.z.string().optional(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
            }, async ({ date, note }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                const result = (0, vacayService_1.toggleCompanyHoliday)(planId, date, note, undefined);
                return (0, _shared_1.ok)(result);
            });
        if (R)
            server.registerTool('get_vacay_stats', {
                description: 'Get vacation statistics for a specific year (days used, remaining, carried over).',
                inputSchema: {
                    year: zod_1.z.number().int(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
            }, async ({ year }) => {
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                const stats = (0, vacayService_1.getStats)(planId, year);
                return (0, _shared_1.ok)({ stats });
            });
        if (W)
            server.registerTool('update_vacay_stats', {
                description: 'Update the vacation day allowance for a specific user and year.',
                inputSchema: {
                    year: zod_1.z.number().int(),
                    vacationDays: zod_1.z.number().int().min(0),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
            }, async ({ year, vacationDays }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                (0, vacayService_1.updateStats)(userId, planId, year, vacationDays, undefined);
                return (0, _shared_1.ok)({ success: true });
            });
        if (W)
            server.registerTool('add_holiday_calendar', {
                description: 'Add a public holiday calendar (by region code) to the vacation plan.',
                inputSchema: {
                    region: zod_1.z.string().describe('Country/region code e.g. US, GB, DE'),
                    label: zod_1.z.string().nullable().optional(),
                    color: zod_1.z.string().optional(),
                    sortOrder: zod_1.z.number().int().optional(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
            }, async ({ region, label, color, sortOrder }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                const calendar = (0, vacayService_1.addHolidayCalendar)(planId, region, label ?? null, color, sortOrder, undefined);
                return (0, _shared_1.ok)({ calendar });
            });
        if (W)
            server.registerTool('update_holiday_calendar', {
                description: 'Update label or color for a holiday calendar.',
                inputSchema: {
                    calendarId: zod_1.z.number().int().positive(),
                    label: zod_1.z.string().nullable().optional(),
                    color: zod_1.z.string().optional(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
            }, async ({ calendarId, label, color }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                const cal = (0, vacayService_1.updateHolidayCalendar)(calendarId, planId, { label, color }, undefined);
                if (!cal)
                    return { content: [{ type: 'text', text: 'Holiday calendar not found.' }], isError: true };
                return (0, _shared_1.ok)({ calendar: cal });
            });
        if (W)
            server.registerTool('delete_holiday_calendar', {
                description: 'Remove a holiday calendar from the vacation plan.',
                inputSchema: {
                    calendarId: zod_1.z.number().int().positive(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
            }, async ({ calendarId }) => {
                if ((0, authService_1.isDemoUser)(userId))
                    return (0, _shared_1.demoDenied)();
                const planId = (0, vacayService_1.getActivePlanId)(userId);
                (0, vacayService_1.deleteHolidayCalendar)(calendarId, planId, undefined);
                return (0, _shared_1.ok)({ success: true });
            });
        if (R)
            server.registerTool('list_holiday_countries', {
                description: 'List countries available for public holiday calendars.',
                inputSchema: {},
                annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
            }, async () => {
                const result = await (0, vacayService_1.getCountries)();
                if (result.error)
                    return { content: [{ type: 'text', text: result.error }], isError: true };
                return (0, _shared_1.ok)({ countries: result.data });
            });
        if (R)
            server.registerTool('list_holidays', {
                description: 'List public holidays for a country and year.',
                inputSchema: {
                    country: zod_1.z.string().describe('ISO 3166-1 alpha-2 code'),
                    year: zod_1.z.number().int(),
                },
                annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
            }, async ({ country, year }) => {
                const result = await (0, vacayService_1.getHolidays)(String(year), country);
                if (result.error)
                    return { content: [{ type: 'text', text: result.error }], isError: true };
                return (0, _shared_1.ok)({ holidays: result.data });
            });
    }
}
