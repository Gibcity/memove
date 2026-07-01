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
exports.FilesDownloadController = void 0;
const common_1 = require("@nestjs/common");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const files_service_1 = require("./files.service");
/**
 * GET /api/trips/:tripId/files/:id/download — authenticated file download.
 *
 * Deliberately NOT behind the JwtAuthGuard: it accepts a cookie, a Bearer header
 * OR a one-shot `?token=` query param (so links can be opened directly), all via
 * the legacy authenticateDownload helper. Byte-identical to the legacy route:
 * 401 token, 404 trip/file, 403 path traversal, .pkpass served inline for Wallet.
 */
let FilesDownloadController = class FilesDownloadController {
    files;
    constructor(files) {
        this.files = files;
    }
    download(req, res, tripId, id) {
        const auth = this.files.authenticateDownload(req);
        if ('error' in auth) {
            throw new common_1.HttpException({ error: auth.error }, auth.status);
        }
        const trip = this.files.verifyTripAccess(tripId, auth.userId);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        const file = this.files.getFileById(id, tripId);
        if (!file) {
            throw new common_1.HttpException({ error: 'File not found' }, 404);
        }
        const { resolved, safe } = this.files.resolveFilePath(file.filename);
        if (!safe) {
            throw new common_1.HttpException({ error: 'Forbidden' }, 403);
        }
        if (!fs_1.default.existsSync(resolved)) {
            throw new common_1.HttpException({ error: 'File not found' }, 404);
        }
        // Serve Apple Wallet passes inline with the canonical MIME type so Safari
        // (iOS/macOS) hands them to Wallet instead of downloading as a blob.
        if (path_1.default.extname(resolved).toLowerCase() === '.pkpass') {
            res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
            res.setHeader('Content-Disposition', `inline; filename="${path_1.default.basename(file.original_name || resolved)}"`);
        }
        // Serve with an explicit { root } + basename rather than an absolute path:
        // under the Nest ExpressAdapter, res.sendFile(absolutePath) resolves the
        // file relative to the (rewritten) req.url and fails with a spurious
        // "Not Found", whereas the root-relative form streams correctly. The
        // resolveFilePath guard above already pins this to the uploads dir.
        res.sendFile(path_1.default.basename(resolved), { root: path_1.default.dirname(resolved) });
    }
};
exports.FilesDownloadController = FilesDownloadController;
__decorate([
    (0, common_1.Get)(':id/download'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Param)('tripId')),
    __param(3, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", void 0)
], FilesDownloadController.prototype, "download", null);
exports.FilesDownloadController = FilesDownloadController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/files'),
    __metadata("design:paramtypes", [files_service_1.FilesService])
], FilesDownloadController);
