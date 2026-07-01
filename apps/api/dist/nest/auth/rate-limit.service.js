"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitService = void 0;
const common_1 = require("@nestjs/common");
/**
 * In-memory per-IP rate limiter, ported 1:1 from the legacy auth route's
 * `rateLimiter`. Each named bucket keeps its own attempt map; `check` returns
 * false once a key exceeds `max` within `windowMs` (the caller answers 429).
 *
 * The legacy route also ran a setInterval to garbage-collect expired records;
 * that was pure memory housekeeping (the window check below already treats an
 * expired record as fresh), so it is intentionally omitted — the limit
 * behaviour is identical and there's no dangling timer to leak in tests.
 */
let RateLimitService = class RateLimitService {
    buckets = new Map();
    store(bucket) {
        let s = this.buckets.get(bucket);
        if (!s) {
            s = new Map();
            this.buckets.set(bucket, s);
        }
        return s;
    }
    /** Returns true when the request is allowed, false when it should be rejected (429). */
    check(bucket, key, max, windowMs, now) {
        const store = this.store(bucket);
        const record = store.get(key);
        if (record && record.count >= max && now - record.first < windowMs) {
            return false;
        }
        if (!record || now - record.first >= windowMs) {
            store.set(key, { count: 1, first: now });
        }
        else {
            record.count++;
        }
        return true;
    }
    /** Test helper: clear a bucket (mirrors the legacy exported maps used for resets). */
    reset(bucket) {
        if (bucket)
            this.buckets.get(bucket)?.clear();
        else
            this.buckets.clear();
    }
};
exports.RateLimitService = RateLimitService;
exports.RateLimitService = RateLimitService = __decorate([
    (0, common_1.Injectable)()
], RateLimitService);
