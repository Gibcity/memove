"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VacayController = void 0;
const common_1 = require("@nestjs/common");
const vacay_service_1 = require("./vacay.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
/**
 * /api/addons/vacay — shared vacation-day planner.
 *
 * Byte-identical to the legacy Express route (server/src/routes/vacay.ts): all
 * endpoints require auth; the X-Socket-Id header is forwarded to the services so
 * the originating client is excluded from the broadcast; POSTs answer 200 (the
 * legacy route uses res.json, not 201); and the bespoke 400/403/404/502 bodies
 * are reproduced exactly. No addon gate — the legacy mount has none.
 */
let VacayController = class VacayController {
    vacay;
    constructor(vacay) {
        this.vacay = vacay;
    }
    getPlan(user) {
        return this.vacay.getPlanData(user.id);
    }
    async updatePlan(user, body, socketId) {
        const planId = this.vacay.getActivePlanId(user.id);
        return this.vacay.updatePlan(planId, body, socketId);
    }
    addHolidayCalendar(user, body, socketId) {
        if (!body.region) {
            throw new common_1.HttpException({ error: 'region required' }, 400);
        }
        const planId = this.vacay.getActivePlanId(user.id);
        const calendar = this.vacay.addHolidayCalendar(planId, body.region, body.label ?? null, body.color, body.sort_order, socketId);
        return { calendar };
    }
    updateHolidayCalendar(user, idParam, body, socketId) {
        const id = parseInt(idParam);
        const planId = this.vacay.getActivePlanId(user.id);
        const calendar = this.vacay.updateHolidayCalendar(id, planId, body, socketId);
        if (!calendar) {
            throw new common_1.HttpException({ error: 'Calendar not found' }, 404);
        }
        return { calendar };
    }
    deleteHolidayCalendar(user, idParam, socketId) {
        const id = parseInt(idParam);
        const planId = this.vacay.getActivePlanId(user.id);
        if (!this.vacay.deleteHolidayCalendar(id, planId, socketId)) {
            throw new common_1.HttpException({ error: 'Calendar not found' }, 404);
        }
        return { success: true };
    }
    setColor(user, body, socketId) {
        const planId = this.vacay.getActivePlanId(user.id);
        const userId = body.target_user_id ? parseInt(String(body.target_user_id)) : user.id;
        if (!this.vacay.getPlanUsers(planId).find((u) => u.id === userId)) {
            throw new common_1.HttpException({ error: 'User not in plan' }, 403);
        }
        this.vacay.setUserColor(userId, planId, body.color, socketId);
        return { success: true };
    }
    invite(user, userIdInput) {
        if (!userIdInput) {
            throw new common_1.HttpException({ error: 'user_id required' }, 400);
        }
        const plan = this.vacay.getActivePlan(user.id);
        const result = this.vacay.sendInvite(plan.id, user.id, user.username, user.email, userIdInput);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        return { success: true };
    }
    acceptInvite(user, planId, socketId) {
        const result = this.vacay.acceptInvite(user.id, planId, socketId);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, result.status);
        }
        return { success: true };
    }
    declineInvite(user, planId, socketId) {
        this.vacay.declineInvite(user.id, planId, socketId);
        return { success: true };
    }
    cancelInvite(user, targetUserId) {
        const plan = this.vacay.getActivePlan(user.id);
        this.vacay.cancelInvite(plan.id, targetUserId);
        return { success: true };
    }
    dissolve(user, socketId) {
        this.vacay.dissolvePlan(user.id, socketId);
        return { success: true };
    }
    availableUsers(user) {
        const planId = this.vacay.getActivePlanId(user.id);
        return { users: this.vacay.getAvailableUsers(user.id, planId) };
    }
    years(user) {
        const planId = this.vacay.getActivePlanId(user.id);
        return { years: this.vacay.listYears(planId) };
    }
    addYear(user, year, socketId) {
        if (!year) {
            throw new common_1.HttpException({ error: 'Year required' }, 400);
        }
        const planId = this.vacay.getActivePlanId(user.id);
        return { years: this.vacay.addYear(planId, year, socketId) };
    }
    deleteYear(user, yearParam, socketId) {
        const year = parseInt(yearParam);
        const planId = this.vacay.getActivePlanId(user.id);
        return { years: this.vacay.deleteYear(planId, year, socketId) };
    }
    entries(user, year) {
        const planId = this.vacay.getActivePlanId(user.id);
        return this.vacay.getEntries(planId, year);
    }
    toggleEntry(user, body, socketId) {
        if (!body.date) {
            throw new common_1.HttpException({ error: 'date required' }, 400);
        }
        const planId = this.vacay.getActivePlanId(user.id);
        let userId = user.id;
        if (body.target_user_id && parseInt(String(body.target_user_id)) !== user.id) {
            const tid = parseInt(String(body.target_user_id));
            if (!this.vacay.getPlanUsers(planId).find((u) => u.id === tid)) {
                throw new common_1.HttpException({ error: 'User not in plan' }, 403);
            }
            userId = tid;
        }
        return this.vacay.toggleEntry(userId, planId, body.date, socketId);
    }
    companyHoliday(user, body, socketId) {
        const planId = this.vacay.getActivePlanId(user.id);
        return this.vacay.toggleCompanyHoliday(planId, body.date, body.note, socketId);
    }
    stats(user, yearParam) {
        const year = parseInt(yearParam);
        const planId = this.vacay.getActivePlanId(user.id);
        return { stats: this.vacay.getStats(planId, year) };
    }
    updateStats(user, yearParam, body, socketId) {
        const year = parseInt(yearParam);
        const planId = this.vacay.getActivePlanId(user.id);
        const userId = body.target_user_id ? parseInt(String(body.target_user_id)) : user.id;
        if (!this.vacay.getPlanUsers(planId).find((u) => u.id === userId)) {
            throw new common_1.HttpException({ error: 'User not in plan' }, 403);
        }
        this.vacay.updateStats(userId, planId, year, body.vacation_days, socketId);
        return { success: true };
    }
    async holidayCountries() {
        const result = await this.vacay.getCountries();
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, 502);
        }
        return result.data;
    }
    async holidays(year, country) {
        const result = await this.vacay.getHolidays(year, country);
        if (result.error) {
            throw new common_1.HttpException({ error: result.error }, 502);
        }
        return result.data;
    }
};
exports.VacayController = VacayController;
__decorate([
    (0, common_1.Get)('plan'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "getPlan", null);
__decorate([
    (0, common_1.Put)('plan'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], VacayController.prototype, "updatePlan", null);
__decorate([
    (0, common_1.Post)('plan/holiday-calendars'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "addHolidayCalendar", null);
__decorate([
    (0, common_1.Put)('plan/holiday-calendars/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "updateHolidayCalendar", null);
__decorate([
    (0, common_1.Delete)('plan/holiday-calendars/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "deleteHolidayCalendar", null);
__decorate([
    (0, common_1.Put)('color'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "setColor", null);
__decorate([
    (0, common_1.Post)('invite'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)('user_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "invite", null);
__decorate([
    (0, common_1.Post)('invite/accept'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)('plan_id')),
    __param(2, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, String]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "acceptInvite", null);
__decorate([
    (0, common_1.Post)('invite/decline'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)('plan_id')),
    __param(2, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, String]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "declineInvite", null);
__decorate([
    (0, common_1.Post)('invite/cancel'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)('user_id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "cancelInvite", null);
__decorate([
    (0, common_1.Post)('dissolve'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "dissolve", null);
__decorate([
    (0, common_1.Get)('available-users'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "availableUsers", null);
__decorate([
    (0, common_1.Get)('years'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "years", null);
__decorate([
    (0, common_1.Post)('years'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)('year')),
    __param(2, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Number, String]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "addYear", null);
__decorate([
    (0, common_1.Delete)('years/:year'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('year')),
    __param(2, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "deleteYear", null);
__decorate([
    (0, common_1.Get)('entries/:year'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('year')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "entries", null);
__decorate([
    (0, common_1.Post)('entries/toggle'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "toggleEntry", null);
__decorate([
    (0, common_1.Post)('entries/company-holiday'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "companyHoliday", null);
__decorate([
    (0, common_1.Get)('stats/:year'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('year')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "stats", null);
__decorate([
    (0, common_1.Put)('stats/:year'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('year')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], VacayController.prototype, "updateStats", null);
__decorate([
    (0, common_1.Get)('holidays/countries'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], VacayController.prototype, "holidayCountries", null);
__decorate([
    (0, common_1.Get)('holidays/:year/:country'),
    __param(0, (0, common_1.Param)('year')),
    __param(1, (0, common_1.Param)('country')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], VacayController.prototype, "holidays", null);
exports.VacayController = VacayController = __decorate([
    (0, common_1.Controller)('api/addons/vacay'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [vacay_service_1.VacayService])
], VacayController);
