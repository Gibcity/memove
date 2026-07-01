import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpException,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { z } from 'zod';
import {
  budgetCreateItemRequestSchema,
  budgetCreateSettlementRequestSchema,
  budgetReorderCategoriesRequestSchema,
  budgetReorderItemsRequestSchema,
  budgetToggleMemberPaidRequestSchema,
  budgetUpdateItemRequestSchema,
  budgetUpdateMembersRequestSchema,
  budgetUpdatePayersRequestSchema,
  budgetUpdateSettlementRequestSchema,
} from '@memove/shared';
import type { User } from '../../types';
import { BudgetService } from './budget.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

/**
 * /api/trips/:tripId/budget — trip-scoped expense planner.
 *
 * Byte-identical to the legacy Express route (server/src/routes/budget.ts):
 * every handler verifies trip access (404); mutations check 'budget_edit' (403);
 * create is 201, the rest 200; bespoke 400/404 bodies reproduced; mutations
 * broadcast over WebSocket with the forwarded X-Socket-Id. Static sub-routes
 * (summary, settlement, reorder/*) are declared before /:id so they win over the
 * param. Updating total_price on a reservation-linked item syncs the price back.
 */
@Controller('api/trips/:tripId/budget')
@UseGuards(JwtAuthGuard)
export class BudgetController {
  constructor(private readonly budget: BudgetService) {}

  private requireTrip(tripId: string, user: User) {
    const trip = this.budget.verifyTripAccess(tripId, user.id);
    if (!trip) {
      throw new HttpException({ error: 'Trip not found' }, 404);
    }
    return trip;
  }

  private requireEdit(trip: ReturnType<BudgetService['verifyTripAccess']>, user: User): void {
    if (!this.budget.canEdit(trip!, user)) {
      throw new HttpException({ error: 'No permission' }, 403);
    }
  }

  @Get()
  list(@CurrentUser() user: User, @Param('tripId') tripId: string) {
    this.requireTrip(tripId, user);
    return { items: this.budget.list(tripId) };
  }

  @Get('summary/per-person')
  perPerson(@CurrentUser() user: User, @Param('tripId') tripId: string) {
    this.requireTrip(tripId, user);
    return { summary: this.budget.perPersonSummary(tripId) };
  }

  @Get('settlement')
  settlement(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Query('base') base?: string,
  ) {
    const trip = this.requireTrip(tripId, user);
    return this.budget.settlement(tripId, base, (trip as { currency?: string }).currency || 'EUR');
  }

  @Get('settlements')
  listSettlements(@CurrentUser() user: User, @Param('tripId') tripId: string) {
    this.requireTrip(tripId, user);
    return { settlements: this.budget.listSettlements(tripId) };
  }

  @Post('settlements')
  @UsePipes(new ZodValidationPipe(budgetCreateSettlementRequestSchema))
  createSettlement(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Body() body: z.infer<typeof budgetCreateSettlementRequestSchema>,
    @Headers('x-socket-id') socketId?: string,
  ) {
    const trip = this.requireTrip(tripId, user);
    this.requireEdit(trip, user);
    const settlement = this.budget.createSettlement(
      tripId,
      { from_user_id: body.from_user_id, to_user_id: body.to_user_id, amount: body.amount },
      user.id,
    );
    this.budget.broadcast(tripId, 'budget:settlement-created', { settlement }, socketId);
    return { settlement };
  }

  @Put('settlements/:settlementId')
  @UsePipes(new ZodValidationPipe(budgetUpdateSettlementRequestSchema))
  updateSettlement(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Param('settlementId') settlementId: string,
    @Body() body: z.infer<typeof budgetUpdateSettlementRequestSchema>,
    @Headers('x-socket-id') socketId?: string,
  ) {
    const trip = this.requireTrip(tripId, user);
    this.requireEdit(trip, user);
    const settlement = this.budget.updateSettlement(settlementId, tripId, {
      from_user_id: body.from_user_id,
      to_user_id: body.to_user_id,
      amount: body.amount,
    });
    if (!settlement) {
      throw new HttpException({ error: 'Settlement not found' }, 404);
    }
    this.budget.broadcast(tripId, 'budget:settlement-updated', { settlement }, socketId);
    return { settlement };
  }

  @Delete('settlements/:settlementId')
  deleteSettlement(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Param('settlementId') settlementId: string,
    @Headers('x-socket-id') socketId?: string,
  ) {
    const trip = this.requireTrip(tripId, user);
    this.requireEdit(trip, user);
    if (!this.budget.deleteSettlement(settlementId, tripId)) {
      throw new HttpException({ error: 'Settlement not found' }, 404);
    }
    this.budget.broadcast(tripId, 'budget:settlement-deleted', { settlementId: Number(settlementId) }, socketId);
    return { success: true };
  }

