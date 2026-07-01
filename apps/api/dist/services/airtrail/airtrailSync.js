"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncGloballyEnabled = syncGloballyEnabled;
exports.runAirtrailSync = runAirtrailSync;
exports.runAirtrailSyncForUser = runAirtrailSyncForUser;
exports.buildSavePayload = buildSavePayload;
exports.pushReservationToAirtrail = pushReservationToAirtrail;
const addons_1 = require("../../addons");
const database_1 = require("../../db/database");
const websocket_1 = require("../../websocket");
const adminService_1 = require("../adminService");
const auditLog_1 = require("../auditLog");
const reservationService_1 = require("../reservationService");
const airtrailClient_1 = require("./airtrailClient");
const airtrailMapper_1 = require("./airtrailMapper");
const airtrailService_1 = require("./airtrailService");
/** Global on/off: the addon must be enabled and sync not explicitly turned off. */
function syncGloballyEnabled() {
    if (!(0, adminService_1.isAddonEnabled)(addons_1.ADDON_IDS.AIRTRAIL))
        return false;
    const row = database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'airtrail_sync_enabled'").get();
    return row?.value !== 'false';
}
function broadcastUpdated(tripId, reservationId) {
    try {
        const reservation = (0, reservationService_1.getReservationWithJoins)(reservationId);
        if (reservation)
            (0, websocket_1.broadcast)(tripId, 'reservation:updated', { reservation });
    }
    catch {
        /* broadcast failure is non-fatal */
    }
}
function detach(tripId, reservationId) {
    database_1.db.prepare('UPDATE reservations SET sync_enabled = 0 WHERE id = ?').run(reservationId);
    broadcastUpdated(tripId, reservationId);
}
// ── AirTrail → memove (poll) ───────────────────────────────────────────────────
/**
 * Reconcile one owner's linked reservations against their current AirTrail
 * flights: apply field changes (detected by snapshot hash, since AirTrail has no
 * updated_at) and, when a flight is gone from AirTrail, keep the memove row but
 * stop syncing it. Only already-imported flights are touched — new AirTrail
 * flights are never auto-added to a trip. Returns how many rows changed.
 */
async function syncOwner(uid) {
    const creds = (0, airtrailService_1.getAirtrailCredentials)(uid);
    if (!creds)
        return 0; // owner disconnected — leave their linked rows as-is
    let flights;
    try {
        flights = await (0, airtrailClient_1.listFlights)(creds);
    }
    catch (err) {
        if (err instanceof airtrailClient_1.AirtrailAuthError)
            (0, auditLog_1.logError)(`AirTrail sync: invalid API key for user ${uid}`);
        return 0;
    }
    const byId = new Map(flights.map((f) => [String(f.id), f]));
    const linked = database_1.db
        .prepare("SELECT id, trip_id, external_id, external_hash FROM reservations WHERE external_source = 'airtrail' AND sync_enabled = 1 AND external_owner_user_id = ?")
        .all(uid);
    let changed = 0;
    for (const row of linked) {
        const flight = byId.get(String(row.external_id));
        if (!flight) {
            detach(row.trip_id, row.id); // deleted in AirTrail → keep row, stop syncing
            changed++;
            continue;
        }
        const hash = (0, airtrailMapper_1.canonicalHash)(flight);
        if (hash === row.external_hash)
            continue;
        const current = (0, reservationService_1.getReservation)(row.id, row.trip_id);
        if (!current)
            continue;
        try {
            (0, reservationService_1.updateReservation)(row.id, row.trip_id, (0, airtrailMapper_1.mapFlightToReservation)(flight), current);
            database_1.db.prepare('UPDATE reservations SET external_hash = ?, external_synced_at = ? WHERE id = ?').run(hash, new Date().toISOString(), row.id);
            broadcastUpdated(row.trip_id, row.id);
            changed++;
        }
        catch (err) {
            (0, auditLog_1.logError)(`AirTrail sync: failed to update reservation ${row.id}: ${err instanceof Error ? err.message : err}`);
        }
    }
    return changed;
}
let running = false;
/** Background poll across every connected owner (scheduler). */
async function runAirtrailSync() {
    if (running)
        return;
    if (!syncGloballyEnabled())
        return;
    running = true;
    let changed = 0;
    try {
        const owners = database_1.db
            .prepare("SELECT DISTINCT external_owner_user_id AS uid FROM reservations WHERE external_source = 'airtrail' AND sync_enabled = 1 AND external_owner_user_id IS NOT NULL")
            .all();
        for (const { uid } of owners)
            changed += await syncOwner(uid);
        if (changed > 0)
            (0, auditLog_1.logInfo)(`AirTrail sync: applied ${changed} change(s)`);
    }
    catch (err) {
        (0, auditLog_1.logError)(`AirTrail sync failed: ${err instanceof Error ? err.message : err}`);
    }
    finally {
        running = false;
    }
}
/**
 * On-demand sync of just this user's linked flights — called when the user opens
 * a trip so AirTrail-side edits show up immediately instead of waiting for the
 * background poll.
 */
