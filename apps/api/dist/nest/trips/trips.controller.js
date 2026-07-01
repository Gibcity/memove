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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripsController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const trips_service_1 = require("./trips.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const auditLog_1 = require("../../services/auditLog");
const demo_1 = require("../../services/demo");
const tripService_1 = require("../../services/tripService");
const MAX_COVER_SIZE = 20 * 1024 * 1024;
const coversDir = path_1.default.join(__dirname, '../../../uploads/covers');
const COVER_UPLOAD = {
    storage: (0, multer_1.diskStorage)({
        destination: (_req, _file, cb) => {
            if (!fs_1.default.existsSync(coversDir))
                fs_1.default.mkdirSync(coversDir, { recursive: true });
            cb(null, coversDir);
        },
        filename: (_req, file, cb) => cb(null, `${(0, uuid_1.v4)()}${path_1.default.extname(file.originalname)}`),
    }),
    limits: { fileSize: MAX_COVER_SIZE },
    fileFilter: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        if (file.mimetype.startsWith('image/') && !file.mimetype.includes('svg') && allowed.includes(ext))
            cb(null, true);
        else
            cb(new Error('Only jpg, png, gif, webp images allowed'), false);
    },
};
const toDateStr = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
/**
 * /api/trips — the trip aggregate root.
 *
 * Byte-identical to the legacy Express route (server/src/routes/trips.ts): the
 * same per-field permission checks (trip_create / trip_edit / trip_archive /
 * trip_cover_upload / trip_delete / member_manage), the date inference on create,
 * audit logging, the offline bundle, ICS export and member-invite notification.
 * Uses EXACT strangler prefixes so it never swallows the nested sub-domain mounts.
 */
