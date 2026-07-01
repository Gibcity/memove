"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.avatarUrl = avatarUrl;
function avatarUrl(user) {
    return user.avatar ? `/uploads/avatars/${user.avatar}` : null;
}