async function runAirtrailSyncForUser(userId) {
    if (!syncGloballyEnabled())
        return { changed: 0 };
    try {
        return { changed: await syncOwner(userId) };
    }
    catch (err) {
        (0, auditLog_1.logError)(`AirTrail sync (user ${userId}) failed: ${err instanceof Error ? err.message : err}`);
        return { changed: 0 };
    }
}
// ── memove → AirTrail (push) ───────────────────────────────────────────────────
function splitLocal(dt) {
    if (!dt)
        return { date: null, time: null };
    const date = dt.slice(0, 10);
    const m = dt.slice(10).match(/(\d{2}:\d{2})/);
    return { date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, time: m ? m[1] : null };
}
/**
 * Build the POST /flight/save body. AirTrail's save fully overwrites the flight,
 * so we start from the flight as AirTrail currently has it (`existing`, the raw
 * GET object) and overwrite ONLY the fields memove manages. Everything else —
 * terminal, gate, scheduled/actual times, customFields, track, and any field
 * AirTrail may add later — passes through untouched. We deliberately do NOT model
 * those fields; spreading the raw object keeps us decoupled from AirTrail's schema
 * (#1240).
 */
function buildSavePayload(reservation, existing) {
    let meta;
    try {
        meta = reservation.metadata ? JSON.parse(reservation.metadata) : {};
    }
    catch {
        meta = {};
    }
    const endpoints = reservation.endpoints || [];
    const fromEp = endpoints.find((e) => e.role === 'from');
    const toEp = endpoints.find((e) => e.role === 'to');
    const fromCode = fromEp?.code || existing.from?.iata || existing.from?.icao || null;
    const toCode = toEp?.code || existing.to?.iata || existing.to?.icao || null;
    if (!fromCode || !toCode)
        return null;
    const dep = splitLocal(reservation.reservation_time);
    const arr = splitLocal(reservation.reservation_end_time);
    if (!dep.date)
        return null;
    // Preserve the existing seat manifest (an update replaces all seats); fall back
    // to the key-owner placeholder so AirTrail attributes it to the connecting user.
    const seats = (existing.seats ?? []).map((s) => ({
        userId: s.userId,
        guestName: s.guestName,
        seat: s.seat,
        seatNumber: s.seatNumber,
        seatClass: s.seatClass,
    }));
    if (seats.length === 0) {
        seats.push({ userId: '<USER_ID>', guestName: null, seat: null, seatNumber: null, seatClass: null });
    }
    // Push the seat the user set in memove onto their own AirTrail seat (the one with
    // a userId), leaving any co-passenger seats untouched.
    const seatNumber = typeof meta.seat === 'string' && meta.seat.trim() ? meta.seat.trim() : null;
    if (seatNumber) {
        const ownSeat = seats.find((s) => s.userId) ?? seats[0];
        if (ownSeat)
            ownSeat.seatNumber = seatNumber;
    }
    // Spread the existing flight first to preserve every AirTrail-owned field, then
    // overwrite only what memove manages. `from`/`to`/`airline`/`aircraft` come back
    // from GET as objects but the save shape wants codes — those are exactly the
    // keys we override, so the spread never ships an object where a code is wanted.
    return {
        // Cast so the spread carries through the AirTrail-owned keys we deliberately
        // don't model (terminal, gate, scheduled/actual times, customFields, track, …).
        ...existing,
        id: Number(reservation.external_id),
        from: fromCode,
        to: toCode,
        departure: dep.date,
        departureTime: dep.time,
        arrival: arr.date,
        arrivalTime: arr.time,
        // Import reads the SCHEDULED time, so a memove edit must write back there too —
        // otherwise the next pull (scheduled-wins) would revert it. AirTrail rebuilds the
        // instant from a full-ISO date carrier + the HH:MM time, so pass a date carrier.
        departureScheduled: dep.date ? `${dep.date}T00:00:00.000Z` : null,
        departureScheduledTime: dep.time,
        arrivalScheduled: arr.date ? `${arr.date}T00:00:00.000Z` : null,
        arrivalScheduledTime: arr.time,
        // These are AirTrail-owned details memove doesn't surface in its edit UI — a memove
        // edit can leave them out of `metadata`. Preserve AirTrail's current value when
        // memove has none rather than nulling it out (#1240). entityCode mirrors the
        // import/hash code-selection so a writeback stays a no-op for the hash.
        airline: meta.airline ?? (0, airtrailMapper_1.entityCode)(existing.airline) ?? null,
        flightNumber: meta.flight_number ?? existing.flightNumber ?? null,
        aircraft: meta.aircraft ?? (0, airtrailMapper_1.entityCode)(existing.aircraft) ?? null,
        aircraftReg: meta.aircraft_reg ?? existing.aircraftReg ?? null,
        flightReason: meta.flight_reason ?? existing.flightReason ?? null,
        note: reservation.notes ?? existing.note ?? null,
        seats,
    };
}
/**
 * Push a locally-edited linked reservation back to AirTrail using the importer's
 * (owner's) credentials — even if a different member made the edit. If the owner
 * is gone or the flight no longer exists in AirTrail, the link is detached so the
 * next pull's AirTrail-wins policy can't silently revert the local edit.
 */
