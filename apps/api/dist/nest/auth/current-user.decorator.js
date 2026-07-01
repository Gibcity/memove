"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrentUser = void 0;
const common_1 = require("@nestjs/common");
/**
 * Resolves the authenticated user attached by JwtAuthGuard.
 * Use on guarded handlers: `getThing(@CurrentUser() user: User) { ... }`.
 */
exports.CurrentUser = (0, common_1.createParamDecorator)((_data, context) => {
    return context.switchToHttp().getRequest().user;
});
