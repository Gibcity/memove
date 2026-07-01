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
exports.BookingImportController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const booking_import_service_1 = require("./booking-import.service");
const ACCEPTED_EXTS = new Set(['.eml', '.pdf', '.pkpass', '.html', '.htm', '.txt']);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;
const UPLOAD = {
    storage: (0, multer_1.memoryStorage)(),
    limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
};
let BookingImportController = class BookingImportController {
    bookingImport;
    constructor(bookingImport) {
        this.bookingImport = bookingImport;
    }
    requireTrip(tripId, user) {
        const trip = this.bookingImport.verifyTripAccess(tripId, user.id);
        if (!trip)
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        return trip;
    }
    requireEdit(trip, user) {
        if (!this.bookingImport.canEdit(trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
    }
    /**
     * POST /api/trips/:tripId/reservations/import/booking
     * Accepts up to 5 booking confirmation files (EML, PDF, PKPass, HTML, TXT).
     * Returns a preview list without persisting anything.
     */
    async preview(user, tripId, files) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!this.bookingImport.isAvailable()) {
            throw new common_1.HttpException({ error: 'KItinerary extractor is not available on this server' }, 503);
        }
        if (!files || files.length === 0) {
            throw new common_1.HttpException({ error: 'No files uploaded' }, 400);
        }
        // Validate extensions
        for (const f of files) {
            const ext = f.originalname.toLowerCase().slice(f.originalname.lastIndexOf('.'));
            if (!ACCEPTED_EXTS.has(ext)) {
                throw new common_1.HttpException({ error: `Unsupported file type: ${f.originalname}. Accepted: EML, PDF, PKPass, HTML, TXT` }, 400);
            }
        }
        const result = await this.bookingImport.preview(files);
        return result;
    }
    /**
     * POST /api/trips/:tripId/reservations/import/booking/confirm
     * Persists the user-confirmed subset of parsed items.
     */
    async confirm(user, tripId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const items = body?.items;
        if (!Array.isArray(items) || items.length === 0) {
            throw new common_1.HttpException({ error: 'items must be a non-empty array' }, 400);
        }
        return this.bookingImport.confirm(tripId, items, socketId);
    }
};
exports.BookingImportController = BookingImportController;
__decorate([
    (0, common_1.Post)('booking'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('files', MAX_FILES, UPLOAD)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.UploadedFiles)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Array]),
    __metadata("design:returntype", Promise)
], BookingImportController.prototype, "preview", null);
__decorate([
    (0, common_1.Post)('booking/confirm'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", Promise)
], BookingImportController.prototype, "confirm", null);
exports.BookingImportController = BookingImportController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/reservations/import'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [booking_import_service_1.BookingImportService])
], BookingImportController);
