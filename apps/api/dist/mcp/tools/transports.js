"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTransportTools = registerTransportTools;
const zod_1 = require("zod");
const database_1 = require("../../db/database");
const authService_1 = require("../../services/authService");
const reservationService_1 = require("../../services/reservationService");
const budgetService_1 = require("../../services/budgetService");
const dayService_1 = require("../../services/dayService");
const airportService_1 = require("../../services/airportService");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
const TRANSPORT_TYPES = ['flight', 'train', 'car', 'cruise'];
const endpointObjectSchema = zod_1.z.object({
    role: zod_1.z.enum(['from', 'to', 'stop']).describe('Endpoint role: "from" (origin), "to" (destination), or "stop" (intermediate)'),
    sequence: zod_1.z.number().int().min(0).describe('Order within the route (0-based)'),
    name: zod_1.z.string().min(1).describe('Location name (e.g. "Paris Gare de Lyon", "ZRH Terminal 2")'),
    code: zod_1.z.string().optional().describe('IATA airport code for flights (e.g. "ZRH"). Leave empty for other transport types.'),
    lat: zod_1.z.number().optional().describe('Latitude. For flights, leave empty and set code instead — coordinates are filled from the airport.'),
    lng: zod_1.z.number().optional().describe('Longitude. For flights, leave empty and set code instead — coordinates are filled from the airport.'),
    timezone: zod_1.z.string().optional().describe('IANA timezone (e.g. "Europe/Zurich"). Use airport tz for flights.'),
    local_time: zod_1.z.string().optional().describe('Local departure/arrival time at this endpoint, e.g. "14:35"'),
    local_date: zod_1.z.string().optional().describe('Local date at this endpoint, YYYY-MM-DD'),
});
const endpointSchema = zod_1.z.array(endpointObjectSchema).optional();
/**
 * Endpoint coordinates are stored NOT NULL. Callers may supply a flight endpoint
 * with only an IATA `code` (the tool description encourages this), so fill missing
 * lat/lng/timezone from the airport database. Returns an error string for the first
 * endpoint that can't be resolved rather than letting the NOT NULL bind throw.
 *
 * Normalizes to the service's EndpointInput shape (nullable fields coerced from the
 * schema's optionals), so lat/lng are guaranteed present before the insert.
 */
