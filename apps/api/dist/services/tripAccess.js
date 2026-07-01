"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTripAccess = verifyTripAccess;
const database_1 = require("../db/database");
/**
 * Returns the trip row if the user is the owner or a member, otherwise undefined.
 * Shared by the domain services so each one exposes the same access check.
 */
function verifyTripAccess(tripId, userId) {
    return (0, database_1.canAccessTrip)(tripId, userId);
}
