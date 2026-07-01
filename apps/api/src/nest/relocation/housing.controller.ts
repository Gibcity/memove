import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HousingService } from './housing.service';

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
