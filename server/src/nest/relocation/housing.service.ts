import {
  Controller,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Location } from '@memove/shared';
import { RelocationService } from './relocation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

// ponytail: rental lane reads existing cost fields + generates external
// search URLs by string concat. No scraping, no MLS, no API calls.

const AFFORDABILITY_RATIO = 0.3; // 30% rule

interface RentalMarket {
  medianRent: number;
  medianHomeValue: number;
  propertyTaxRate: number;
  costOfLivingIndex: number;
  priceToRentRatio: number;
}

interface ListingLink {
  platform: string;
  url: string;
  type: 'rent' | 'buy';
}

interface AffordabilityResult {
  medianRent: number;
  recommendedMonthlyIncome: number;
  budget?: number;
  ratio?: number;
  isAffordable?: boolean;
  monthlyIncomeNeeded?: number;
}

function formatMetro(name: string): { city: string; state: string } | null {
  // "Austin, TX" → { city: 'austin', state: 'tx' }
  const parts = name.split(',').map((s) => s.trim());
  if (parts.length < 2) return null;
  const city = parts[0].toLowerCase().replace(/\s+/g, '');
  const state = parts[1].toLowerCase().replace(/\s+/g, '');
  if (!city || !state) return null;
  return { city, state };
}

@Injectable()
export class HousingService {
  constructor(private readonly relocation: RelocationService) {}

  private requireLocation(id: string): Location {
    const loc = this.relocation.getLocationById(id);
    if (!loc) throw new NotFoundException(`Location not found: ${id}`);
    return loc;
  }

  getRentalMarket(locationId: string): RentalMarket {
    const loc = this.requireLocation(locationId);
    const c = loc.cost;
    const priceToRentRatio =
      c.medianRent > 0 && c.medianHomeValue > 0
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

  getListingLinks(locationId: string): ListingLink[] {
    const loc = this.requireLocation(locationId);
    const fmt = formatMetro(loc.name);
    if (!fmt) return [];
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

  getAffordability(locationId: string, monthlyBudget?: number): AffordabilityResult {
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
}

@Controller('api/relocation/housing')
@UseGuards(JwtAuthGuard)
export class HousingController {
  constructor(private readonly housing: HousingService) {}

  @Get('market/:locationId')
  market(@Param('locationId') id: string): RentalMarket {
    return this.housing.getRentalMarket(id);
  }

  @Get('listings/:locationId')
  listings(@Param('locationId') id: string): ListingLink[] {
    return this.housing.getListingLinks(id);
  }

  @Get('affordability/:locationId')
  affordability(
    @Param('locationId') id: string,
    @Query('budget') budget?: string,
  ): AffordabilityResult {
    return this.housing.getAffordability(id, budget ? Number(budget) : undefined);
  }
}
