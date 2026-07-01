import { ArgumentMetadata, HttpException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Validates an incoming @Body()/@Query() against a Zod schema (from @memove/shared)
 * and returns the parsed, typed value. On failure it throws memove's error envelope
 * `{ error: string }` with status 400 — the same shape the legacy routes produce,
 * so the client's error handling is unaffected.
 *
 * Usage: `@Body(new ZodValidationPipe(someSchema)) dto: Dto`.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    // @UsePipes applies this pipe to every parameter on the handler. For
    // handlers that take both @CurrentUser() and @Body(), that means the
    // pipe runs on the user object first and (silently) fails with
    // "expected string, received undefined" before it ever sees the body.
    // Only validate body / query payloads; pass everything else through.
    if (metadata?.type !== 'body' && metadata?.type !== 'query') return value;
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
        .join('; ');
      throw new HttpException({ error: message }, 400);
    }
    return result.data;
  }
}
