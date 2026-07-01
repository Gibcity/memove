import { Module } from '@nestjs/common';
import { RelocationController } from './relocation.controller';
import { RelocationService } from './relocation.service';
import { RelocationJourneyService } from './relocation-journey.service';
import { HousingController } from './housing.controller';
import { HousingService } from './housing.service';
import { CareerService } from './career.service';
import { ConciergeService } from './concierge.service';

/** Relocation discovery module — registered in AppModule. */
@Module({
  controllers: [RelocationController, HousingController],
  providers: [RelocationService, RelocationJourneyService, HousingService, CareerService, ConciergeService],
  exports: [RelocationJourneyService],
})
export class RelocationModule {}
