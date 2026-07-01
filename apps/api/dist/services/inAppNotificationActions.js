"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAction = registerAction;
exports.getAction = getAction;
const actionRegistry = new Map();
function registerAction(actionType, handler) {
    actionRegistry.set(actionType, handler);
}
function getAction(actionType) {
    return actionRegistry.get(actionType);
}
// Dev/test actions
registerAction('test_approve', async () => {
    console.log('[notifications] Test approve action executed');
});
registerAction('test_deny', async () => {
    console.log('[notifications] Test deny action executed');
});
