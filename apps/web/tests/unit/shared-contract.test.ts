import { describe, it, expect } from 'vitest';
// Smoke test: proves the client toolchain (vite / vitest) resolves @memove/shared.
import { idParamSchema, paginationQuerySchema } from '@memove/shared';

describe('@memove/shared resolves in the client toolchain', () => {
  it('imports and uses a shared schema', () => {
    expect(idParamSchema.parse('7')).toBe(7);
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, perPage: 50 });
  });
});