  @Post()
  @UsePipes(new ZodValidationPipe(budgetCreateItemRequestSchema))
  create(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Body() body: z.infer<typeof budgetCreateItemRequestSchema>,
    @Headers('x-socket-id') socketId?: string,
  ) {
    const trip = this.requireTrip(tripId, user);
    this.requireEdit(trip, user);
    const item = this.budget.create(tripId, body);
    this.budget.broadcast(tripId, 'budget:created', { item }, socketId);
    return { item };
  }

  @Put('reorder/items')
  @UsePipes(new ZodValidationPipe(budgetReorderItemsRequestSchema))
  reorderItems(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Body() body: z.infer<typeof budgetReorderItemsRequestSchema>,
    @Headers('x-socket-id') socketId?: string,
  ) {
    const trip = this.requireTrip(tripId, user);
    this.requireEdit(trip, user);
    this.budget.reorderItems(tripId, body.orderedIds);
    this.budget.broadcast(tripId, 'budget:reordered', { orderedIds: body.orderedIds }, socketId);
    return { success: true };
  }

  @Put('reorder/categories')
  @UsePipes(new ZodValidationPipe(budgetReorderCategoriesRequestSchema))
  reorderCategories(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Body() body: z.infer<typeof budgetReorderCategoriesRequestSchema>,
    @Headers('x-socket-id') socketId?: string,
  ) {
    const trip = this.requireTrip(tripId, user);
    this.requireEdit(trip, user);
    this.budget.reorderCategories(tripId, body.orderedCategories);
    this.budget.broadcast(tripId, 'budget:reordered', { orderedCategories: body.orderedCategories }, socketId);
    return { success: true };
  }

  @Put(':id')
  @UsePipes(new ZodValidationPipe(budgetUpdateItemRequestSchema))
  update(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
    @Body() body: z.infer<typeof budgetUpdateItemRequestSchema>,
    @Headers('x-socket-id') socketId?: string,
  ) {
    const trip = this.requireTrip(tripId, user);
    this.requireEdit(trip, user);
    const updated = this.budget.update(id, tripId, body);
    if (!updated) {
      throw new HttpException({ error: 'Budget item not found' }, 404);
    }
    if (updated.reservation_id && body.total_price !== undefined) {
      this.budget.syncReservationPrice(tripId, updated.reservation_id, updated.total_price, socketId);
    }
    this.budget.broadcast(tripId, 'budget:updated', { item: updated }, socketId);
    return { item: updated };
  }

  @Put(':id/members')
  @UsePipes(new ZodValidationPipe(budgetUpdateMembersRequestSchema))
  updateMembers(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
    @Body() body: z.infer<typeof budgetUpdateMembersRequestSchema>,
    @Headers('x-socket-id') socketId?: string,
  ) {
    const trip = this.requireTrip(tripId, user);
    this.requireEdit(trip, user);
    const result = this.budget.updateMembers(id, tripId, body.user_ids);
    if (!result) {
      throw new HttpException({ error: 'Budget item not found' }, 404);
    }
    this.budget.broadcast(tripId, 'budget:members-updated', { itemId: Number(id), members: result.members, persons: result.item.persons }, socketId);
    return { members: result.members, item: result.item };
  }

  @Put(':id/payers')
  @UsePipes(new ZodValidationPipe(budgetUpdatePayersRequestSchema))
  setPayers(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
    @Body() body: z.infer<typeof budgetUpdatePayersRequestSchema>,
    @Headers('x-socket-id') socketId?: string,
  ) {
    const trip = this.requireTrip(tripId, user);
    this.requireEdit(trip, user);
    const item = this.budget.setPayers(id, tripId, body.payers);
    if (!item) {
      throw new HttpException({ error: 'Budget item not found' }, 404);
    }
    this.budget.broadcast(tripId, 'budget:updated', { item }, socketId);
    return { item };
  }

  @Put(':id/members/:userId/paid')
  @UsePipes(new ZodValidationPipe(budgetToggleMemberPaidRequestSchema))
  toggleMemberPaid(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: z.infer<typeof budgetToggleMemberPaidRequestSchema>,
    @Headers('x-socket-id') socketId?: string,
  ) {
    const trip = this.requireTrip(tripId, user);
    this.requireEdit(trip, user);
    const member = this.budget.toggleMemberPaid(id, tripId, userId, body.paid);
    this.budget.broadcast(tripId, 'budget:member-paid-updated', { itemId: Number(id), userId: Number(userId), paid: body.paid ? 1 : 0 }, socketId);
    return { member };
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: User,
    @Param('tripId') tripId: string,
    @Param('id') id: string,
    @Headers('x-socket-id') socketId?: string,
  ) {
    const trip = this.requireTrip(tripId, user);
    this.requireEdit(trip, user);
    if (!this.budget.remove(id, tripId)) {
      throw new HttpException({ error: 'Budget item not found' }, 404);
    }
    this.budget.broadcast(tripId, 'budget:deleted', { itemId: Number(id) }, socketId);
    return { success: true };
  }
}
