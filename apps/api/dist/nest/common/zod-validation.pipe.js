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
exports.ZodValidationPipe = void 0;
const common_1 = require("@nestjs/common");
/**
 * Validates an incoming @Body()/@Query() against a Zod schema (from @memove/shared)
 * and returns the parsed, typed value. On failure it throws memove's error envelope
 * `{ error: string }` with status 400 — the same shape the legacy routes produce,
 * so the client's error handling is unaffected.
 *
 * Usage: `@Body(new ZodValidationPipe(someSchema)) dto: Dto`.
 */
let ZodValidationPipe = class ZodValidationPipe {
    schema;
    constructor(schema) {
        this.schema = schema;
    }
    transform(value, metadata) {
        // @UsePipes applies this pipe to every parameter on the handler. For
        // handlers that take both @CurrentUser() and @Body(), that means the
        // pipe runs on the user object first and (silently) fails with
        // "expected string, received undefined" before it ever sees the body.
        // Only validate body / query payloads; pass everything else through.
        if (metadata?.type !== 'body' && metadata?.type !== 'query')
            return value;
        const result = this.schema.safeParse(value);
        if (!result.success) {
            const message = result.error.issues
                .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
                .join('; ');
            throw new common_1.HttpException({ error: message }, 400);
        }
        return result.data;
    }
};
exports.ZodValidationPipe = ZodValidationPipe;
exports.ZodValidationPipe = ZodValidationPipe = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Function])
], ZodValidationPipe);
