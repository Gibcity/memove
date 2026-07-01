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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
exports.VacayService = void 0;
const common_1 = require("@nestjs/common");
const svc = __importStar(require("../../services/vacayService"));
/**
 * Thin Nest wrapper around the existing vacay service. All plan logic, the
 * holiday-calendar handling, invite flow and the WebSocket broadcasts (driven by
 * the forwarded socket id) stay in vacayService, so behaviour is unchanged.
 */
let VacayService = class VacayService {
    getPlanData(userId) {
        return svc.getPlanData(userId);
    }
    getActivePlanId(userId) {
        return svc.getActivePlanId(userId);
    }
    getActivePlan(userId) {
        return svc.getActivePlan(userId);
    }
    updatePlan(planId, body, socketId) {
        return svc.updatePlan(planId, body, socketId);
    }
    addHolidayCalendar(planId, region, label, color, sortOrder, socketId) {
        return svc.addHolidayCalendar(planId, region, label, color, sortOrder, socketId);
    }
    updateHolidayCalendar(id, planId, body, socketId) {
        return svc.updateHolidayCalendar(id, planId, body, socketId);
    }
    deleteHolidayCalendar(id, planId, socketId) {
        return svc.deleteHolidayCalendar(id, planId, socketId);
    }
    getPlanUsers(planId) {
        return svc.getPlanUsers(planId);
    }
    setUserColor(userId, planId, color, socketId) {
        svc.setUserColor(userId, planId, color, socketId);
    }
    sendInvite(planId, inviterId, inviterUsername, inviterEmail, targetUserId) {
        return svc.sendInvite(planId, inviterId, inviterUsername, inviterEmail, targetUserId);
    }
    acceptInvite(userId, planId, socketId) {
        return svc.acceptInvite(userId, planId, socketId);
    }
    declineInvite(userId, planId, socketId) {
        svc.declineInvite(userId, planId, socketId);
    }
    cancelInvite(planId, targetUserId) {
        svc.cancelInvite(planId, targetUserId);
    }
    dissolvePlan(userId, socketId) {
        svc.dissolvePlan(userId, socketId);
    }
    getAvailableUsers(userId, planId) {
        return svc.getAvailableUsers(userId, planId);
    }
    listYears(planId) {
        return svc.listYears(planId);
    }
    addYear(planId, year, socketId) {
        return svc.addYear(planId, year, socketId);
    }
    deleteYear(planId, year, socketId) {
        return svc.deleteYear(planId, year, socketId);
    }
    getEntries(planId, year) {
        return svc.getEntries(planId, year);
    }
    toggleEntry(userId, planId, date, socketId) {
        return svc.toggleEntry(userId, planId, date, socketId);
    }
    toggleCompanyHoliday(planId, date, note, socketId) {
        return svc.toggleCompanyHoliday(planId, date, note, socketId);
    }
    getStats(planId, year) {
        return svc.getStats(planId, year);
    }
    updateStats(userId, planId, year, vacationDays, socketId) {
        svc.updateStats(userId, planId, year, vacationDays, socketId);
    }
    getCountries() {
        return svc.getCountries();
    }
    getHolidays(year, country) {
        return svc.getHolidays(year, country);
    }
};
exports.VacayService = VacayService;
exports.VacayService = VacayService = __decorate([
    (0, common_1.Injectable)()
], VacayService);
