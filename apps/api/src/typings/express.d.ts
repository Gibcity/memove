// Augments Express's `Request` with the fields memove middleware + Nest guards
// attach after authentication. Replaces the per-site casts
// (`(req as AuthRequest).user`, `getRequest<Request & { user?: User }>()`) with
// a single source of truth so downstream code can read `req.user` directly.

import type { User } from '../types';

declare module 'express-serve-static-core' {
  interface Request {
    /**
     * Set by `authenticate` middleware (Express) and `JwtAuthGuard` (Nest).
     * Present on every route mounted behind those guards. `null` is used by
     * `optionalAuthenticate` to signal "checked, but unauthenticated".
     */
    user?: User | null;
  }
}

// ponytail: `@types/express` re-declares `interface Request<P...>` extending
// core.Request. Augment core isn't enough — TS only walks `extends` chains
// for property resolution on the *exported* `Request`. Mirror on express too.
declare module 'express' {
  interface Request {
    user?: User | null;
  }
}