function resolveEndpointCoords(endpoints) {
    if (!endpoints)
        return { endpoints: [] };
    const out = [];
    for (const e of endpoints) {
        const base = {
            role: e.role,
            sequence: e.sequence,
            name: e.name,
            code: e.code ?? null,
            timezone: e.timezone ?? null,
            local_time: e.local_time ?? null,
            local_date: e.local_date ?? null,
        };
        if (e.lat != null && e.lng != null) {
            out.push({ ...base, lat: e.lat, lng: e.lng });
            continue;
        }
        if (e.code) {
            const airport = (0, airportService_1.findByIata)(e.code);
            if (airport) {
                out.push({ ...base, lat: airport.lat, lng: airport.lng, timezone: e.timezone ?? airport.tz });
                continue;
            }
            return { error: `Could not resolve airport code "${e.code}". Use search_airports to find a valid IATA code, or supply lat/lng directly.` };
        }
        return { error: `Endpoint "${e.name}" is missing coordinates. For flights set "code" to the IATA airport code; for other transport types supply lat/lng.` };
    }
    return { endpoints: out };
}
function registerTransportTools(server, userId, scopes) {
    if (!(0, scopes_1.canWrite)(scopes, 'reservations'))
        return;
    server.registerTool('create_transport', {
        description: 'Create a transport booking (flight, train, car, or cruise) for a trip. Use endpoints[] to record origin/destination and intermediate stops — for flights, set code to the IATA airport code (use search_airports first). Created as pending — confirm with update_transport. Set price to record the cost; it will appear on the booking and in the Budget tab.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            type: zod_1.z.enum(['flight', 'train', 'car', 'cruise']),
            title: zod_1.z.string().min(1).max(200),
            status: zod_1.z.enum(['pending', 'confirmed', 'cancelled']).optional().default('pending'),
            start_day_id: zod_1.z.number().int().positive().optional().describe('Departure day'),
            end_day_id: zod_1.z.number().int().positive().optional().describe('Arrival day (if different from departure)'),
            reservation_time: zod_1.z.string().optional().describe('ISO 8601 datetime or time string for departure'),
            reservation_end_time: zod_1.z.string().optional().describe('ISO 8601 datetime or time string for arrival'),
            confirmation_number: zod_1.z.string().max(100).optional(),
            notes: zod_1.z.string().max(1000).optional(),
            metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional().describe('Type-specific metadata: flights → { airline, flight_number, departure_airport, arrival_airport }; trains → { train_number, platform, seat }'),
            endpoints: endpointSchema,
            needs_review: zod_1.z.boolean().optional(),
            price: zod_1.z.number().nonnegative().optional().describe('Transport cost — shown on the booking and linked in the Budget tab'),
            budget_category: zod_1.z.string().max(100).optional().describe('Budget category for the price entry (defaults to transport type)'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
    }, async ({ tripId, type, title, status, start_day_id, end_day_id, reservation_time, reservation_end_time, confirmation_number, notes, metadata, endpoints, needs_review, price, budget_category }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('reservation_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        if (start_day_id && !(0, dayService_1.getDay)(start_day_id, tripId))
            return { content: [{ type: 'text', text: 'start_day_id does not belong to this trip.' }], isError: true };
        if (end_day_id && !(0, dayService_1.getDay)(end_day_id, tripId))
            return { content: [{ type: 'text', text: 'end_day_id does not belong to this trip.' }], isError: true };
        const resolved = resolveEndpointCoords(endpoints);
        if ('error' in resolved)
            return { content: [{ type: 'text', text: resolved.error }], isError: true };
        const meta = { ...(metadata ?? {}) };
        if (price != null)
            meta.price = String(price);
        const { reservation } = (0, reservationService_1.createReservation)(tripId, {
            title,
            type,
            reservation_time,
            reservation_end_time,
            location: undefined,
            confirmation_number,
            notes,
            day_id: start_day_id,
            end_day_id: end_day_id ?? start_day_id,
            status: status ?? 'pending',
            metadata: Object.keys(meta).length > 0 ? meta : undefined,
            endpoints: resolved.endpoints,
            needs_review,
        });
        if (price != null && price > 0) {
            const item = (0, budgetService_1.linkBudgetItemToReservation)(tripId, reservation.id, {
                name: title,
                category: budget_category || type,
                total_price: price,
            });
            (0, _shared_1.safeBroadcast)(tripId, 'budget:created', { item });
        }
        (0, _shared_1.safeBroadcast)(tripId, 'reservation:created', { reservation });
        return (0, _shared_1.ok)({ reservation });
    });
    server.registerTool('update_transport', {
        description: 'Update an existing transport booking. Pass endpoints[] to replace the full list of stops (origin, destination, intermediates). Use status "confirmed" to confirm.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            reservationId: zod_1.z.number().int().positive(),
            type: zod_1.z.enum(['flight', 'train', 'car', 'cruise']).optional(),
            title: zod_1.z.string().min(1).max(200).optional(),
            status: zod_1.z.enum(['pending', 'confirmed', 'cancelled']).optional(),
            start_day_id: zod_1.z.number().int().positive().optional().describe('Departure day'),
            end_day_id: zod_1.z.number().int().positive().optional().describe('Arrival day (if different from departure)'),
            reservation_time: zod_1.z.string().optional().describe('ISO 8601 datetime or time string for departure'),
            reservation_end_time: zod_1.z.string().optional().describe('ISO 8601 datetime or time string for arrival'),
            confirmation_number: zod_1.z.string().max(100).optional(),
            notes: zod_1.z.string().max(1000).optional(),
            metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional().describe('Type-specific metadata: flights → { airline, flight_number, departure_airport, arrival_airport }; trains → { train_number, platform, seat }'),
            endpoints: endpointSchema,
            needs_review: zod_1.z.boolean().optional(),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
    }, async ({ tripId, reservationId, type, title, status, start_day_id, end_day_id, reservation_time, reservation_end_time, confirmation_number, notes, metadata, endpoints, needs_review }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('reservation_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        const existing = (0, reservationService_1.getReservation)(reservationId, tripId);
        if (!existing)
            return { content: [{ type: 'text', text: 'Transport not found.' }], isError: true };
        const resolvedType = type ?? existing.type;
        if (!TRANSPORT_TYPES.includes(resolvedType))
            return { content: [{ type: 'text', text: 'Reservation is not a transport type. Use update_reservation instead.' }], isError: true };
        if (start_day_id && !(0, dayService_1.getDay)(start_day_id, tripId))
            return { content: [{ type: 'text', text: 'start_day_id does not belong to this trip.' }], isError: true };
        if (end_day_id && !(0, dayService_1.getDay)(end_day_id, tripId))
            return { content: [{ type: 'text', text: 'end_day_id does not belong to this trip.' }], isError: true };
        // Only resolve when endpoints are explicitly provided; undefined leaves them untouched.
        let resolvedEndpoints;
        if (endpoints !== undefined) {
            const resolved = resolveEndpointCoords(endpoints);
            if ('error' in resolved)
                return { content: [{ type: 'text', text: resolved.error }], isError: true };
            resolvedEndpoints = resolved.endpoints;
        }
        const { reservation } = (0, reservationService_1.updateReservation)(reservationId, tripId, {
            title,
            type,
            reservation_time,
            reservation_end_time,
            confirmation_number,
            notes,
            day_id: start_day_id,
            end_day_id,
            status,
            metadata,
            endpoints: resolvedEndpoints,
            needs_review,
        }, existing);
        (0, _shared_1.safeBroadcast)(tripId, 'reservation:updated', { reservation });
        return (0, _shared_1.ok)({ reservation });
    });
    server.registerTool('delete_transport', {
        description: 'Delete a transport booking from a trip.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            reservationId: zod_1.z.number().int().positive(),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_DELETE,
    }, async ({ tripId, reservationId }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('reservation_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        const { deleted } = (0, reservationService_1.deleteReservation)(reservationId, tripId);
        if (!deleted)
            return { content: [{ type: 'text', text: 'Transport not found.' }], isError: true };
        (0, _shared_1.safeBroadcast)(tripId, 'reservation:deleted', { reservationId });
        return (0, _shared_1.ok)({ success: true });
    });
}