async function pushReservationToAirtrail(reservationId, tripId) {
    if (!syncGloballyEnabled())
        return;
    const row = database_1.db
        .prepare("SELECT id, trip_id, external_id, external_owner_user_id, sync_enabled FROM reservations WHERE id = ? AND external_source = 'airtrail'")
        .get(reservationId);
    if (!row || !row.sync_enabled)
        return;
    // AirTrail is read-only by default (#1240). Only push when the flight's owner has
    // explicitly opted in. A no-op skip (not a detach): the link stays active so the
    // inbound, AirTrail-wins pull keeps the reservation up to date.
    if (!row.external_owner_user_id || !(0, airtrailService_1.isAirtrailWriteEnabled)(row.external_owner_user_id))
        return;
    const creds = (0, airtrailService_1.getAirtrailCredentials)(row.external_owner_user_id);
    if (!creds) {
        detach(tripId, row.id); // owner disconnected — cannot push, so stop syncing
        return;
    }
    let existing;
    try {
        existing = await (0, airtrailClient_1.getFlight)(creds, Number(row.external_id));
    }
    catch (err) {
        if (err instanceof airtrailClient_1.AirtrailAuthError)
            detach(tripId, row.id);
        else
            (0, auditLog_1.logError)(`AirTrail push: get failed for reservation ${row.id}: ${err instanceof Error ? err.message : err}`);
        return;
    }
    if (!existing) {
        detach(tripId, row.id); // gone in AirTrail → treat like a remote delete
        return;
    }
    const reservation = (0, reservationService_1.getReservationWithJoins)(row.id);
    if (!reservation)
        return;
    const payload = buildSavePayload(reservation, existing);
    if (!payload)
        return;
    try {
        await (0, airtrailClient_1.saveFlight)(creds, payload);
        // Self-write suppression: re-read the saved flight and store its hash so the
        // next poll doesn't treat our own write as an inbound change.
        const saved = await (0, airtrailClient_1.getFlight)(creds, Number(row.external_id));
        if (saved) {
            database_1.db.prepare('UPDATE reservations SET external_hash = ?, external_synced_at = ? WHERE id = ?').run((0, airtrailMapper_1.canonicalHash)(saved), new Date().toISOString(), row.id);
        }
    }
    catch (err) {
        (0, auditLog_1.logError)(`AirTrail push failed for reservation ${row.id}: ${err instanceof Error ? err.message : err}`);
    }
}
