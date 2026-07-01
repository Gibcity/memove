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
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const database_service_1 = require("../database/database.service");
/**
 * Nest counterpart of the legacy `applyIdempotency` middleware
 * (server/src/middleware/idempotency.ts), which the Express `authenticate`
 * middleware runs on every authenticated request.
 *
 * The memove client attaches an `X-Idempotency-Key` to ALL write operations (see
 * client/src/api/client.ts) and the offline sync queue replays mutations with
 * that key, so a migrated mutating route MUST honour it — otherwise a replayed
 * POST would create a duplicate instead of returning the cached response. This
 * reproduces the legacy behaviour exactly, against the same `idempotency_keys`
 * table:
 *   - non-mutating method, or no key, or no authenticated user -> pass through
 *   - key longer than the cap -> 400 with the exact legacy message
 *   - (key, user, method, path) already stored -> replay the cached response
 *   - otherwise -> capture a successful JSON response under the key
 *
 * Capturing wraps `res.json`, so 204 / `res.end()` responses are not cached —
 * matching the Express wrapper, which only fires on `res.json`.
 */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_KEY_LENGTH = 128;
const MAX_CACHED_BODY_BYTES = 256 * 1024;
let IdempotencyInterceptor = class IdempotencyInterceptor {
    database;
    constructor(database) {
        this.database = database;
    }
    intercept(context, next) {
        const req = context.switchToHttp().getRequest();
        const res = context.switchToHttp().getResponse();
        if (!MUTATING_METHODS.has(req.method))
            return next.handle();
        const key = req.headers['x-idempotency-key'];
        if (!key)
            return next.handle();
        // Idempotency only applies to authenticated requests — the legacy code runs
        // inside `authenticate`, after req.user is set.
        const userId = req.user?.id;
        if (userId == null)
            return next.handle();
        if (key.length > MAX_KEY_LENGTH) {
            throw new common_1.HttpException({ error: 'X-Idempotency-Key exceeds maximum length of 128 characters' }, 400);
        }
        // Scope the lookup by method + path as well as user, so the same key replayed
        // against a different endpoint can't return an unrelated cached body.
        const existing = this.database.get('SELECT status_code, response_body FROM idempotency_keys WHERE key = ? AND user_id = ? AND method = ? AND path = ?', key, userId, req.method, req.path);
        if (existing) {
            res.status(existing.status_code);
            return (0, rxjs_1.of)(JSON.parse(existing.response_body));
        }
        const originalJson = res.json.bind(res);
        const database = this.database;
        res.json = function (body) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                try {
                    const serialized = JSON.stringify(body);
                    if (serialized.length <= MAX_CACHED_BODY_BYTES) {
                        database.run(`INSERT OR IGNORE INTO idempotency_keys (key, user_id, method, path, status_code, response_body, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`, key, userId, req.method, req.path, res.statusCode, serialized, Math.floor(Date.now() / 1000));
                    }
                }
                catch {
                    // Non-fatal: if storage fails, the request still succeeds.
                }
            }
            return originalJson(body);
        };
        return next.handle();
    }
};
exports.IdempotencyInterceptor = IdempotencyInterceptor;
exports.IdempotencyInterceptor = IdempotencyInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], IdempotencyInterceptor);
