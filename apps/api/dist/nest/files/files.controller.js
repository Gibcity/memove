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
exports.FilesController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const files_service_1 = require("./files.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const fileService_1 = require("../../services/fileService");
const demo_1 = require("../../services/demo");
const UPLOAD = {
    storage: (0, multer_1.diskStorage)({
        destination: (_req, _file, cb) => { if (!fs_1.default.existsSync(fileService_1.filesDir))
            fs_1.default.mkdirSync(fileService_1.filesDir, { recursive: true }); cb(null, fileService_1.filesDir); },
        filename: (_req, file, cb) => cb(null, `${(0, uuid_1.v4)()}${path_1.default.extname(file.originalname)}`),
    }),
    limits: { fileSize: fileService_1.MAX_FILE_SIZE },
    defParamCharset: 'utf8', // parity with legacy routes/files.ts — preserve non-ASCII original filenames
    fileFilter: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        const reject = () => {
            const err = new Error('File type not allowed');
            err.statusCode = 400;
            cb(err, false);
        };
        if (fileService_1.BLOCKED_EXTENSIONS.includes(ext) || file.mimetype.includes('svg'))
            return reject();
        const allowed = (0, fileService_1.getAllowedExtensions)().split(',').map((e) => e.trim().toLowerCase());
        const fileExt = ext.replace('.', '');
        if (allowed.includes(fileExt) || (allowed.includes('*') && !fileService_1.BLOCKED_EXTENSIONS.includes(ext)))
            return cb(null, true);
        reject();
    },
};
/**
 * /api/trips/:tripId/files — trip file manager (upload, metadata, starring,
 * trash + restore, reservation links). The authenticated download lives in the
 * separate unguarded FilesDownloadController (it carries its own token auth).
 *
 * Byte-identical to the legacy Express route (server/src/routes/files.ts): trip
 * access (404), the demo-mode upload block (403), the file_upload/file_edit/
 * file_delete permissions (403), create 201 / rest 200, the bespoke bodies and
 * the WebSocket broadcasts with the forwarded X-Socket-Id.
 */
let FilesController = class FilesController {
    files;
    constructor(files) {
        this.files = files;
    }
    requireTrip(tripId, user) {
        const trip = this.files.verifyTripAccess(tripId, user.id);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        return trip;
    }
    list(user, tripId, trash) {
        this.requireTrip(tripId, user);
        return { files: this.files.listFiles(tripId, trash === 'true') };
    }
    upload(user, tripId, file, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        if (process.env.DEMO_MODE?.toLowerCase() === 'true' && (0, demo_1.isDemoEmail)(user.email)) {
            throw new common_1.HttpException({ error: 'Uploads are disabled in demo mode. Self-host memove for full functionality.' }, 403);
        }
        if (!this.files.can('file_upload', trip, user)) {
            throw new common_1.HttpException({ error: 'No permission to upload files' }, 403);
        }
        if (!file) {
            throw new common_1.HttpException({ error: 'No file uploaded' }, 400);
        }
        const created = this.files.createFile(tripId, file, user.id, {
            place_id: body.place_id,
            description: body.description,
            reservation_id: body.reservation_id,
        });
        this.files.broadcast(tripId, 'file:created', { file: created }, socketId);
        return { file: created };
    }
    update(user, tripId, id, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        if (!this.files.can('file_edit', trip, user)) {
            throw new common_1.HttpException({ error: 'No permission to edit files' }, 403);
        }
        const file = this.files.getFileById(id, tripId);
        if (!file) {
            throw new common_1.HttpException({ error: 'File not found' }, 404);
        }
        const updated = this.files.updateFile(id, file, { description: body.description, place_id: body.place_id, reservation_id: body.reservation_id });
        this.files.broadcast(tripId, 'file:updated', { file: updated }, socketId);
        return { file: updated };
    }
    star(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        if (!this.files.can('file_edit', trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
        const file = this.files.getFileById(id, tripId);
        if (!file) {
            throw new common_1.HttpException({ error: 'File not found' }, 404);
        }
        const updated = this.files.toggleStarred(id, file.starred);
        this.files.broadcast(tripId, 'file:updated', { file: updated }, socketId);
        return { file: updated };
    }
    async emptyTrash(user, tripId) {
        const trip = this.requireTrip(tripId, user);
        if (!this.files.can('file_delete', trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
        const deleted = await this.files.emptyTrash(tripId);
        return { success: true, deleted };
    }
    async permanent(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        if (!this.files.can('file_delete', trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
        const file = this.files.getDeletedFile(id, tripId);
        if (!file) {
            throw new common_1.HttpException({ error: 'File not found in trash' }, 404);
        }
        await this.files.permanentDeleteFile(file);
        this.files.broadcast(tripId, 'file:deleted', { fileId: Number(id) }, socketId);
        return { success: true };
    }
    remove(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        if (!this.files.can('file_delete', trip, user)) {
            throw new common_1.HttpException({ error: 'No permission to delete files' }, 403);
        }
        const file = this.files.getFileById(id, tripId);
        if (!file) {
            throw new common_1.HttpException({ error: 'File not found' }, 404);
        }
        this.files.softDeleteFile(id);
        this.files.broadcast(tripId, 'file:deleted', { fileId: Number(id) }, socketId);
        return { success: true };
    }
    restore(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        if (!this.files.can('file_delete', trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
        const file = this.files.getDeletedFile(id, tripId);
        if (!file) {
            throw new common_1.HttpException({ error: 'File not found in trash' }, 404);
        }
        const restored = this.files.restoreFile(id);
        this.files.broadcast(tripId, 'file:created', { file: restored }, socketId);
        return { file: restored };
    }
    link(user, tripId, id, body) {
        const trip = this.requireTrip(tripId, user);
        if (!this.files.can('file_edit', trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
        const file = this.files.getFileById(id, tripId);
        if (!file) {
            throw new common_1.HttpException({ error: 'File not found' }, 404);
        }
        const links = this.files.createFileLink(id, { reservation_id: body.reservation_id, assignment_id: body.assignment_id, place_id: body.place_id });
        return { success: true, links };
    }
    unlink(user, tripId, id, linkId) {
        const trip = this.requireTrip(tripId, user);
        if (!this.files.can('file_edit', trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
        this.files.deleteFileLink(linkId, id);
        return { success: true };
    }
    links(user, tripId, id) {
        this.requireTrip(tripId, user);
        return { links: this.files.getFileLinks(id) };
    }
};
exports.FilesController = FilesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Query)('trash')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', UPLOAD)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.UploadedFile)()),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "upload", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/star'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "star", null);
__decorate([
    (0, common_1.Delete)('trash/empty'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], FilesController.prototype, "emptyTrash", null);
__decorate([
    (0, common_1.Delete)(':id/permanent'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", Promise)
], FilesController.prototype, "permanent", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "remove", null);
__decorate([
    (0, common_1.Post)(':id/restore'),
    (0, common_1.HttpCode)(200) // Express answers restore with res.json (200), not the POST-default 201.
    ,
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "restore", null);
__decorate([
    (0, common_1.Post)(':id/link'),
    (0, common_1.HttpCode)(200) // Express answers link with res.json (200).
    ,
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "link", null);
__decorate([
    (0, common_1.Delete)(':id/link/:linkId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Param)('linkId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "unlink", null);
__decorate([
    (0, common_1.Get)(':id/links'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], FilesController.prototype, "links", null);
exports.FilesController = FilesController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/files'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [files_service_1.FilesService])
], FilesController);
