"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasskeyEnabledGuard = void 0;
const common_1 = require("@nestjs/common");
const authService_1 = require("../../services/authService");
/**
 * Server-side enforcement of the instance-wide `passkey_login` toggle. Placed
 * BEFORE the auth guard on every passkey ceremony route so a disabled feature
 * returns 404 (not "auth required") and cannot be driven by direct API calls —
 * hiding the button in the UI is not enough. Mirrors JourneyAddonGuard.
 *
 * The credential-management routes (list/rename/delete) are deliberately NOT
 * gated by this guard so users can still clean up their passkeys after an admin
 * turns the feature off.
 */
let PasskeyEnabledGuard = class PasskeyEnabledGuard {
    canActivate() {
        if (!(0, authService_1.resolveAuthToggles)().passkey_login) {
            throw new common_1.HttpException({ error: 'Passkey login is not enabled' }, 404);
        }
        return true;
    }
};
exports.PasskeyEnabledGuard = PasskeyEnabledGuard;
exports.PasskeyEnabledGuard = PasskeyEnabledGuard = __decorate([
    (0, common_1.Injectable)()
], PasskeyEnabledGuard);
