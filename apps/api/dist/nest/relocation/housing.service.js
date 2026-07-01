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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HousingService = void 0;
const common_1 = require("@nestjs/common");
const relocation_service_1 = require("./relocation.service");
// ponytail: rental lane reads existing cost fields + generates external
// search URLs by string concat. No scraping, no MLS, no API calls.
const AFFORDABILITY_RATIO = 0.3; // 30% rule
function formatMetro(name) {
    // "Austin, TX" → { city: 'austin', state: 'tx' }
    const parts = name.split(',').map((s) => s.trim());
    if (parts.length < 2)
        return null;
    const city = parts[0].toLowerCase().replace(/\s+/g, '');
    const state = parts[1].toLowerCase().replace(/\s+/g, '');
    if (!city || !state)
        return null;
    return { city, state };
}
let HousingService = class HousingService {
    relocation;
    constructor(relocation) {
        this.relocation = relocation;
    }
    requireLocation(id) {
        const loc = this.relocation.getLocationById(id);
        if (!loc)
            throw new common_1.NotFoundException(`Location not found: ${id}`);
        return loc;
    }
    getRentalMarket(locationId) {
        const loc = this.requireLocation(locationId);
        const c = loc.cost;
        const priceToRentRatio = c.medianRent > 0 && c.medianHomeValue > 0
            ? Math.round((c.medianHomeValue / (c.medianRent * 12)) * 100) / 100
            : 0;
        return {
            medianRent: c.medianRent,
            medianHomeValue: c.medianHomeValue,
            propertyTaxRate: c.propertyTaxRate,
            costOfLivingIndex: c.costOfLivingIndex,
            priceToRentRatio,
        };
    }
    getListingLinks(locationId) {
        const loc = this.requireLocation(locationId);
        const fmt = formatMetro(loc.name);
        if (!fmt)
            return [];
        const { city, state } = fmt;
        const ccs = `${city}-${state}`;
        const cs = `${city}_${state}`;
        return [
            { platform: 'Zillow', url: `https://www.zillow.com/${ccs}/apartments/`, type: 'rent' },
            { platform: 'Zillow', url: `https://www.zillow.com/${ccs}/homes/`, type: 'buy' },
            { platform: 'Realtor.com', url: `https://www.realtor.com/apartments/${cs}`, type: 'rent' },
            { platform: 'Apartments.com', url: `https://www.apartments.com/${ccs}/`, type: 'rent' },
            { platform: 'HotPads', url: `https://hotpads.com/${ccs}/apartments-for-rent`, type: 'rent' },
        ];
    }
    getAffordability(locationId, monthlyBudget) {
        const loc = this.requireLocation(locationId);
        const rent = loc.cost.medianRent;
        const recommendedMonthlyIncome = rent > 0 ? Math.round(rent / AFFORDABILITY_RATIO) : 0;
        if (monthlyBudget === undefined || !Number.isFinite(monthlyBudget)) {
            return { medianRent: rent, recommendedMonthlyIncome };
        }
        const ratio = rent > 0 ? Math.round((rent / monthlyBudget) * 1000) / 1000 : 0;
        return {
            medianRent: rent,
            recommendedMonthlyIncome,
            budget: monthlyBudget,
            ratio,
            isAffordable: ratio <= AFFORDABILITY_RATIO,
            monthlyIncomeNeeded: rent > 0 ? Math.round(rent / AFFORDABILITY_RATIO) : 0,
        };
    }
};
exports.HousingService = HousingService;
exports.HousingService = HousingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [relocation_service_1.RelocationService])
], HousingService);
