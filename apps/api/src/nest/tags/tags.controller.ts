import { Body, Controller, Delete, Get, HttpException, Param, Post, Put, UseGuards, UsePipes } from '@nestjs/common';
import { z } from 'zod';
import type { Tag, TagListResponse } from '@memove/shared';
import { createTagRequestSchema, updateTagRequestSchema } from '@memove/shared';
import type { User } from '../../types';
import { TagsService } from './tags.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

/**
 * /api/tags — per-user place-tag CRUD.
 *
 * Byte-identical to the legacy Express route (server/src/routes/tags.ts): every
 * endpoint requires auth and is scoped to the caller's own tags. Update/delete
 * verify ownership via getTagByIdAndUser and 404 otherwise. Status codes match
 * the Nest defaults the legacy route used (201 on create, 200 elsewhere); the
 * bespoke 400/404 bodies are reproduced exactly.
 */
@Controller('api/tags')
@UseGuards(JwtAuthGuard)
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list(@CurrentUser() user: User): TagListResponse {
    return { tags: this.tags.list(user.id) };
  }

  @Post()
  @UsePipes(new ZodValidationPipe(createTagRequestSchema))
  create(
    @CurrentUser() user: User,
    @Body() body: z.infer<typeof createTagRequestSchema>,
  ): { tag: Tag } {
    return { tag: this.tags.create(user.id, body.name, body.color) };
  }

  @Put(':id')
  @UsePipes(new ZodValidationPipe(updateTagRequestSchema))
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() body: z.infer<typeof updateTagRequestSchema>,
  ): { tag: Tag } {
    if (!this.tags.getByIdAndUser(id, user.id)) {
      throw new HttpException({ error: 'Tag not found' }, 404);
    }
    return { tag: this.tags.update(id, body.name, body.color) };
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string): { success: boolean } {
    if (!this.tags.getByIdAndUser(id, user.id)) {
      throw new HttpException({ error: 'Tag not found' }, 404);
    }
    this.tags.remove(id);
    return { success: true };
  }
}
