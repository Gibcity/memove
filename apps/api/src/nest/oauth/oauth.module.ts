import { Module } from '@nestjs/common';
import { OauthPublicController } from './oauth-public.controller';
import { OauthApiController } from './oauth-api.controller';
import { OauthService } from './oauth.service';
import { RateLimitService } from '../auth/rate-limit.service';

/**
 * OAuth 2.1 server (MCP). Public token/userinfo/revoke endpoints + the SPA's
 * authenticated consent/client/session management. /oauth/authorize,
 * /oauth/register and /oauth/consent are SDK-mounted routes on the underlying
 * Express instance of the NestJS app (see bootstrap.ts / applyPlatformTransport);
 * the strangler that once listed /oauth/token etc. separately is gone.
 */
@Module({
  controllers: [OauthPublicController, OauthApiController],
  providers: [OauthService, RateLimitService],
})
export class OauthModule {}
