"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerReservationTools = registerReservationTools;
const zod_1 = require("zod");
const database_1 = require("../../db/database");
const authService_1 = require("../../services/authService");
const reservationService_1 = require("../../services/reservationService");
const budgetService_1 = require("../../services/budgetService");
const dayService_1 = require("../../services/dayService");
const assignmentService_1 = require("../../services/assignmentService");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
function registerReservationTools(server, userId, scopes) {
    if (!(0, scopes_1.canWrite)(scopes, 'reservations'))
        return;
    server.registerTool('create_reservation', {
        description: 'Recommend a reservation for a trip. Created as pending — the user must confirm it. For flights, trains, cars, and cruises, use create_transport instead. Linking: hotel → use place_id + start_day_id + end_day_id (all three required to create the accommodation link); restaurant/event/tour/activity/other → use assignment_id. Set price to record the cost; it will appear on the booking and in the Budget tab.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            title: zod_1.z.string().min(1).max(200),
            type: zod_1.z.enum(['hotel', 'restaurant', 'event', 'tour', 'activity', 'other']).describe('Reservation type: "hotel", "restaurant", "event", "tour", "activity", or "other"'),
            reservation_time: zod_1.z.string().optional().describe('ISO 8601 datetime or time string'),
            location: zod_1.z.string().max(500).optional(),
            confirmation_number: zod_1.z.string().max(100).optional(),
            notes: zod_1.z.string().max(1000).optional(),
            day_id: zod_1.z.number().int().positive().optional(),
            place_id: zod_1.z.number().int().positive().optional().describe('Hotel place to link (hotel type only)'),
            start_day_id: zod_1.z.number().int().positive().optional().describe('Check-in day (hotel type only; requires place_id and end_day_id)'),
            end_day_id: zod_1.z.number().int().positive().optional().describe('Check-out day (hotel type only; requires place_id and start_day_id)'),
            check_in: zod_1.z.string().max(10).optional().describe('Check-in time (e.g. "15:00", hotel type only)'),
            check_out: zod_1.z.string().max(10).optional().describe('Check-out time (e.g. "11:00", hotel type only)'),
            assignment_id: zod_1.z.number().int().positive().optional().describe('Link to a day assignment (restaurant, train, car, cruise, event, tour, activity, other)'),
            price: zod_1.z.number().nonnegative().optional().describe('Reservation cost — shown on the booking and linked in the Budget tab'),
            budget_category: zod_1.z.string().max(100).optional().describe('Budget category for the price entry (defaults to reservation type)'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_NON_IDEMPOTENT,
    }, async ({ tripId, title, type, reservation_time, location, confirmation_number, notes, day_id, place_id, start_day_id, end_day_id, check_in, check_out, assignment_id, price, budget_category }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('reservation_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        // Validate that all referenced IDs belong to this trip
        if (day_id && !(0, dayService_1.getDay)(day_id, tripId))
            return { content: [{ type: 'text', text: 'day_id does not belong to this trip.' }], isError: true };
        if (place_id && !(0, assignmentService_1.placeExists)(place_id, tripId))
            return { content: [{ type: 'text', text: 'place_id does not belong to this trip.' }], isError: true };
        if (start_day_id && !(0, dayService_1.getDay)(start_day_id, tripId))
            return { content: [{ type: 'text', text: 'start_day_id does not belong to this trip.' }], isError: true };
        if (end_day_id && !(0, dayService_1.getDay)(end_day_id, tripId))
            return { content: [{ type: 'text', text: 'end_day_id does not belong to this trip.' }], isError: true };
        if (assignment_id && !(0, assignmentService_1.getAssignmentForTrip)(assignment_id, tripId))
            return { content: [{ type: 'text', text: 'assignment_id does not belong to this trip.' }], isError: true };
        const createAccommodation = (type === 'hotel' && place_id && start_day_id && end_day_id)
            ? { place_id, start_day_id, end_day_id, check_in: check_in || undefined, check_out: check_out || undefined, confirmation: confirmation_number || undefined }
            : undefined;
        const metadata = price != null ? { price: String(price) } : undefined;
        const { reservation, accommodationCreated } = (0, reservationService_1.createReservation)(tripId, {
            title, type, reservation_time, location, confirmation_number,
            notes, day_id, place_id, assignment_id,
            create_accommodation: createAccommodation,
            metadata,
        });
        if (accommodationCreated) {
            (0, _shared_1.safeBroadcast)(tripId, 'accommodation:created', {});
        }
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
    server.registerTool('update_reservation', {
        description: 'Update an existing reservation in a trip. Use status "confirmed" to confirm a pending recommendation, or "pending" to revert it. For flights, trains, cars, and cruises, use update_transport instead. Linking: hotel → use place_id to link to an accommodation place; restaurant/event/tour/activity/other → use assignment_id to link to a day assignment.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            reservationId: zod_1.z.number().int().positive(),
            title: zod_1.z.string().min(1).max(200).optional(),
            type: zod_1.z.enum(['hotel', 'restaurant', 'event', 'tour', 'activity', 'other']).optional().describe('Reservation type: "hotel", "restaurant", "event", "tour", "activity", or "other"'),
            reservation_time: zod_1.z.string().optional().describe('ISO 8601 datetime or time string'),
            location: zod_1.z.string().max(500).optional(),
            confirmation_number: zod_1.z.string().max(100).optional(),
            notes: zod_1.z.string().max(1000).optional(),
            status: zod_1.z.enum(['pending', 'confirmed', 'cancelled']).optional().describe('Reservation status: "pending", "confirmed", or "cancelled"'),
            place_id: zod_1.z.number().int().positive().nullable().optional().describe('Link to a place (use for hotel type), or null to unlink'),
            assignment_id: zod_1.z.number().int().positive().nullable().optional().describe('Link to a day assignment (use for restaurant, train, car, cruise, event, tour, activity, other), or null to unlink'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
    }, async ({ tripId, reservationId, title, type, reservation_time, location, confirmation_number, notes, status, place_id, assignment_id }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('reservation_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        const existing = (0, reservationService_1.getReservation)(reservationId, tripId);
        if (!existing)
            return { content: [{ type: 'text', text: 'Reservation not found.' }], isError: true };
        if (place_id != null && !(0, assignmentService_1.placeExists)(place_id, tripId))
            return { content: [{ type: 'text', text: 'place_id does not belong to this trip.' }], isError: true };
        if (assignment_id != null && !(0, assignmentService_1.getAssignmentForTrip)(assignment_id, tripId))
            return { content: [{ type: 'text', text: 'assignment_id does not belong to this trip.' }], isError: true };
        const { reservation } = (0, reservationService_1.updateReservation)(reservationId, tripId, {
            title, type, reservation_time, location, confirmation_number, notes, status,
            place_id: place_id !== undefined ? place_id ?? undefined : undefined,
            assignment_id: assignment_id !== undefined ? assignment_id ?? undefined : undefined,
        }, existing);
        (0, _shared_1.safeBroadcast)(tripId, 'reservation:updated', { reservation });
        return (0, _shared_1.ok)({ reservation });
    });
    server.registerTool('delete_reservation', {
        description: 'Delete a reservation from a trip.',
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
        const { deleted, accommodationDeleted } = (0, reservationService_1.deleteReservation)(reservationId, tripId);
        if (!deleted)
            return { content: [{ type: 'text', text: 'Reservation not found.' }], isError: true };
        if (accommodationDeleted) {
            (0, _shared_1.safeBroadcast)(tripId, 'accommodation:deleted', { accommodationId: deleted.accommodation_id });
        }
        (0, _shared_1.safeBroadcast)(tripId, 'reservation:deleted', { reservationId });
        return (0, _shared_1.ok)({ success: true });
    });
    server.registerTool('reorder_reservations', {
        description: 'Update the display order of reservations within a day.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            positions: zod_1.z.array(zod_1.z.object({
                id: zod_1.z.number().int().positive(),
                day_plan_position: zod_1.z.number().int().min(0),
            })).describe('Array of { id, day_plan_position } pairs'),
            dayId: zod_1.z.number().int().positive().optional().describe('Optionally scope the update to a specific day'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
    }, async ({ tripId, positions, dayId }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('reservation_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        (0, reservationService_1.updatePositions)(tripId, positions, dayId);
        (0, _shared_1.safeBroadcast)(tripId, 'reservation:positions', { positions, dayId });
        return (0, _shared_1.ok)({ success: true });
    });
    server.registerTool('link_hotel_accommodation', {
        description: 'Set or update the check-in/check-out day links for a hotel reservation. Creates or updates the accommodation record that ties the reservation to a place and a date range. Use the day IDs from get_trip_summary.',
        inputSchema: {
            tripId: zod_1.z.number().int().positive(),
            reservationId: zod_1.z.number().int().positive(),
            place_id: zod_1.z.number().int().positive().describe('The hotel place to link'),
            start_day_id: zod_1.z.number().int().positive().describe('Check-in day ID'),
            end_day_id: zod_1.z.number().int().positive().describe('Check-out day ID'),
            check_in: zod_1.z.string().max(10).optional().describe('Check-in time (e.g. "15:00")'),
            check_out: zod_1.z.string().max(10).optional().describe('Check-out time (e.g. "11:00")'),
        },
        annotations: _shared_1.TOOL_ANNOTATIONS_WRITE,
    }, async ({ tripId, reservationId, place_id, start_day_id, end_day_id, check_in, check_out }) => {
        if ((0, authService_1.isDemoUser)(userId))
            return (0, _shared_1.demoDenied)();
        if (!(0, database_1.canAccessTrip)(tripId, userId))
            return (0, _shared_1.noAccess)();
        if (!(0, _shared_1.hasTripPermission)('reservation_edit', tripId, userId))
            return (0, _shared_1.permissionDenied)();
        const current = (0, reservationService_1.getReservation)(reservationId, tripId);
        if (!current)
            return { content: [{ type: 'text', text: 'Reservation not found.' }], isError: true };
        if (current.type !== 'hotel')
            return { content: [{ type: 'text', text: 'Reservation is not of type hotel.' }], isError: true };
        if (!(0, assignmentService_1.placeExists)(place_id, tripId))
            return { content: [{ type: 'text', text: 'place_id does not belong to this trip.' }], isError: true };
        if (!(0, dayService_1.getDay)(start_day_id, tripId))
            return { content: [{ type: 'text', text: 'start_day_id does not belong to this trip.' }], isError: true };
        if (!(0, dayService_1.getDay)(end_day_id, tripId))
            return { content: [{ type: 'text', text: 'end_day_id does not belong to this trip.' }], isError: true };
        const isNewAccommodation = !current.accommodation_id;
        const { reservation } = (0, reservationService_1.updateReservation)(reservationId, tripId, {
            place_id,
            type: current.type,
            status: current.status,
            create_accommodation: { place_id, start_day_id, end_day_id, check_in: check_in || undefined, check_out: check_out || undefined },
        }, current);
        (0, _shared_1.safeBroadcast)(tripId, isNewAccommodation ? 'accommodation:created' : 'accommodation:updated', {});
        (0, _shared_1.safeBroadcast)(tripId, 'reservation:updated', { reservation });
        return (0, _shared_1.ok)({ reservation, accommodation_id: reservation?.accommodation_id ?? null });
    });
}
