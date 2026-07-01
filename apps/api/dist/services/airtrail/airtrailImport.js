"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importAirtrailFlights = importAirtrailFlights;
const database_1 = require("../../db/database");
const websocket_1 = require("../../websocket");
const reservationService_1 = require("../reservationService");
const airtrailService_1 = require("./airtrailService");
const airtrailClient_1 = require("./airtrailClient");
const airtrailMapper_1 = require("./airtrailMapper");
function depDate(t) {
    return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
}
/** A loose "same physical flight" key: flight number + date, else route + date. */
function softSignature(date, flightNumber, fromCode, toCode) {
    if (!date)
        return null;
    if (flightNumber)
        return `fn:${flightNumber.toUpperCase()}@${date}`;
    if (fromCode && toCode)
        return `rt:${fromCode.toUpperCase()}-${toCode.toUpperCase()}@${date}`;
    return null;
}
/**
 * Import the given AirTrail flights into a trip as reservations (type:'flight'),
 * recording the AirTrail linkage for two-way sync and broadcasting each one live.
 *
 * Dedup: a flight already linked to this trip is skipped ('already-imported'); a
 * flight that looks like one already in the trip — e.g. the same flight another
 * member already imported from their own AirTrail — is skipped ('already-in-trip').
 * The server re-fetches the flights by id with the caller's own key, so the client
 * cannot inject arbitrary flight data.
 */
async function importAirtrailFlights(tripId, userId, flightIds, socketId) {
    const creds = (0, airtrailService_1.getAirtrailCredentials)(userId);
    if (!creds)
        throw new airtrailClient_1.AirtrailRequestError('AirTrail is not connected', 400);
    const wanted = new Set(flightIds.map(String));
    const selected = (await (0, airtrailClient_1.listFlights)(creds)).filter(f => wanted.has(String(f.id)));
    const result = { imported: [], skipped: [] };
    const linkedIds = new Set(database_1.db.prepare("SELECT external_id FROM reservations WHERE trip_id = ? AND external_source = 'airtrail'").all(tripId)
        .map(r => r.external_id)
        .filter((v) => !!v));
    const existing = database_1.db
        .prepare(`SELECT r.id, r.reservation_time, r.metadata,
              (SELECT code FROM reservation_endpoints WHERE reservation_id = r.id AND role = 'from' LIMIT 1) AS from_code,
              (SELECT code FROM reservation_endpoints WHERE reservation_id = r.id AND role = 'to' LIMIT 1) AS to_code
       FROM reservations r WHERE r.trip_id = ? AND r.type = 'flight'`)
        .all(tripId);
    const existingSigs = new Set();
    for (const row of existing) {
        let fn = null;
        try {
            fn = row.metadata ? (JSON.parse(row.metadata).flight_number ?? null) : null;
        }
        catch {
            /* malformed metadata — ignore */
        }
        const sig = softSignature(depDate(row.reservation_time), fn, row.from_code, row.to_code);
        if (sig)
            existingSigs.add(sig);
    }
    for (const flight of selected) {
        const fid = String(flight.id);
        if (linkedIds.has(fid)) {
            result.skipped.push({ flightId: fid, reason: 'already-imported' });
            continue;
        }
        const mapped = (0, airtrailMapper_1.mapFlightToReservation)(flight);
        const sig = softSignature(depDate(mapped.reservation_time), mapped.metadata.flight_number ?? null, mapped.endpoints.find(e => e.role === 'from')?.code ?? null, mapped.endpoints.find(e => e.role === 'to')?.code ?? null);
        if (sig && existingSigs.has(sig)) {
            result.skipped.push({ flightId: fid, reason: 'already-in-trip', detail: mapped.title });
            continue;
        }
        try {
            const { reservation } = (0, reservationService_1.createReservation)(tripId, mapped);
            const now = new Date().toISOString();
            database_1.db.prepare(`UPDATE reservations SET external_source = 'airtrail', external_id = ?, external_owner_user_id = ?,
                sync_enabled = 1, external_hash = ?, external_synced_at = ? WHERE id = ?`).run(fid, userId, (0, airtrailMapper_1.canonicalHash)(flight), now, reservation.id);
            // Carry the linkage on the broadcast payload so members see the badge live.
            reservation.external_source = 'airtrail';
            reservation.external_id = fid;
            reservation.external_owner_user_id = userId;
            reservation.sync_enabled = 1;
            reservation.external_synced_at = now;
            (0, websocket_1.broadcast)(tripId, 'reservation:created', { reservation }, socketId);
            if (sig)
                existingSigs.add(sig);
            linkedIds.add(fid);
            result.imported.push(fid);
        }
        catch (err) {
            console.error('[airtrail-import] failed to import flight', fid, err instanceof Error ? err.message : err);
            result.skipped.push({ flightId: fid, reason: 'invalid', detail: err instanceof Error ? err.message : undefined });
        }
    }
    return result;
}
