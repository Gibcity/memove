"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildApp = buildApp;
const core_1 = require("@nestjs/core");
const platform_express_1 = require("@nestjs/platform-express");
const app_module_1 = require("./nest/app.module");
const globalMiddleware_1 = require("./middleware/globalMiddleware");
const platform_routes_1 = require("./nest/platform/platform.routes");
/**
 * Builds the unified memove NestJS application that serves the ENTIRE surface — the
 * former Express app is gone. One builder is shared by the production bootstrap
 * (index.ts) and the integration-test harness so the two can never drift.
 *
 * Composition order is load-bearing. Everything except the SPA index.html fallback
 * is registered on the underlying Express instance BEFORE `app.init()`, because
 * Nest's router terminates an unmatched request by throwing NotFoundException — it
 * does NOT fall through to a route registered after init, so a post-init Express
 * route is unreachable. The platform routes are all specific paths (/uploads/*,
 * /api/health, /mcp, /.well-known/*, /oauth/{authorize,register,consent}) so they
 * match their own requests and `next()` everything else through to the Nest
 * controllers registered during init.
 *
 *   1. applyGlobalMiddleware — helmet/CSP, CORS, HSTS, forced-HTTPS, the global MFA
 *      policy, request logging + cookie-parser. `bodyParser: false` so Nest does its
 *      own parsing and the raw /mcp body reaches the MCP handler unparsed.
 *   2. applyPlatformUploads — the static + guarded /uploads/* routes.
 *   3. applyPlatformTransport — /api/health, the OAuth/MCP SDK + /.well-known
 *      metadata, the /mcp routes, the /oauth/consent COOP header.
 *   4. applyPlatformStatic — the production built-client static assets (so a real
 *      asset request returns the file before the Nest router 404s it).
 *   5. app.init() — registers every migrated /api domain (the Nest controllers).
 *
 * The SPA index.html fallback (unmatched GET → index.html in production) is the
 * SpaFallbackFilter (APP_FILTER in AppModule); the global error envelope is the
 * MemoveExceptionFilter (also APP_FILTER).
 */
async function buildApp() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_express_1.ExpressAdapter());
    const instance = app.getHttpAdapter().getInstance();
    (0, globalMiddleware_1.applyGlobalMiddleware)(instance, { bodyParser: false });
    (0, platform_routes_1.applyPlatformUploads)(instance);
    (0, platform_routes_1.applyPlatformTransport)(instance);
    (0, platform_routes_1.applyPlatformStatic)(instance);
    await app.init();
    return app;
}
