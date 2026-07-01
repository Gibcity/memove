import { Body, Controller, Delete, Get, HttpException, Param, Post, Put, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import type { Category, CategoryListResponse } from '@memove/shared';
import { createCategoryRequestSchema, updateCategoryRequestSchema } from '@memove/shared';
import type { User } from '../../types';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

/**
 * /api/categories — place-category palette CRUD.
 *
 * Byte-identical to the legacy Express route (server/src/routes/categories.ts):
 * listing is open to any authenticated user; create/update/delete require admin
 * (JwtAuthGuard + AdminGuard). Status codes match the Nest defaults the legacy
 * route also used (201 on create, 200 elsewhere), and the bespoke 400/404 bodies
 * are reproduced exactly.
 */
@Controller('api/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(): CategoryListResponse {
    return { categories: this.categories.list() };
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @UsePipes(new ZodValidationPipe(createCategoryRequestSchema))
  create(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof createCategoryRequestSchema>,
  ): { category: Category } {
    return { category: this.categories.create(user.id, body.name, body.color, body.icon) };
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @UsePipes(new ZodValidationPipe(updateCategoryRequestSchema))
  update(
    @Param('id') id: string,
    @Body() body: z.infer<typeof updateCategoryRequestSchema>,
  ): { category: Category } {
    if (!this.categories.getById(id)) {
      throw new HttpException({ error: 'Category not found' }, 404);
    }
    return { category: this.categories.update(id, body.name, body.color, body.icon) };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  remove(@Param('id') id: string): { success: boolean } {
    if (!this.categories.getById(id)) {
      throw new HttpException({ error: 'Category not found' }, 404);
    }
    this.categories.remove(id);
    return { success: true };
  }
}
