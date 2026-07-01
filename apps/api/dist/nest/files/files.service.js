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
exports.FilesService = void 0;
const common_1 = require("@nestjs/common");
const websocket_1 = require("../../websocket");
const permissions_1 = require("../../services/permissions");
const svc = __importStar(require("../../services/fileService"));
/**
 * Thin Nest wrapper around the existing file service. Trip access, the
 * file_* permissions, the SQL, the path-resolution guard, the download-token
 * auth and the WebSocket broadcasts reuse the legacy code unchanged.
 */
let FilesService = class FilesService {
    verifyTripAccess(tripId, userId) {
        return svc.verifyTripAccess(tripId, userId);
    }
    can(action, trip, user) {
        return (0, permissions_1.checkPermission)(action, user.role, trip.user_id, user.id, trip.user_id !== user.id);
    }
    broadcast(tripId, event, payload, socketId) {
        (0, websocket_1.broadcast)(tripId, event, payload, socketId);
    }
    // Download-token auth + safe path resolution (used by the unguarded download route).
    authenticateDownload(req) { return svc.authenticateDownload(req); }
    resolveFilePath(filename) { return svc.resolveFilePath(filename); }
    listFiles(tripId, showTrash) { return svc.listFiles(tripId, showTrash); }
    getFileById(id, tripId) { return svc.getFileById(id, tripId); }
    getDeletedFile(id, tripId) { return svc.getDeletedFile(id, tripId); }
    createFile(tripId, file, userId, opts) {
        return svc.createFile(tripId, file, userId, opts);
    }
    updateFile(id, current, updates) { return svc.updateFile(id, current, updates); }
    toggleStarred(id, currentStarred) { return svc.toggleStarred(id, currentStarred); }
    softDeleteFile(id) { return svc.softDeleteFile(id); }
    restoreFile(id) { return svc.restoreFile(id); }
    permanentDeleteFile(file) { return svc.permanentDeleteFile(file); }
    emptyTrash(tripId) { return svc.emptyTrash(tripId); }
    createFileLink(id, opts) { return svc.createFileLink(id, opts); }
    deleteFileLink(linkId, id) { return svc.deleteFileLink(linkId, id); }
    getFileLinks(id) { return svc.getFileLinks(id); }
};
exports.FilesService = FilesService;
exports.FilesService = FilesService = __decorate([
    (0, common_1.Injectable)()
], FilesService);
