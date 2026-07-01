"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUserCompletely = deleteUserCompletely;
const database_1 = require("../db/database");
function cleanupUserReferences(userId) {
    database_1.db.prepare('UPDATE trip_members SET invited_by = NULL WHERE invited_by = ?').run(userId);
    database_1.db.prepare('UPDATE budget_items SET paid_by_user_id = NULL WHERE paid_by_user_id = ?').run(userId);
    database_1.db.prepare('DELETE FROM share_tokens WHERE created_by = ?').run(userId);
    database_1.db.prepare('DELETE FROM journey_share_tokens WHERE created_by = ?').run(userId);
    // Owned journeys cascade-delete their entries/contributors/share_tokens/photos via journey_id FKs
    database_1.db.prepare('DELETE FROM journeys WHERE user_id = ?').run(userId);
    // Entries authored on other users' journeys (not covered by the cascade above)
    database_1.db.prepare('DELETE FROM journey_entries WHERE author_id = ?').run(userId);
    database_1.db.prepare('DELETE FROM journey_contributors WHERE user_id = ?').run(userId);
}
function deleteUserCompletely(userId) {
    const tx = database_1.db.transaction((id) => {
        cleanupUserReferences(id);
        database_1.db.prepare('DELETE FROM users WHERE id = ?').run(id);
    });
    tx(userId);
}
