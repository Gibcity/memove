"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const database_module_1 = require("./database/database.module");
const health_controller_1 = require("./health/health.controller");
const health_service_1 = require("./health/health.service");
const weather_module_1 = require("./weather/weather.module");
const airports_module_1 = require("./airports/airports.module");
const config_module_1 = require("./config/config.module");
const system_notices_module_1 = require("./system-notices/system-notices.module");
const maps_module_1 = require("./maps/maps.module");
const categories_module_1 = require("./categories/categories.module");
const tags_module_1 = require("./tags/tags.module");
const notifications_module_1 = require("./notifications/notifications.module");
const atlas_module_1 = require("./atlas/atlas.module");
const vacay_module_1 = require("./vacay/vacay.module");
const packing_module_1 = require("./packing/packing.module");
const budget_module_1 = require("./budget/budget.module");
const reservations_module_1 = require("./reservations/reservations.module");
const days_module_1 = require("./days/days.module");
const assignments_module_1 = require("./assignments/assignments.module");
const places_module_1 = require("./places/places.module");
const trips_module_1 = require("./trips/trips.module");
const todo_module_1 = require("./todo/todo.module");
const collab_module_1 = require("./collab/collab.module");
const files_module_1 = require("./files/files.module");
const photos_module_1 = require("./photos/photos.module");
const memories_module_1 = require("./memories/memories.module");
const airtrail_module_1 = require("./integrations/airtrail.module");
const journey_module_1 = require("./journey/journey.module");
const relocation_module_1 = require("./relocation/relocation.module");
const share_module_1 = require("./share/share.module");
const settings_module_1 = require("./settings/settings.module");
const backup_module_1 = require("./backup/backup.module");
const booking_import_module_1 = require("./booking-import/booking-import.module");
const auth_module_1 = require("./auth/auth.module");
const oidc_module_1 = require("./oidc/oidc.module");
const oauth_module_1 = require("./oauth/oauth.module");
const admin_module_1 = require("./admin/admin.module");
const addons_module_1 = require("./addons/addons.module");
const memove_exception_filter_1 = require("./common/memove-exception.filter");
const spa_fallback_filter_1 = require("./platform/spa-fallback.filter");
const idempotency_interceptor_1 = require("./common/idempotency.interceptor");
/**
 * Root NestJS module for the incremental migration. Domain modules
 * (weather, notifications, integrations, ...) get registered here as they are
 * migrated.
 */
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, weather_module_1.WeatherModule, airports_module_1.AirportsModule, config_module_1.ConfigModule, system_notices_module_1.SystemNoticesModule, maps_module_1.MapsModule, categories_module_1.CategoriesModule, tags_module_1.TagsModule, notifications_module_1.NotificationsModule, atlas_module_1.AtlasModule, vacay_module_1.VacayModule, packing_module_1.PackingModule, todo_module_1.TodoModule, budget_module_1.BudgetModule, reservations_module_1.ReservationsModule, days_module_1.DaysModule, assignments_module_1.AssignmentsModule, places_module_1.PlacesModule, trips_module_1.TripsModule, collab_module_1.CollabModule, files_module_1.FilesModule, photos_module_1.PhotosModule, memories_module_1.MemoriesModule, airtrail_module_1.AirtrailModule, journey_module_1.JourneyModule, relocation_module_1.RelocationModule, share_module_1.ShareModule, settings_module_1.SettingsModule, backup_module_1.BackupModule, auth_module_1.AuthModule, oidc_module_1.OidcModule, oauth_module_1.OauthModule, admin_module_1.AdminModule, addons_module_1.AddonsModule, booking_import_module_1.BookingImportModule],
        controllers: [health_controller_1.HealthController],
        providers: [
            health_service_1.HealthService,
            // Global error-envelope normaliser (DI-registered so it also catches
            // framework-level exceptions like the not-found handler).
            { provide: core_1.APP_FILTER, useClass: memove_exception_filter_1.MemoveExceptionFilter },
            // SPA fallback: serves index.html for unmatched GETs in production (the Nest
            // equivalent of the legacy Express app.get('*') catch-all). @Catch(NotFoundException)
            // is more specific than MemoveExceptionFilter, so Nest routes 404s here.
            { provide: core_1.APP_FILTER, useClass: spa_fallback_filter_1.SpaFallbackFilter },
            // Replays the X-Idempotency-Key the client sends on every write, matching
            // the legacy applyIdempotency middleware so retried mutations don't double-apply.
            { provide: core_1.APP_INTERCEPTOR, useClass: idempotency_interceptor_1.IdempotencyInterceptor },
        ],
    })
], AppModule);
