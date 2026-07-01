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
exports.BackupController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const fs_1 = __importDefault(require("fs"));
const backup_service_1 = require("./backup.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const admin_guard_1 = require("../auth/admin.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const auditLog_1 = require("../../services/auditLog");
const backupService_1 = require("../../services/backupService");
const UPLOAD = {
    dest: (0, backupService_1.getUploadTmpDir)(),
    fileFilter: (_req, file, cb) => {
        if (file.originalname.endsWith('.zip'))
            return cb(null, true);
        cb(new Error('Only ZIP files allowed'), false);
    },
    limits: { fileSize: backupService_1.MAX_BACKUP_UPLOAD_SIZE },
};
/**
 * /api/backup — admin-only database backup management (list, create, download,
 * restore from a stored or uploaded zip, auto-backup settings, delete).
 *
 * Byte-identical to the legacy Express route (server/src/routes/backup.ts):
 * admin-gated, the create rate-limit (429), the filename validation (400/404),
 * the audit-log writes, res.download for downloads and the tmp-file cleanup for
 * uploads. All JSON responses answer 200.
 */
let BackupController = class BackupController {
    backup;
    constructor(backup) {
        this.backup = backup;
    }
    list() {
        try {
            return { backups: this.backup.listBackups() };
        }
        catch {
            throw new common_1.HttpException({ error: 'Error loading backups' }, 500);
        }
    }
    async create(user, req) {
        if (!this.backup.checkRateLimit(req.ip || 'unknown', 3, this.backup.rateWindow)) {
            throw new common_1.HttpException({ error: 'Too many backup requests. Please try again later.' }, 429);
        }
        try {
            const backup = await this.backup.createBackup();
            (0, auditLog_1.writeAudit)({ userId: user.id, action: 'backup.create', resource: backup.filename, ip: (0, auditLog_1.getClientIp)(req), details: { size: backup.size } });
            return { success: true, backup };
        }
        catch {
            throw new common_1.HttpException({ error: 'Error creating backup' }, 500);
        }
    }
    download(filename, res) {
        if (!this.backup.isValidBackupFilename(filename)) {
            throw new common_1.HttpException({ error: 'Invalid filename' }, 400);
        }
        if (!this.backup.backupFileExists(filename)) {
            throw new common_1.HttpException({ error: 'Backup not found' }, 404);
        }
        res.download(this.backup.backupFilePath(filename), filename);
    }
    async restore(user, filename, req) {
        if (!this.backup.isValidBackupFilename(filename)) {
            throw new common_1.HttpException({ error: 'Invalid filename' }, 400);
        }
        if (!this.backup.backupFileExists(filename)) {
            throw new common_1.HttpException({ error: 'Backup not found' }, 404);
        }
        try {
            const result = await this.backup.restoreFromZip(this.backup.backupFilePath(filename));
            if (!result.success) {
                throw new common_1.HttpException({ error: result.error }, result.status || 400);
            }
            (0, auditLog_1.writeAudit)({ userId: user.id, action: 'backup.restore', resource: filename, ip: (0, auditLog_1.getClientIp)(req) });
            return { success: true };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ error: 'Error restoring backup' }, 500);
        }
    }
    async uploadRestore(user, file, req) {
        if (!file) {
            throw new common_1.HttpException({ error: 'No file uploaded' }, 400);
        }
        const zipPath = file.path;
        const origName = file.originalname || 'upload.zip';
        try {
            const result = await this.backup.restoreFromZip(zipPath);
            if (!result.success) {
                throw new common_1.HttpException({ error: result.error }, result.status || 400);
            }
            (0, auditLog_1.writeAudit)({ userId: user.id, action: 'backup.upload_restore', resource: origName, ip: (0, auditLog_1.getClientIp)(req) });
            return { success: true };
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            throw new common_1.HttpException({ error: 'Error restoring backup' }, 500);
        }
        finally {
            if (fs_1.default.existsSync(zipPath))
                fs_1.default.unlinkSync(zipPath);
        }
    }
    autoSettings() {
        try {
            return this.backup.getAutoSettings();
        }
        catch (err) {
            console.error('[backup] GET auto-settings:', err);
            throw new common_1.HttpException({ error: 'Could not load backup settings' }, 500);
        }
    }
    updateAutoSettings(user, body, req) {
        try {
            const settings = this.backup.updateAutoSettings(body || {});
            (0, auditLog_1.writeAudit)({ userId: user.id, action: 'backup.auto_settings', ip: (0, auditLog_1.getClientIp)(req), details: { enabled: settings.enabled, interval: settings.interval, keep_days: settings.keep_days } });
            return { settings };
        }
        catch (err) {
            console.error('[backup] PUT auto-settings:', err);
            const msg = err instanceof Error ? err.message : String(err);
            throw new common_1.HttpException({ error: 'Could not save auto-backup settings', detail: process.env.NODE_ENV?.toLowerCase() !== 'production' ? msg : undefined }, 500);
        }
    }
    remove(user, filename, req) {
        if (!this.backup.isValidBackupFilename(filename)) {
            throw new common_1.HttpException({ error: 'Invalid filename' }, 400);
        }
        if (!this.backup.backupFileExists(filename)) {
            throw new common_1.HttpException({ error: 'Backup not found' }, 404);
        }
        this.backup.deleteBackup(filename);
        (0, auditLog_1.writeAudit)({ userId: user.id, action: 'backup.delete', resource: filename, ip: (0, auditLog_1.getClientIp)(req) });
        return { success: true };
    }
};
exports.BackupController = BackupController;
__decorate([
    (0, common_1.Get)('list'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BackupController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('create'),
    (0, common_1.HttpCode)(200) // Express answers create with res.json (200), not the POST-default 201.
    ,
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('download/:filename'),
    __param(0, (0, common_1.Param)('filename')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], BackupController.prototype, "download", null);
__decorate([
    (0, common_1.Post)('restore/:filename'),
    (0, common_1.HttpCode)(200) // Express answers restore with res.json (200).
    ,
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('filename')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "restore", null);
__decorate([
    (0, common_1.Post)('upload-restore'),
    (0, common_1.HttpCode)(200) // Express answers upload-restore with res.json (200).
    ,
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('backup', UPLOAD)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], BackupController.prototype, "uploadRestore", null);
__decorate([
    (0, common_1.Get)('auto-settings'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], BackupController.prototype, "autoSettings", null);
__decorate([
    (0, common_1.Put)('auto-settings'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], BackupController.prototype, "updateAutoSettings", null);
__decorate([
    (0, common_1.Delete)(':filename'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('filename')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], BackupController.prototype, "remove", null);
exports.BackupController = BackupController = __decorate([
    (0, common_1.Controller)('api/backup'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [backup_service_1.BackupService])
], BackupController);