let TripsController = class TripsController {
    trips;
    constructor(trips) {
        this.trips = trips;
    }
    list(user, archived) {
        return { trips: this.trips.list(user.id, archived === '1' ? 1 : 0) };
    }
    create(user, body, req) {
        if (!this.trips.can('trip_create', user.role, null, user.id, false)) {
            throw new common_1.HttpException({ error: 'No permission to create trips' }, 403);
        }
        const { title, description, currency, reminder_days, day_count } = body;
        if (!title) {
            throw new common_1.HttpException({ error: 'Title is required' }, 400);
        }
        let start_date = body.start_date || null;
        let end_date = body.end_date || null;
        if (start_date && !end_date)
            end_date = toDateStr(addDays(new Date(start_date), 6));
        else if (!start_date && end_date)
            start_date = toDateStr(addDays(new Date(end_date), -6));
        if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
            throw new common_1.HttpException({ error: 'End date must be after start date' }, 400);
        }
        const parsedDayCount = day_count ? Math.min(Math.max(Number(day_count) || 7, 1), 365) : undefined;
        const { trip, tripId, reminderDays } = this.trips.create(user.id, { title, description, start_date, end_date, currency, reminder_days, day_count: parsedDayCount, kind: body.kind });
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'trip.create', ip: (0, auditLog_1.getClientIp)(req), details: { tripId, title, reminder_days: reminderDays === 0 ? 'none' : `${reminderDays} days` } });
        if (reminderDays > 0)
            (0, auditLog_1.logInfo)(`${user.email} set ${reminderDays}-day reminder for trip "${title}"`);
        return { trip };
    }
    get(user, id) {
        const trip = this.trips.get(id, user.id);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        return { trip };
    }
    update(user, id, body, req, socketId) {
        const access = this.trips.canAccessTrip(id, user.id);
        if (!access) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        const ownerId = access.user_id;
        const isMember = ownerId !== user.id;
        if (body.is_archived !== undefined && !this.trips.can('trip_archive', user.role, ownerId, user.id, isMember)) {
            throw new common_1.HttpException({ error: 'No permission to archive/unarchive this trip' }, 403);
        }
        if (body.cover_image !== undefined && !this.trips.can('trip_cover_upload', user.role, ownerId, user.id, isMember)) {
            throw new common_1.HttpException({ error: 'No permission to change cover image' }, 403);
        }
        const editFields = ['title', 'description', 'start_date', 'end_date', 'currency', 'reminder_days', 'day_count'];
        if (editFields.some((f) => body[f] !== undefined) && !this.trips.can('trip_edit', user.role, ownerId, user.id, isMember)) {
            throw new common_1.HttpException({ error: 'No permission to edit this trip' }, 403);
        }
        try {
            const result = this.trips.update(id, user.id, body, user.role);
            if (Object.keys(result.changes).length > 0) {
                (0, auditLog_1.writeAudit)({ userId: user.id, action: 'trip.update', ip: (0, auditLog_1.getClientIp)(req), details: { tripId: Number(id), trip: result.newTitle, ...(result.ownerEmail ? { owner: result.ownerEmail } : {}), ...result.changes } });
                if (result.isAdminEdit && result.ownerEmail)
                    (0, auditLog_1.logInfo)(`Admin ${user.email} edited trip "${result.newTitle}" owned by ${result.ownerEmail}`);
            }
            if (result.newReminder !== result.oldReminder) {
                if (result.newReminder > 0)
                    (0, auditLog_1.logInfo)(`${user.email} set ${result.newReminder}-day reminder for trip "${result.newTitle}"`);
                else
                    (0, auditLog_1.logInfo)(`${user.email} removed reminder for trip "${result.newTitle}"`);
            }
            this.trips.broadcast(id, 'trip:updated', { trip: result.updatedTrip }, socketId);
            return { trip: result.updatedTrip };
        }
        catch (e) {
            if (e instanceof tripService_1.NotFoundError)
                throw new common_1.HttpException({ error: e.message }, 404);
            if (e instanceof tripService_1.ValidationError)
                throw new common_1.HttpException({ error: e.message }, 400);
            throw e;
        }
    }
    cover(user, id, file) {
        if (process.env.DEMO_MODE?.toLowerCase() === 'true' && (0, demo_1.isDemoEmail)(user.email)) {
            throw new common_1.HttpException({ error: 'Uploads are disabled in demo mode. Self-host memove for full functionality.' }, 403);
        }
        const access = this.trips.canAccessTrip(id, user.id);
        if (!access?.user_id) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        if (!this.trips.can('trip_cover_upload', user.role, access.user_id, user.id, access.user_id !== user.id)) {
            throw new common_1.HttpException({ error: 'No permission to change the cover image' }, 403);
        }
        const trip = this.trips.getRaw(id);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        if (!file) {
            throw new common_1.HttpException({ error: 'No image uploaded' }, 400);
        }
        this.trips.deleteOldCover(trip.cover_image);
        const coverUrl = `/uploads/covers/${file.filename}`;
        this.trips.updateCoverImage(id, coverUrl);
        return { cover_image: coverUrl };
    }
    copy(user, id, title, req) {
        if (!this.trips.can('trip_create', user.role, null, user.id, false)) {
            throw new common_1.HttpException({ error: 'No permission to create trips' }, 403);
        }
        if (!this.trips.canAccessTrip(id, user.id)) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        try {
            const newTripId = this.trips.copy(id, user.id, title);
            (0, auditLog_1.writeAudit)({ userId: user.id, action: 'trip.copy', ip: (0, auditLog_1.getClientIp)(req), details: { sourceTripId: Number(id), newTripId, title } });
            return { trip: this.trips.getCopiedTrip(newTripId, user.id) };
        }
        catch {
            throw new common_1.HttpException({ error: 'Failed to copy trip' }, 500);
        }
    }
    remove(user, id, req, socketId) {
        const owner = this.trips.getOwner(id);
        if (!owner) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        if (!this.trips.can('trip_delete', user.role, owner.user_id, user.id, owner.user_id !== user.id)) {
            throw new common_1.HttpException({ error: 'No permission to delete this trip' }, 403);
        }
        const info = this.trips.remove(id, user.id, user.role);
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'trip.delete', ip: (0, auditLog_1.getClientIp)(req), details: { tripId: info.tripId, trip: info.title, ...(info.ownerEmail ? { owner: info.ownerEmail } : {}) } });
        if (info.isAdminDelete && info.ownerEmail)
            (0, auditLog_1.logInfo)(`Admin ${user.email} deleted trip "${info.title}" owned by ${info.ownerEmail}`);
        this.trips.broadcast(String(info.tripId), 'trip:deleted', { id: info.tripId }, socketId);
        return { success: true };
    }
    members(user, id) {
        const access = this.trips.canAccessTrip(id, user.id);
        if (!access) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        const { owner, members } = this.trips.listMembers(id, access.user_id);
        return { owner, members, current_user_id: user.id };
    }
    addMember(user, id, identifier) {
        const access = this.trips.canAccessTrip(id, user.id);
        if (!access) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        if (!this.trips.can('member_manage', user.role, access.user_id, user.id, access.user_id !== user.id)) {
            throw new common_1.HttpException({ error: 'No permission to manage members' }, 403);
        }
        try {
            const result = this.trips.addMember(id, identifier, access.user_id, user.id);
            this.trips.notifyInvite(id, user, result.targetUserId, result.tripTitle, result.member.email);
            return { member: result.member };
        }
        catch (e) {
            if (e instanceof tripService_1.NotFoundError)
                throw new common_1.HttpException({ error: e.message }, 404);
            if (e instanceof tripService_1.ValidationError)
                throw new common_1.HttpException({ error: e.message }, 400);
            throw e;
        }
    }
    removeMember(user, id, userId) {
        const access = this.trips.canAccessTrip(id, user.id);
        if (!access) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        const targetId = parseInt(userId);
        if (targetId !== user.id && !this.trips.can('member_manage', user.role, access.user_id, user.id, access.user_id !== user.id)) {
            throw new common_1.HttpException({ error: 'No permission to remove members' }, 403);
        }
        this.trips.removeMember(id, targetId);
        return { success: true };
    }
    bundle(user, id) {
        const trip = this.trips.get(id, user.id);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        return this.trips.bundle(id, trip);
    }
    exportIcs(user, id, res) {
        if (!this.trips.canAccessTrip(id, user.id)) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        try {
            const { ics, filename } = this.trips.exportICS(id);
            res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(ics);
        }
        catch (e) {
            if (e instanceof tripService_1.NotFoundError)
                throw new common_1.HttpException({ error: e.message }, 404);
            throw e;
        }
    }
};
exports.TripsController = TripsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('archived')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.HttpCode)(201),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "get", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Req)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object, String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/cover'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('cover', COVER_UPLOAD)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "cover", null);
__decorate([
    (0, common_1.Post)(':id/copy'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)('title')),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "copy", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "remove", null);
__decorate([
    (0, common_1.Get)(':id/members'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "members", null);
__decorate([
    (0, common_1.Post)(':id/members'),
    (0, common_1.HttpCode)(201),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)('identifier')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "addMember", null);
__decorate([
    (0, common_1.Delete)(':id/members/:userId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "removeMember", null);
__decorate([
    (0, common_1.Get)(':id/bundle'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "bundle", null);
__decorate([
    (0, common_1.Get)(':id/export.ics'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], TripsController.prototype, "exportIcs", null);
exports.TripsController = TripsController = __decorate([
    (0, common_1.Controller)('api/trips'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [trips_service_1.TripsService])
], TripsController);
