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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const health_service_1 = require("./health.service");
const jwt_auth_guard_1 = require("../auth/jwt-auth.guard");
const current_user_decorator_1 = require("../auth/current-user.decorator");
const zod_validation_pipe_1 = require("../common/zod-validation.pipe");
// Local demo schema (real domains import their schema from @memove/shared).
const echoSchema = zod_1.z.object({ name: zod_1.z.string().min(1) });
/**
 * Foundation smoke endpoints for the co-hosted NestJS app.
 * Proves: boot, routing, type-based DI, the shared SQLite connection, the
 * JWT-cookie auth guard, and the Zod validation pipe + error-envelope parity.
 *
 * Lives under /api/_nest/* so it never collides with the legacy Express API.
 */
let HealthController = class HealthController {
    healthService;
    constructor(healthService) {
        this.healthService = healthService;
    }
    getHealth() {
        return { ok: true, ...this.healthService.info() };
    }
    /** Guarded: returns the authenticated user, proving JwtAuthGuard + @CurrentUser. */
    me(user) {
        return user;
    }
    /** Validated: proves the Zod pipe (400 + { error } on failure) and body parsing. */
    echo(body) {
        return { youSent: body };
    }
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "getHealth", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "me", null);
__decorate([
    (0, common_1.Post)('echo'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    __param(0, (0, common_1.Body)(new zod_validation_pipe_1.ZodValidationPipe(echoSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], HealthController.prototype, "echo", null);
exports.HealthController = HealthController = __decorate([
    (0, common_1.Controller)('api/_nest'),
    __metadata("design:paramtypes", [health_service_1.HealthService])
], HealthController);
