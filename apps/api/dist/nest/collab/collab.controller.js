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
exports.CollabController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const multer_1 = require("multer");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const collab_service_1 = require("./collab.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const fileService_1 = require("../../services/fileService");
const MAX_NOTE_FILE_SIZE = 50 * 1024 * 1024;
const filesDir = path_1.default.join(__dirname, '../../../uploads/files');
const NOTE_UPLOAD = {
    storage: (0, multer_1.diskStorage)({
        destination: (_req, _file, cb) => { if (!fs_1.default.existsSync(filesDir))
            fs_1.default.mkdirSync(filesDir, { recursive: true }); cb(null, filesDir); },
        filename: (_req, file, cb) => cb(null, `${(0, uuid_1.v4)()}${path_1.default.extname(file.originalname)}`),
    }),
    limits: { fileSize: MAX_NOTE_FILE_SIZE },
    defParamCharset: 'utf8', // parity with legacy routes/collab.ts — preserve non-ASCII original filenames
    fileFilter: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (fileService_1.BLOCKED_EXTENSIONS.includes(ext) || file.mimetype.includes('svg') || file.mimetype.includes('html') || file.mimetype.includes('javascript')) {
            const err = new Error('File type not allowed');
            err.statusCode = 400;
            return cb(err, false);
        }
        cb(null, true);
    },
};
/**
 * /api/trips/:tripId/collab — shared notes, polls, chat (+ reactions), link
 * previews. WebSocket-backed group collaboration.
 *
 * Byte-identical to the legacy Express route (server/src/routes/collab.ts): trip
 * access (404), 'collab_edit' (403) on mutations + 'file_upload' on note files,
 * create 201 / rest 200 (vote + react POST stay 200), the bespoke 400/403/404
 * bodies, the chat/note notifications, and all WebSocket broadcasts with the
 * forwarded X-Socket-Id.
 */
