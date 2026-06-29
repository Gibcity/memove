import { Module } from '@nestjs/common';
import { RelocationController } from './relocation.controller';
import { RelocationService } from './relocation.service';

/** Relocation discovery module — registered in AppModule. */
@Module({
  controllers: [RelocationController],
  providers: [RelocationService],
})
export class RelocationModule {}
