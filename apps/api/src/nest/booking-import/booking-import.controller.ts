import {
  Controller,
  Post,
  Body,
  Param,
  Headers,
  HttpException,
  UseGuards,
  UseInterceptors,
  UsePipes,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { z } from 'zod';
import type { User } from '../../types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BookingImportService } from './booking-import.service';
import { bookingImportConfirmRequestSchema } from '@memove/shared';
import type { BookingImportPreviewResponse, BookingImportConfirmResponse } from '@memove/shared';

const ACCEPTED_EXTS = new Set(['.eml', '.pdf', '.pkpass', '.html', '.htm', '.txt']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;

const UPLOAD = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
};

@Controller('api/trips/:tripId/reservations/import')
@UseGuards(JwtAuthGuard)
export class BookingImportController {
  constructor(private readonly bookingImport: BookingImportService) {}

  private requireTrip(tripId: string, user: User) {
    const trip = this.bookingImport.verifyTripAccess(tripId, user.id);
    if (!trip) throw new HttpException({ error: 'Trip not found' }, 404);
    return trip;
  }

  private requireEdit(trip: ReturnType<BookingImportService['verifyTripAccess']>, user: User): void {
    if (!this.bookingImport.canEdit(trip!, user)) {
      throw new HttpException({ error: 'No permission' }, 403);
    }
  }

  /**
   * POST /api/trips/:tripId/reservations/import/booking
   * Accepts up to 5 booking confirmation files (EML, PDF, PKPass, HTML, TXT).
   * Returns a preview list without persisting anything.
   */
  @Post('booking')
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, UPLOAD))
  async preview(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    const trip = this.requireTrip(tripId, user);
    this.requireEdit(trip, user);

    if (!this.bookingImport.isAvailable()) {
      throw new HttpException({ error: 'KItinerary extractor is not available on this server' }, 503);
    }

    if (!files || files.length === 0) {
      throw new HttpException({ error: 'No files uploaded' }, 400);
    }

    // Validate extensions
    for (const f of files) {
      const ext = f.originalname.toLowerCase().slice(f.originalname.lastIndexOf('.'));
      if (!ACCEPTED_EXTS.has(ext)) {
        throw new HttpException({ error: `Unsupported file type: ${f.originalname}. Accepted: EML, PDF, PKPass, HTML, TXT` }, 400);
      }
    }

    const result: BookingImportPreviewResponse = await this.bookingImport.preview(files);
    return result;
  }

  /**
   * POST /api/trips/:tripId/reservations/import/booking/confirm
   * Persists the user-confirmed subset of parsed items.
   */
  @Post('booking/confirm')
  @UsePipes(new ZodValidationPipe(bookingImportConfirmRequestSchema))
  async confirm(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Body() body: z.infer<typeof bookingImportConfirmRequestSchema>,
    @Headers('x-socket-id') socketId?: string,
  ): Promise<BookingImportConfirmResponse> {
    const trip = this.requireTrip(tripId, user);
    this.requireEdit(trip, user);

    return this.bookingImport.confirm(tripId, body.items, socketId);
  }
}
