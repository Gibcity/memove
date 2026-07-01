"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CollabService = void 0;
const common_1 = require("@nestjs/common");
const database_1 = require("../../db/database");
const websocket_1 = require("../../websocket");
const permissions_1 = require("../../services/permissions");
const svc = __importStar(require("../../services/collabService"));
/**
 * Thin Nest wrapper around the existing collab service. Trip access, the
 * 'collab_edit' / 'file_upload' permissions, the SQL and the WebSocket
 * broadcasts reuse the legacy code unchanged.
 */
let CollabService = class CollabService {
    verifyTripAccess(tripId, userId) {
        return svc.verifyTripAccess(tripId, userId);
    }
    canEdit(trip, user) {
        return (0, permissions_1.checkPermission)('collab_edit', user.role, trip.user_id, user.id, trip.user_id !== user.id);
    }
    canUploadFiles(trip, user) {
        return (0, permissions_1.checkPermission)('file_upload', user.role, trip.user_id, user.id, trip.user_id !== user.id);
    }
    broadcast(tripId, event, payload, socketId) {
        (0, websocket_1.broadcast)(tripId, event, payload, socketId);
    }
    listNotes(tripId) { return svc.listNotes(tripId); }
    createNote(tripId, userId, data) { return svc.createNote(tripId, userId, data); }
    updateNote(tripId, id, data) { return svc.updateNote(tripId, id, data); }
    deleteNote(tripId, id) { return svc.deleteNote(tripId, id); }
    addNoteFile(tripId, id, file) { return svc.addNoteFile(tripId, id, file); }
    getFormattedNoteById(id) { return svc.getFormattedNoteById(id); }
    deleteNoteFile(id, fileId) { return svc.deleteNoteFile(id, fileId); }
    listPolls(tripId) { return svc.listPolls(tripId); }
    createPoll(tripId, userId, data) { return svc.createPoll(tripId, userId, data); }
    votePoll(tripId, id, userId, optionIndex) { return svc.votePoll(tripId, id, userId, optionIndex); }
    closePoll(tripId, id) { return svc.closePoll(tripId, id); }
    deletePoll(tripId, id) { return svc.deletePoll(tripId, id); }
    listMessages(tripId, before) { return svc.listMessages(tripId, before); }
    createMessage(tripId, userId, text, replyTo) { return svc.createMessage(tripId, userId, text, replyTo); }
    deleteMessage(tripId, id, userId) { return svc.deleteMessage(tripId, id, userId); }
    reactMessage(id, tripId, userId, emoji) { return svc.addOrRemoveReaction(id, tripId, userId, emoji); }
    linkPreview(url) { return svc.fetchLinkPreview(url); }
    /** Fire-and-forget collab notification (mirrors the route's dynamic import). */
    notifyCollab(tripId, actor, preview) {
        Promise.resolve().then(() => __importStar(require('../../services/notificationService'))).then(({ send }) => {
            const tripInfo = database_1.db.prepare('SELECT title FROM trips WHERE id = ?').get(tripId);
            const params = { trip: tripInfo?.title || 'Untitled', actor: actor.email, tripId: String(tripId) };
            if (preview !== undefined)
                params.preview = preview;
            send({ event: 'collab_message', actorId: actor.id, scope: 'trip', targetId: Number(tripId), params }).catch(() => { });
        });
    }
};
exports.CollabService = CollabService;
exports.CollabService = CollabService = __decorate([
    (0, common_1.Injectable)()
], CollabService);