let CollabController = class CollabController {
    collab;
    constructor(collab) {
        this.collab = collab;
    }
    requireTrip(tripId, user) {
        const trip = this.collab.verifyTripAccess(tripId, user.id);
        if (!trip) {
            throw new common_1.HttpException({ error: 'Trip not found' }, 404);
        }
        return trip;
    }
    requireEdit(trip, user) {
        if (!this.collab.canEdit(trip, user)) {
            throw new common_1.HttpException({ error: 'No permission' }, 403);
        }
    }
    // ── Notes ───────────────────────────────────────────────────────────────
    listNotes(user, tripId) {
        this.requireTrip(tripId, user);
        return { notes: this.collab.listNotes(tripId) };
    }
    createNote(user, tripId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!body.title) {
            throw new common_1.HttpException({ error: 'Title is required' }, 400);
        }
        const note = this.collab.createNote(tripId, user.id, {
            title: body.title,
            content: body.content,
            category: body.category,
            color: body.color,
            website: body.website,
        });
        this.collab.broadcast(tripId, 'collab:note:created', { note }, socketId);
        this.collab.notifyCollab(tripId, user);
        return { note };
    }
    updateNote(user, tripId, id, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const note = this.collab.updateNote(tripId, id, {
            title: body.title,
            content: body.content,
            category: body.category,
            color: body.color,
            pinned: body.pinned,
            website: body.website,
        });
        if (!note) {
            throw new common_1.HttpException({ error: 'Note not found' }, 404);
        }
        this.collab.broadcast(tripId, 'collab:note:updated', { note }, socketId);
        return { note };
    }
    deleteNote(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!this.collab.deleteNote(tripId, id)) {
            throw new common_1.HttpException({ error: 'Note not found' }, 404);
        }
        this.collab.broadcast(tripId, 'collab:note:deleted', { noteId: Number(id) }, socketId);
        return { success: true };
    }
    addNoteFile(user, tripId, id, file, socketId) {
        const trip = this.requireTrip(tripId, user);
        if (!this.collab.canUploadFiles(trip, user)) {
            throw new common_1.HttpException({ error: 'No permission to upload files' }, 403);
        }
        if (!file) {
            throw new common_1.HttpException({ error: 'No file uploaded' }, 400);
        }
        const result = this.collab.addNoteFile(tripId, id, file);
        if (!result) {
            throw new common_1.HttpException({ error: 'Note not found' }, 404);
        }
        this.collab.broadcast(tripId, 'collab:note:updated', { note: this.collab.getFormattedNoteById(id) }, socketId);
        return result;
    }
    deleteNoteFile(user, tripId, id, fileId, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!this.collab.deleteNoteFile(id, fileId)) {
            throw new common_1.HttpException({ error: 'File not found' }, 404);
        }
        this.collab.broadcast(tripId, 'collab:note:updated', { note: this.collab.getFormattedNoteById(id) }, socketId);
        return { success: true };
    }
    // ── Polls ───────────────────────────────────────────────────────────────
    listPolls(user, tripId) {
        this.requireTrip(tripId, user);
        return { polls: this.collab.listPolls(tripId) };
    }
    createPoll(user, tripId, body, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!body.question) {
            throw new common_1.HttpException({ error: 'Question is required' }, 400);
        }
        if (!Array.isArray(body.options) || body.options.length < 2) {
            throw new common_1.HttpException({ error: 'At least 2 options are required' }, 400);
        }
        const poll = this.collab.createPoll(tripId, user.id, {
            question: body.question,
            options: body.options,
            multiple: body.multiple,
            multiple_choice: body.multiple_choice,
            deadline: body.deadline,
        });
        this.collab.broadcast(tripId, 'collab:poll:created', { poll }, socketId);
        return { poll };
    }
    votePoll(user, tripId, id, optionIndex, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const result = this.collab.votePoll(tripId, id, user.id, optionIndex);
        if (result.error === 'not_found')
            throw new common_1.HttpException({ error: 'Poll not found' }, 404);
        if (result.error === 'closed')
            throw new common_1.HttpException({ error: 'Poll is closed' }, 400);
        if (result.error === 'invalid_index')
            throw new common_1.HttpException({ error: 'Invalid option index' }, 400);
        this.collab.broadcast(tripId, 'collab:poll:voted', { poll: result.poll }, socketId);
        return { poll: result.poll };
    }
    closePoll(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const poll = this.collab.closePoll(tripId, id);
        if (!poll) {
            throw new common_1.HttpException({ error: 'Poll not found' }, 404);
        }
        this.collab.broadcast(tripId, 'collab:poll:closed', { poll }, socketId);
        return { poll };
    }
    deletePoll(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!this.collab.deletePoll(tripId, id)) {
            throw new common_1.HttpException({ error: 'Poll not found' }, 404);
        }
        this.collab.broadcast(tripId, 'collab:poll:deleted', { pollId: Number(id) }, socketId);
        return { success: true };
    }
    // ── Messages ────────────────────────────────────────────────────────────
    listMessages(user, tripId, before) {
        this.requireTrip(tripId, user);
        return { messages: this.collab.listMessages(tripId, before) };
    }
    createMessage(user, tripId, body, socketId) {
        if (body.text && body.text.length > 5000) {
            throw new common_1.HttpException({ error: 'text must be 5000 characters or less' }, 400);
        }
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!body.text || !body.text.trim()) {
            throw new common_1.HttpException({ error: 'Message text is required' }, 400);
        }
        const result = this.collab.createMessage(tripId, user.id, body.text, body.reply_to);
        if (result.error === 'reply_not_found') {
            throw new common_1.HttpException({ error: 'Reply target message not found' }, 400);
        }
        this.collab.broadcast(tripId, 'collab:message:created', { message: result.message }, socketId);
        const t = body.text.trim();
        this.collab.notifyCollab(tripId, user, t.length > 80 ? t.substring(0, 80) + '...' : t);
        return { message: result.message };
    }
    react(user, tripId, id, emoji, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        if (!emoji) {
            throw new common_1.HttpException({ error: 'Emoji is required' }, 400);
        }
        const result = this.collab.reactMessage(id, tripId, user.id, emoji);
        if (!result.found) {
            throw new common_1.HttpException({ error: 'Message not found' }, 404);
        }
        this.collab.broadcast(tripId, 'collab:message:reacted', { messageId: Number(id), reactions: result.reactions }, socketId);
        return { reactions: result.reactions };
    }
    deleteMessage(user, tripId, id, socketId) {
        const trip = this.requireTrip(tripId, user);
        this.requireEdit(trip, user);
        const result = this.collab.deleteMessage(tripId, id, user.id);
        if (result.error === 'not_found')
            throw new common_1.HttpException({ error: 'Message not found' }, 404);
        if (result.error === 'not_owner')
            throw new common_1.HttpException({ error: 'You can only delete your own messages' }, 403);
        this.collab.broadcast(tripId, 'collab:message:deleted', { messageId: Number(id), username: result.username || user.username }, socketId);
        return { success: true };
    }
    // ── Link preview ──────────────────────────────────────────────────────────
    async linkPreview(user, tripId, url) {
        // NB: the legacy route does not verify trip access on link-preview; kept 1:1.
        void user;
        void tripId;
        if (!url) {
            throw new common_1.HttpException({ error: 'URL is required' }, 400);
        }
        try {
            const preview = await this.collab.linkPreview(url);
            const asRecord = preview;
            if (asRecord.error) {
                throw new common_1.HttpException({ error: asRecord.error }, 400);
            }
            return preview;
        }
        catch (err) {
            if (err instanceof common_1.HttpException)
                throw err;
            return { title: null, description: null, image: null, url };
        }
    }
};
exports.CollabController = CollabController;
__decorate([
    (0, common_1.Get)('notes'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "listNotes", null);
__decorate([
    (0, common_1.Post)('notes'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "createNote", null);
__decorate([
    (0, common_1.Put)('notes/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "updateNote", null);
__decorate([
    (0, common_1.Delete)('notes/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "deleteNote", null);
__decorate([
    (0, common_1.Post)('notes/:id/files'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', NOTE_UPLOAD)),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.UploadedFile)()),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Object, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "addNoteFile", null);
__decorate([
    (0, common_1.Delete)('notes/:id/files/:fileId'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Param)('fileId')),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "deleteNoteFile", null);
__decorate([
    (0, common_1.Get)('polls'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "listPolls", null);
__decorate([
    (0, common_1.Post)('polls'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "createPoll", null);
__decorate([
    (0, common_1.Post)('polls/:id/vote'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)('option_index')),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, Number, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "votePoll", null);
__decorate([
    (0, common_1.Put)('polls/:id/close'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "closePoll", null);
__decorate([
    (0, common_1.Delete)('polls/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "deletePoll", null);
__decorate([
    (0, common_1.Get)('messages'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Query)('before')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "listMessages", null);
__decorate([
    (0, common_1.Post)('messages'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "createMessage", null);
__decorate([
    (0, common_1.Post)('messages/:id/react'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)('emoji')),
    __param(4, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "react", null);
__decorate([
    (0, common_1.Delete)('messages/:id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Headers)('x-socket-id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String, String]),
    __metadata("design:returntype", void 0)
], CollabController.prototype, "deleteMessage", null);
__decorate([
    (0, common_1.Get)('link-preview'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('tripId')),
    __param(2, (0, common_1.Query)('url')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], CollabController.prototype, "linkPreview", null);
exports.CollabController = CollabController = __decorate([
    (0, common_1.Controller)('api/trips/:tripId/collab'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __metadata("design:paramtypes", [collab_service_1.CollabService])
], CollabController);
