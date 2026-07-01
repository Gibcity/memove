"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpaFallbackFilter = void 0;
const common_1 = require("@nestjs/common");
const node_path_1 = __importDefault(require("node:path"));
const platform_routes_1 = require("./platform.routes");
/**
 * Serves the built SPA (index.html) for any request the NestJS router did not
 * match — the production single-page-app fallback. This replaces the legacy
 * Express `app.get('*')` catch-all, which cannot run on the Nest instance: Nest's
 * router terminates an unmatched request by throwing NotFoundException (it never
 * falls through to a post-init Express route), so the SPA fallback has to live
 * inside the Nest pipeline as a NotFound filter instead.
 *
 * Behaviour matches the legacy catch-all exactly: in production, an unmatched GET
 * returns index.html; everything else (non-GET, or dev where there is no built
 * client) keeps the standard memove `{ error }` 404 envelope. The `@Catch(NotFoundException)`
 * is more specific than the global MemoveExceptionFilter, so Nest routes 404s here
 * while every other error still flows through MemoveExceptionFilter.
 */
let SpaFallbackFilter = class SpaFallbackFilter {
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const req = ctx.getRequest();
        const res = ctx.getResponse();
        if (process.env.NODE_ENV === 'production' && req.method === 'GET') {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.sendFile(node_path_1.default.join(platform_routes_1.PUBLIC_DIR, 'index.html'));
            return;
        }
        // Non-production, or a non-GET miss: keep the standard memove 404 envelope
        // (identical to what MemoveExceptionFilter produces for a NotFoundException).
        res.status(404).json({ error: exception.message || 'Not Found' });
    }
};
exports.SpaFallbackFilter = SpaFallbackFilter;
exports.SpaFallbackFilter = SpaFallbackFilter = __decorate([
    (0, common_1.Catch)(common_1.NotFoundException)
], SpaFallbackFilter);
