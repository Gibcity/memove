import { a as getLocaleForLanguage, i as getIntlLanguage, n as SUPPORTED_LANGUAGE_CODES, o as isRtlLanguage, r as SupportedLanguageCode, t as SUPPORTED_LANGUAGES } from "./languages-4qeXgpJ0.mjs";
import { z } from "zod";

//#region src/common/primitives.schema.d.ts
/**
 * Primitive, domain-agnostic building blocks shared by every contract.
 * Domain schemas (trips, places, ...) live in their own folders and reuse these.
 */
/** memove uses auto-increment integer primary keys. */
declare const idSchema: z.ZodNumber;
type Id = z.infer<typeof idSchema>;
/**
 * Numeric id coming from a URL param / query string. Express hands these over
 * as strings, so we coerce, then enforce a positive integer.
 */
declare const idParamSchema: z.ZodCoercedNumber<unknown>;
/** Non-empty, trimmed string. */
declare const nonEmptyString: z.ZodString;
/** ISO-8601 timestamp string (the shape memove serialises dates as in JSON). */
declare const isoDateTime: z.ZodString;
//#endregion
//#region src/common/pagination.schema.d.ts
/**
 * Generic pagination query helper. Individual endpoints opt in by extending
 * this; it is NOT applied globally (many memove list endpoints return full sets).
 * Defaults are conservative and only used where a route already paginates.
 */
declare const paginationQuerySchema: z.ZodObject<{
  page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
  perPage: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
type PaginationQuery = z.infer<typeof paginationQuerySchema>;
//#endregion
//#region src/weather/weather.schema.d.ts
/**
 * Weather API contract — single source of truth for the /api/weather endpoints.
 *
 * The legacy Express routes treat lat/lng as opaque strings (they are parsed with
 * parseFloat inside the service) and only check for presence, so the query schemas
 * mirror that: non-empty strings, not coerced numbers. `lang` defaults to 'de',
 * matching the Express default.
 *
 * The bespoke "X is required" 400 messages are reproduced in the controller, not
 * derived from these schemas, so the error body stays byte-identical to Express.
 */
declare const weatherQuerySchema: z.ZodObject<{
  lat: z.ZodString;
  lng: z.ZodString;
  date: z.ZodOptional<z.ZodString>;
  lang: z.ZodDefault<z.ZodString>;
}, z.core.$strip>;
type WeatherQuery = z.infer<typeof weatherQuerySchema>;
/** Detailed weather requires a date (the Express route 400s without it). */
declare const detailedWeatherQuerySchema: z.ZodObject<{
  lat: z.ZodString;
  lng: z.ZodString;
  lang: z.ZodDefault<z.ZodString>;
  date: z.ZodString;
}, z.core.$strip>;
type DetailedWeatherQuery = z.infer<typeof detailedWeatherQuerySchema>;
declare const hourlyEntrySchema: z.ZodObject<{
  hour: z.ZodNumber;
  temp: z.ZodNumber;
  precipitation: z.ZodNumber;
  precipitation_probability: z.ZodNumber;
  main: z.ZodString;
  wind: z.ZodNumber;
  humidity: z.ZodNumber;
}, z.core.$strip>;
type HourlyEntry = z.infer<typeof hourlyEntrySchema>;
/**
 * Weather response DTO. Fields are optional because the Express service emits
 * different subsets depending on the request type (current / forecast / climate /
 * detailed) and on error (`{ ..., error: 'no_forecast' }`).
 */
declare const weatherResultSchema: z.ZodObject<{
  temp: z.ZodNumber;
  temp_max: z.ZodOptional<z.ZodNumber>;
  temp_min: z.ZodOptional<z.ZodNumber>;
  main: z.ZodString;
  description: z.ZodString;
  type: z.ZodString;
  sunrise: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  sunset: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  precipitation_sum: z.ZodOptional<z.ZodNumber>;
  precipitation_probability_max: z.ZodOptional<z.ZodNumber>;
  wind_max: z.ZodOptional<z.ZodNumber>;
  hourly: z.ZodOptional<z.ZodArray<z.ZodObject<{
    hour: z.ZodNumber;
    temp: z.ZodNumber;
    precipitation: z.ZodNumber;
    precipitation_probability: z.ZodNumber;
    main: z.ZodString;
    wind: z.ZodNumber;
    humidity: z.ZodNumber;
  }, z.core.$strip>>>;
  error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type WeatherResult = z.infer<typeof weatherResultSchema>;
//#endregion
//#region src/airport/airport.schema.d.ts
/**
 * Airport API contract — single source of truth for the /api/airports endpoints.
 *
 * The legacy Express route (server/src/routes/airports.ts) exposes a typeahead
 * search and a single-airport lookup by IATA code, both backed by an in-memory
 * dataset (server/src/services/airportService.ts). The route treats the query as
 * an opaque string and returns an empty array when it is absent, so the search
 * query mirrors that: an optional string, no coercion.
 *
 * The bespoke 404 `{ error: 'Airport not found' }` body is reproduced in the
 * controller, not derived from this schema, so the response stays byte-identical
 * to Express.
 */
/** A single airport record as served by the dataset (matches Airport in airportService). */
declare const airportSchema: z.ZodObject<{
  iata: z.ZodString;
  icao: z.ZodNullable<z.ZodString>;
  name: z.ZodString;
  city: z.ZodString;
  country: z.ZodString;
  lat: z.ZodNumber;
  lng: z.ZodNumber;
  tz: z.ZodString;
}, z.core.$strip>;
type Airport = z.infer<typeof airportSchema>;
/**
 * Search query. `q` is optional — the route answers with `[]` when it is missing
 * or empty rather than 400ing, so presence is handled in the controller.
 */
declare const airportSearchQuerySchema: z.ZodObject<{
  q: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type AirportSearchQuery = z.infer<typeof airportSearchQuerySchema>;
//#endregion
//#region src/config/config.schema.d.ts
/**
 * Public config contract — the unauthenticated /api/config endpoint.
 *
 * This is the only public (non-authenticated) endpoint in the L2 bundle: the
 * login page reads it before a user signs in to pick the initial language. The
 * legacy route (server/src/routes/publicConfig.ts) returns just the server's
 * configured default language, so the response is intentionally minimal.
 */
declare const publicConfigSchema: z.ZodObject<{
  defaultLanguage: z.ZodString;
}, z.core.$strip>;
type PublicConfig = z.infer<typeof publicConfigSchema>;
//#endregion
//#region src/system-notice/system-notice.schema.d.ts
/**
 * System-notice API contract — the /api/system-notices endpoints.
 *
 * Notices are server-side announcements (release notes, onboarding hints, ...)
 * defined in a static registry. The server evaluates each notice's conditions
 * for the current user and returns only the active, non-dismissed ones, sorted
 * by priority/severity/date. The DTO sent to the client is the notice minus the
 * server-only fields (conditions, publishedAt, version bounds, priority) — see
 * SystemNoticeDTO in server/src/systemNotices/types.ts, which this mirrors.
 *
 * The bespoke 404 `{ error: 'NOTICE_NOT_FOUND' }` body and the 204 dismiss
 * response are reproduced in the controller, not derived from this schema.
 */
declare const noticeDisplaySchema: z.ZodEnum<{
  modal: "modal";
  banner: "banner";
  toast: "toast";
}>;
declare const noticeSeveritySchema: z.ZodEnum<{
  info: "info";
  warn: "warn";
  critical: "critical";
}>;
/** The client-facing notice (server-evaluated; conditions/versioning stripped). */
declare const systemNoticeDtoSchema: z.ZodObject<{
  id: z.ZodString;
  display: z.ZodEnum<{
    modal: "modal";
    banner: "banner";
    toast: "toast";
  }>;
  severity: z.ZodEnum<{
    info: "info";
    warn: "warn";
    critical: "critical";
  }>;
  titleKey: z.ZodString;
  bodyKey: z.ZodString;
  bodyParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
  icon: z.ZodOptional<z.ZodString>;
  media: z.ZodOptional<z.ZodObject<{
    src: z.ZodString;
    srcDark: z.ZodOptional<z.ZodString>;
    altKey: z.ZodString;
    placement: z.ZodOptional<z.ZodEnum<{
      hero: "hero";
      inline: "inline";
    }>>;
    aspectRatio: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
  highlights: z.ZodOptional<z.ZodArray<z.ZodObject<{
    labelKey: z.ZodString;
    iconName: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>>;
  cta: z.ZodOptional<z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"nav">;
    labelKey: z.ZodString;
    href: z.ZodString;
  }, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"action">;
    labelKey: z.ZodString;
    actionId: z.ZodString;
    dismissOnAction: z.ZodOptional<z.ZodBoolean>;
  }, z.core.$strip>], "kind">>;
  dismissible: z.ZodBoolean;
}, z.core.$strip>;
type SystemNoticeDto = z.infer<typeof systemNoticeDtoSchema>;
//#endregion
//#region src/maps/maps.schema.d.ts
declare const mapsSearchRequestSchema: z.ZodObject<{
  query: z.ZodString;
}, z.core.$strip>;
type MapsSearchRequest = z.infer<typeof mapsSearchRequestSchema>;
declare const mapsAutocompleteRequestSchema: z.ZodObject<{
  input: z.ZodString;
  lang: z.ZodOptional<z.ZodString>;
  locationBias: z.ZodOptional<z.ZodObject<{
    low: z.ZodObject<{
      lat: z.ZodNumber;
      lng: z.ZodNumber;
    }, z.core.$strip>;
    high: z.ZodObject<{
      lat: z.ZodNumber;
      lng: z.ZodNumber;
    }, z.core.$strip>;
  }, z.core.$strip>>;
}, z.core.$strip>;
type MapsAutocompleteRequest = z.infer<typeof mapsAutocompleteRequestSchema>;
declare const mapsReverseQuerySchema: z.ZodObject<{
  lat: z.ZodString;
  lng: z.ZodString;
  lang: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type MapsReverseQuery = z.infer<typeof mapsReverseQuerySchema>;
declare const mapsResolveUrlRequestSchema: z.ZodObject<{
  url: z.ZodString;
}, z.core.$strip>;
type MapsResolveUrlRequest = z.infer<typeof mapsResolveUrlRequestSchema>;
declare const mapsSearchResultSchema: z.ZodObject<{
  places: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  source: z.ZodString;
}, z.core.$strip>;
type MapsSearchResult = z.infer<typeof mapsSearchResultSchema>;
declare const mapsAutocompleteSuggestionSchema: z.ZodObject<{
  placeId: z.ZodString;
  mainText: z.ZodString;
  secondaryText: z.ZodString;
}, z.core.$strip>;
declare const mapsAutocompleteResultSchema: z.ZodObject<{
  suggestions: z.ZodArray<z.ZodObject<{
    placeId: z.ZodString;
    mainText: z.ZodString;
    secondaryText: z.ZodString;
  }, z.core.$strip>>;
  source: z.ZodString;
}, z.core.$strip>;
type MapsAutocompleteResult = z.infer<typeof mapsAutocompleteResultSchema>;
declare const mapsPlaceDetailsResultSchema: z.ZodObject<{
  place: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  disabled: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
type MapsPlaceDetailsResult = z.infer<typeof mapsPlaceDetailsResultSchema>;
declare const mapsPlacePhotoResultSchema: z.ZodObject<{
  photoUrl: z.ZodNullable<z.ZodString>;
  attribution: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type MapsPlacePhotoResult = z.infer<typeof mapsPlacePhotoResultSchema>;
declare const mapsReverseResultSchema: z.ZodObject<{
  name: z.ZodNullable<z.ZodString>;
  address: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
type MapsReverseResult = z.infer<typeof mapsReverseResultSchema>;
declare const mapsResolveUrlResultSchema: z.ZodObject<{
  lat: z.ZodNumber;
  lng: z.ZodNumber;
  name: z.ZodNullable<z.ZodString>;
  address: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
type MapsResolveUrlResult = z.infer<typeof mapsResolveUrlResultSchema>;
//#endregion
//#region src/category/category.schema.d.ts
/**
 * Category API contract — single source of truth for the /api/categories endpoints.
 *
 * Categories are the place-category palette (also the admin "Personalization"
 * surface). Reading is open to any authenticated user; create/update/delete are
 * admin-only. The legacy route (server/src/routes/categories.ts) wraps
 * services/categoryService.ts 1:1.
 *
 * The bespoke 400 ("Category name is required") and 404 ("Category not found")
 * messages are reproduced in the controller so the bodies stay byte-identical.
 */
declare const categorySchema: z.ZodObject<{
  id: z.ZodNumber;
  name: z.ZodString;
  color: z.ZodString;
  icon: z.ZodString;
  user_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  created_at: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type Category = z.infer<typeof categorySchema>;
declare const createCategoryRequestSchema: z.ZodObject<{
  name: z.ZodString;
  color: z.ZodOptional<z.ZodString>;
  icon: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;
/** All fields optional — the service COALESCEs each against the stored value. */
declare const updateCategoryRequestSchema: z.ZodObject<{
  name: z.ZodOptional<z.ZodString>;
  color: z.ZodOptional<z.ZodString>;
  icon: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;
declare const categoryListResponseSchema: z.ZodObject<{
  categories: z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    color: z.ZodString;
    icon: z.ZodString;
    user_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    created_at: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
}, z.core.$strip>;
type CategoryListResponse = z.infer<typeof categoryListResponseSchema>;
//#endregion
//#region src/tag/tag.schema.d.ts
/**
 * Tag API contract — single source of truth for the /api/tags endpoints.
 *
 * Tags are per-user place labels (used for filtering). Unlike categories they
 * are NOT admin-gated: every endpoint is scoped to the authenticated user's own
 * tags. The legacy route (server/src/routes/tags.ts) wraps services/tagService.ts
 * 1:1; update/delete first verify ownership via getTagByIdAndUser, 404ing
 * otherwise.
 *
 * The bespoke 400 ("Tag name is required") and 404 ("Tag not found") messages are
 * reproduced in the controller so the bodies stay byte-identical.
 */
declare const tagSchema: z.ZodObject<{
  id: z.ZodNumber;
  user_id: z.ZodNumber;
  name: z.ZodString;
  color: z.ZodString;
  created_at: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type Tag = z.infer<typeof tagSchema>;
declare const createTagRequestSchema: z.ZodObject<{
  name: z.ZodString;
  color: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type CreateTagRequest = z.infer<typeof createTagRequestSchema>;
/** Both fields optional — the service COALESCEs each against the stored value. */
declare const updateTagRequestSchema: z.ZodObject<{
  name: z.ZodOptional<z.ZodString>;
  color: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type UpdateTagRequest = z.infer<typeof updateTagRequestSchema>;
declare const tagListResponseSchema: z.ZodObject<{
  tags: z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    user_id: z.ZodNumber;
    name: z.ZodString;
    color: z.ZodString;
    created_at: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
}, z.core.$strip>;
type TagListResponse = z.infer<typeof tagListResponseSchema>;
//#endregion
//#region src/notification/notification.schema.d.ts
/**
 * Notification API contract — single source of truth for the /api/notifications
 * endpoints (channel-preference matrix, channel test pings, and in-app
 * notifications).
 *
 * The notification row and the preferences matrix are wide, DB- and
 * registry-derived shapes; the response schemas keep them as open records and
 * pin the stable envelope fields, while the request schemas and the bespoke
 * 400/403/404 controller messages capture the parts the client depends on.
 * Real-time delivery happens over the existing WebSocket path inside the
 * services and is untouched by this contract.
 */
/** Channel preference matrix update: { eventType: { channel: enabled } }. */
declare const preferencesUpdateRequestSchema: z.ZodRecord<z.ZodString, z.ZodRecord<z.ZodString, z.ZodBoolean>>;
type PreferencesUpdateRequest = z.infer<typeof preferencesUpdateRequestSchema>;
declare const testSmtpRequestSchema: z.ZodObject<{
  email: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
declare const testWebhookRequestSchema: z.ZodObject<{
  url: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
declare const testNtfyRequestSchema: z.ZodObject<{
  topic: z.ZodOptional<z.ZodString>;
  server: z.ZodOptional<z.ZodString>;
  token: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
/** Result of a channel test ping. */
declare const channelTestResultSchema: z.ZodObject<{
  success: z.ZodBoolean;
  error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type ChannelTestResult = z.infer<typeof channelTestResultSchema>;
/** Respond to a boolean (yes/no) notification. */
declare const notificationRespondRequestSchema: z.ZodObject<{
  response: z.ZodEnum<{
    positive: "positive";
    negative: "negative";
  }>;
}, z.core.$strip>;
type NotificationRespondRequest = z.infer<typeof notificationRespondRequestSchema>;
/** A single in-app notification row (DB-shaped; kept open). */
declare const notificationRowSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
declare const inAppListResultSchema: z.ZodObject<{
  notifications: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  total: z.ZodNumber;
  unread_count: z.ZodNumber;
}, z.core.$strip>;
type InAppListResult = z.infer<typeof inAppListResultSchema>;
declare const unreadCountResultSchema: z.ZodObject<{
  count: z.ZodNumber;
}, z.core.$strip>;
type UnreadCountResult = z.infer<typeof unreadCountResultSchema>;
//#endregion
//#region src/atlas/atlas.schema.d.ts
declare const markRegionRequestSchema: z.ZodObject<{
  name: z.ZodString;
  country_code: z.ZodString;
}, z.core.$strip>;
type MarkRegionRequest = z.infer<typeof markRegionRequestSchema>;
declare const createBucketItemRequestSchema: z.ZodObject<{
  name: z.ZodString;
  lat: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  lng: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  country_code: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  target_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type CreateBucketItemRequest = z.infer<typeof createBucketItemRequestSchema>;
declare const updateBucketItemRequestSchema: z.ZodObject<{
  name: z.ZodOptional<z.ZodString>;
  notes: z.ZodOptional<z.ZodString>;
  lat: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  lng: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  country_code: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  target_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type UpdateBucketItemRequest = z.infer<typeof updateBucketItemRequestSchema>;
/** A bucket-list item row (DB-shaped; kept open). */
declare const bucketItemSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
declare const bucketListResponseSchema: z.ZodObject<{
  items: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
type BucketListResponse = z.infer<typeof bucketListResponseSchema>;
/** GeoJSON FeatureCollection (kept open — provider-derived geometry). */
declare const regionGeoSchema: z.ZodObject<{
  type: z.ZodLiteral<"FeatureCollection">;
  features: z.ZodArray<z.ZodUnknown>;
}, z.core.$strip>;
type RegionGeo = z.infer<typeof regionGeoSchema>;
/**
 * ISO 3166-1 alpha-2 country code → continent. Single source of truth for the
 * Atlas continent breakdown, used by the server (stats aggregation) and the
 * client (keeping the per-continent counts in sync on optimistic mark/unmark).
 */
declare const CONTINENT_MAP: Record<string, string>;
/** Continent for an ISO alpha-2 country code; 'Other' when unknown. */
declare function continentForCountry(code: string | null | undefined): string;
//#endregion
//#region src/vacay/vacay.schema.d.ts
declare const vacayAddHolidayCalendarRequestSchema: z.ZodObject<{
  region: z.ZodString;
  label: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  color: z.ZodOptional<z.ZodString>;
  sort_order: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type VacayAddHolidayCalendarRequest = z.infer<typeof vacayAddHolidayCalendarRequestSchema>;
declare const vacaySetColorRequestSchema: z.ZodObject<{
  color: z.ZodOptional<z.ZodString>;
  target_user_id: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
}, z.core.$strip>;
type VacaySetColorRequest = z.infer<typeof vacaySetColorRequestSchema>;
declare const vacayInviteRequestSchema: z.ZodObject<{
  user_id: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
}, z.core.$strip>;
type VacayInviteRequest = z.infer<typeof vacayInviteRequestSchema>;
declare const vacayInviteActionRequestSchema: z.ZodObject<{
  plan_id: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type VacayInviteActionRequest = z.infer<typeof vacayInviteActionRequestSchema>;
declare const vacayAddYearRequestSchema: z.ZodObject<{
  year: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
}, z.core.$strip>;
type VacayAddYearRequest = z.infer<typeof vacayAddYearRequestSchema>;
declare const vacayToggleEntryRequestSchema: z.ZodObject<{
  date: z.ZodString;
  target_user_id: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
}, z.core.$strip>;
type VacayToggleEntryRequest = z.infer<typeof vacayToggleEntryRequestSchema>;
declare const vacayCompanyHolidayRequestSchema: z.ZodObject<{
  date: z.ZodString;
  note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type VacayCompanyHolidayRequest = z.infer<typeof vacayCompanyHolidayRequestSchema>;
declare const vacayUpdateStatsRequestSchema: z.ZodObject<{
  vacation_days: z.ZodOptional<z.ZodNumber>;
  target_user_id: z.ZodOptional<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>;
}, z.core.$strip>;
type VacayUpdateStatsRequest = z.infer<typeof vacayUpdateStatsRequestSchema>;
/** Plan / entries / stats payloads are wide and DB-derived; kept open. */
declare const vacayPlanDataSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
type VacayPlanData = z.infer<typeof vacayPlanDataSchema>;
//#endregion
//#region src/packing/packing.schema.d.ts
/**
 * Packing item entity as returned by the packing endpoints
 * (server/src/services/packingService.ts -> SELECT * FROM packing_items).
 * `checked` is the raw SQLite INTEGER (0/1). Columns match the packing_items
 * table (see server DB): weight_grams/bag_id are nullable, quantity defaults 1.
 */
declare const packingItemSchema: z.ZodObject<{
  id: z.ZodNumber;
  trip_id: z.ZodNumber;
  name: z.ZodString;
  checked: z.ZodNumber;
  category: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  sort_order: z.ZodNumber;
  weight_grams: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  bag_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  quantity: z.ZodOptional<z.ZodNumber>;
  created_at: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type PackingItem = z.infer<typeof packingItemSchema>;
/**
 * Packing bag member embedded on a bag (server packingService -> listBags).
 * `avatar` is the resolved avatar URL.
 */
declare const packingBagMemberSchema: z.ZodObject<{
  user_id: z.ZodNumber;
  username: z.ZodString;
  avatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type PackingBagMember = z.infer<typeof packingBagMemberSchema>;
/**
 * Packing bag entity (server packingService -> listBags). Columns of the
 * packing_bags table plus the embedded `members` array (and the optional
 * `assigned_username` join present on updateBag).
 */
declare const packingBagSchema: z.ZodObject<{
  id: z.ZodNumber;
  trip_id: z.ZodNumber;
  name: z.ZodString;
  color: z.ZodString;
  weight_limit_grams: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  sort_order: z.ZodNumber;
  user_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  assigned_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  created_at: z.ZodOptional<z.ZodString>;
  members: z.ZodOptional<z.ZodArray<z.ZodObject<{
    user_id: z.ZodNumber;
    username: z.ZodString;
    avatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  }, z.core.$strip>>>;
}, z.core.$strip>;
type PackingBag = z.infer<typeof packingBagSchema>;
declare const packingCreateItemRequestSchema: z.ZodObject<{
  name: z.ZodString;
  category: z.ZodOptional<z.ZodString>;
  checked: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
type PackingCreateItemRequest = z.infer<typeof packingCreateItemRequestSchema>;
declare const packingUpdateItemRequestSchema: z.ZodObject<{
  name: z.ZodOptional<z.ZodString>;
  checked: z.ZodOptional<z.ZodBoolean>;
  category: z.ZodOptional<z.ZodString>;
  weight_grams: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  bag_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  quantity: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type PackingUpdateItemRequest = z.infer<typeof packingUpdateItemRequestSchema>;
declare const packingImportRequestSchema: z.ZodObject<{
  items: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
type PackingImportRequest = z.infer<typeof packingImportRequestSchema>;
declare const packingReorderRequestSchema: z.ZodObject<{
  orderedIds: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
type PackingReorderRequest = z.infer<typeof packingReorderRequestSchema>;
declare const packingCreateBagRequestSchema: z.ZodObject<{
  name: z.ZodString;
  color: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type PackingCreateBagRequest = z.infer<typeof packingCreateBagRequestSchema>;
declare const packingUpdateBagRequestSchema: z.ZodObject<{
  name: z.ZodOptional<z.ZodString>;
  color: z.ZodOptional<z.ZodString>;
  weight_limit_grams: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  user_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, z.core.$strip>;
type PackingUpdateBagRequest = z.infer<typeof packingUpdateBagRequestSchema>;
declare const packingBagMembersRequestSchema: z.ZodObject<{
  user_ids: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
type PackingBagMembersRequest = z.infer<typeof packingBagMembersRequestSchema>;
declare const packingSaveTemplateRequestSchema: z.ZodObject<{
  name: z.ZodString;
}, z.core.$strip>;
type PackingSaveTemplateRequest = z.infer<typeof packingSaveTemplateRequestSchema>;
declare const packingTemplateSummarySchema: z.ZodObject<{
  id: z.ZodNumber;
  name: z.ZodString;
  item_count: z.ZodNumber;
}, z.core.$strip>;
type PackingTemplateSummary = z.infer<typeof packingTemplateSummarySchema>;
declare const packingTemplatesResponseSchema: z.ZodObject<{
  templates: z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    item_count: z.ZodNumber;
  }, z.core.$strip>>;
}, z.core.$strip>;
type PackingTemplatesResponse = z.infer<typeof packingTemplatesResponseSchema>;
declare const packingCategoryAssigneesRequestSchema: z.ZodObject<{
  user_ids: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
type PackingCategoryAssigneesRequest = z.infer<typeof packingCategoryAssigneesRequestSchema>;
//#endregion
//#region src/todo/todo.schema.d.ts
/**
 * To-do API contract — single source of truth for the /api/trips/:tripId/todo
 * endpoints (trip task list with categories + assignees).
 *
 * Trip-scoped like packing: every endpoint verifies trip access (404 "Trip not
 * found") and mutations check the same 'packing_edit' permission the legacy route
 * uses (403 "No permission"). Rows are DB-shaped and kept open. Mutations
 * broadcast over WebSocket with the forwarded X-Socket-Id.
 */
declare const todoCreateItemRequestSchema: z.ZodObject<{
  name: z.ZodString;
  category: z.ZodOptional<z.ZodString>;
  due_date: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  assigned_user_id: z.ZodOptional<z.ZodNumber>;
  priority: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type TodoCreateItemRequest = z.infer<typeof todoCreateItemRequestSchema>;
declare const todoUpdateItemRequestSchema: z.ZodObject<{
  name: z.ZodOptional<z.ZodString>;
  checked: z.ZodOptional<z.ZodBoolean>;
  category: z.ZodOptional<z.ZodString>;
  due_date: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
  assigned_user_id: z.ZodOptional<z.ZodNumber>;
  priority: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type TodoUpdateItemRequest = z.infer<typeof todoUpdateItemRequestSchema>;
declare const todoReorderRequestSchema: z.ZodObject<{
  orderedIds: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
type TodoReorderRequest = z.infer<typeof todoReorderRequestSchema>;
declare const todoCategoryAssigneesRequestSchema: z.ZodObject<{
  user_ids: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
type TodoCategoryAssigneesRequest = z.infer<typeof todoCategoryAssigneesRequestSchema>;
//#endregion
//#region src/budget/budget.schema.d.ts
/**
 * Budget API contract — single source of truth for the /api/trips/:tripId/budget
 * endpoints (expense items, per-member splits, paid toggles, settlement).
 *
 * Trip-scoped: every endpoint verifies trip access (404 "Trip not found") and
 * mutations check the 'budget_edit' permission (403 "No permission"). The legacy
 * route (server/src/routes/budget.ts) wraps services/budgetService.ts; rows are
 * DB-shaped and kept open. Mutations broadcast over WebSocket with the forwarded
 * X-Socket-Id. Updating a linked item's total_price also syncs the price into the
 * linked reservation's metadata (and broadcasts reservation:updated).
 */
/**
 * Budget item member as embedded on a budget item
 * (server/src/services/budgetService.ts -> loadItemMembers). `paid` is the raw
 * SQLite INTEGER (0/1); `avatar_url` is the resolved avatar (avatarUrl()).
 */
declare const budgetItemMemberSchema: z.ZodObject<{
  user_id: z.ZodNumber;
  paid: z.ZodNumber;
  username: z.ZodString;
  avatar_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  avatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  budget_item_id: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type BudgetItemMember = z.infer<typeof budgetItemMemberSchema>;
/**
 * The fixed "Costs" expense categories. Unlike the old budget, users cannot
 * create their own categories — every expense maps to one of these keys. The
 * label/icon/colour per key live in the client; the server only stores the key.
 * Pre-rework rows used free-text categories; those are shown as `other`.
 */
declare const COST_CATEGORIES: readonly ["accommodation", "food", "groceries", "transport", "flights", "activities", "sightseeing", "shopping", "fees", "health", "tips", "other"];
type CostCategory = (typeof COST_CATEGORIES)[number];
declare function typeToCostCategory(type: string | null | undefined): CostCategory;
/**
 * One payer of an expense — a row of budget_item_payers. `amount` is in the
 * expense's own currency (budget_items.currency). Several payers can split who
 * actually paid one bill. Username/avatar are joined for display.
 */
declare const budgetItemPayerSchema: z.ZodObject<{
  user_id: z.ZodNumber;
  amount: z.ZodNumber;
  username: z.ZodOptional<z.ZodString>;
  avatar_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  avatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  budget_item_id: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type BudgetItemPayer = z.infer<typeof budgetItemPayerSchema>;
/**
 * Budget item entity as returned by the budget list/create/update endpoints
 * (server/src/services/budgetService.ts). Columns of the `budget_items` table
 * plus the embedded `members` (equal-split participants) and `payers` arrays.
 * total_price is the sum of payer amounts in `currency`; `exchange_rate` converts
 * that to the trip base currency (NULL currency + rate 1 = base currency).
 */
declare const budgetItemSchema: z.ZodObject<{
  id: z.ZodNumber;
  trip_id: z.ZodNumber;
  category: z.ZodString;
  name: z.ZodString;
  total_price: z.ZodNumber;
  currency: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  exchange_rate: z.ZodOptional<z.ZodNumber>;
  persons: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  days: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  reservation_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  paid_by_user_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  expense_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  sort_order: z.ZodOptional<z.ZodNumber>;
  created_at: z.ZodOptional<z.ZodString>;
  members: z.ZodOptional<z.ZodArray<z.ZodObject<{
    user_id: z.ZodNumber;
    paid: z.ZodNumber;
    username: z.ZodString;
    avatar_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    avatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    budget_item_id: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strip>>>;
  payers: z.ZodOptional<z.ZodArray<z.ZodObject<{
    user_id: z.ZodNumber;
    amount: z.ZodNumber;
    username: z.ZodOptional<z.ZodString>;
    avatar_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    avatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    budget_item_id: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strip>>>;
}, z.core.$strip>;
type BudgetItem = z.infer<typeof budgetItemSchema>;
declare const budgetCreateItemRequestSchema: z.ZodObject<{
  name: z.ZodString;
  category: z.ZodOptional<z.ZodString>;
  total_price: z.ZodOptional<z.ZodNumber>;
  currency: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  exchange_rate: z.ZodOptional<z.ZodNumber>;
  payers: z.ZodOptional<z.ZodArray<z.ZodObject<{
    user_id: z.ZodNumber;
    amount: z.ZodNumber;
  }, z.core.$strip>>>;
  member_ids: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
  persons: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  days: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  expense_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  reservation_id: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type BudgetCreateItemRequest = z.infer<typeof budgetCreateItemRequestSchema>;
/** Update accepts the same fields plus total_price changes; all optional. */
declare const budgetUpdateItemRequestSchema: z.ZodObject<{
  name: z.ZodOptional<z.ZodString>;
  category: z.ZodOptional<z.ZodString>;
  total_price: z.ZodOptional<z.ZodNumber>;
  currency: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  exchange_rate: z.ZodOptional<z.ZodNumber>;
  payers: z.ZodOptional<z.ZodArray<z.ZodObject<{
    user_id: z.ZodNumber;
    amount: z.ZodNumber;
  }, z.core.$strip>>>;
  member_ids: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
  persons: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  days: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  expense_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type BudgetUpdateItemRequest = z.infer<typeof budgetUpdateItemRequestSchema>;
/** Replace the explicit payers of an expense (amounts in expense currency). */
declare const budgetUpdatePayersRequestSchema: z.ZodObject<{
  payers: z.ZodArray<z.ZodObject<{
    user_id: z.ZodNumber;
    amount: z.ZodNumber;
  }, z.core.$strip>>;
}, z.core.$strip>;
type BudgetUpdatePayersRequest = z.infer<typeof budgetUpdatePayersRequestSchema>;
/**
 * A persisted settle-up transfer (budget_settlements row): "from paid to" a
 * given amount in the trip base currency. Creating one marks a suggested flow as
 * paid; deleting it (undo) brings the flow back. Names joined for display.
 */
declare const budgetSettlementSchema: z.ZodObject<{
  id: z.ZodNumber;
  trip_id: z.ZodNumber;
  from_user_id: z.ZodNumber;
  to_user_id: z.ZodNumber;
  amount: z.ZodNumber;
  created_at: z.ZodOptional<z.ZodString>;
  created_by_user_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  from_username: z.ZodOptional<z.ZodString>;
  from_avatar_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  to_username: z.ZodOptional<z.ZodString>;
  to_avatar_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type BudgetSettlement = z.infer<typeof budgetSettlementSchema>;
declare const budgetCreateSettlementRequestSchema: z.ZodObject<{
  from_user_id: z.ZodNumber;
  to_user_id: z.ZodNumber;
  amount: z.ZodNumber;
}, z.core.$strip>;
type BudgetCreateSettlementRequest = z.infer<typeof budgetCreateSettlementRequestSchema>;
/** Edit a persisted settle-up transfer (same fields as create; full replace). */
declare const budgetUpdateSettlementRequestSchema: z.ZodObject<{
  from_user_id: z.ZodNumber;
  to_user_id: z.ZodNumber;
  amount: z.ZodNumber;
}, z.core.$strip>;
type BudgetUpdateSettlementRequest = z.infer<typeof budgetUpdateSettlementRequestSchema>;
declare const budgetUpdateMembersRequestSchema: z.ZodObject<{
  user_ids: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
type BudgetUpdateMembersRequest = z.infer<typeof budgetUpdateMembersRequestSchema>;
declare const budgetToggleMemberPaidRequestSchema: z.ZodObject<{
  paid: z.ZodBoolean;
}, z.core.$strip>;
type BudgetToggleMemberPaidRequest = z.infer<typeof budgetToggleMemberPaidRequestSchema>;
declare const budgetReorderItemsRequestSchema: z.ZodObject<{
  orderedIds: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
type BudgetReorderItemsRequest = z.infer<typeof budgetReorderItemsRequestSchema>;
declare const budgetReorderCategoriesRequestSchema: z.ZodObject<{
  orderedCategories: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
type BudgetReorderCategoriesRequest = z.infer<typeof budgetReorderCategoriesRequestSchema>;
//#endregion
//#region src/reservation/reservation.schema.d.ts
/**
 * A reservation endpoint (flight/train leg terminal) — row of the
 * reservation_endpoints table (server/src/services/reservationService.ts).
 */
declare const reservationEndpointSchema: z.ZodObject<{
  id: z.ZodOptional<z.ZodNumber>;
  reservation_id: z.ZodOptional<z.ZodNumber>;
  role: z.ZodEnum<{
    from: "from";
    to: "to";
    stop: "stop";
  }>;
  sequence: z.ZodNumber;
  name: z.ZodString;
  code: z.ZodNullable<z.ZodString>;
  lat: z.ZodNumber;
  lng: z.ZodNumber;
  timezone: z.ZodNullable<z.ZodString>;
  local_time: z.ZodNullable<z.ZodString>;
  local_date: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
type ReservationEndpoint = z.infer<typeof reservationEndpointSchema>;
/**
 * Reservation entity as returned by the reservation list endpoint
 * (server/src/services/reservationService.ts -> listReservations). Columns of
 * the `reservations` table plus the joined day_number / place_name / linked
 * accommodation fields and the computed `day_positions` + `endpoints`.
 * `accommodation_id` is stored as TEXT in the DB.
 */
declare const reservationSchema: z.ZodObject<{
  id: z.ZodNumber;
  trip_id: z.ZodNumber;
  day_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  end_day_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  place_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  assignment_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  title: z.ZodString;
  reservation_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  reservation_end_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  confirmation_number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  status: z.ZodString;
  type: z.ZodString;
  accommodation_id: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
  metadata: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  needs_review: z.ZodOptional<z.ZodNumber>;
  day_plan_position: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  created_at: z.ZodOptional<z.ZodString>;
  external_source: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  external_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  external_owner_user_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  external_synced_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  sync_enabled: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  day_number: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  place_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  accommodation_place_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  accommodation_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  accommodation_start_day_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  accommodation_end_day_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  day_positions: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodNumber>>>;
  endpoints: z.ZodOptional<z.ZodArray<z.ZodObject<{
    id: z.ZodOptional<z.ZodNumber>;
    reservation_id: z.ZodOptional<z.ZodNumber>;
    role: z.ZodEnum<{
      from: "from";
      to: "to";
      stop: "stop";
    }>;
    sequence: z.ZodNumber;
    name: z.ZodString;
    code: z.ZodNullable<z.ZodString>;
    lat: z.ZodNumber;
    lng: z.ZodNumber;
    timezone: z.ZodNullable<z.ZodString>;
    local_time: z.ZodNullable<z.ZodString>;
    local_date: z.ZodNullable<z.ZodString>;
  }, z.core.$strip>>>;
}, z.core.$strip>;
type Reservation = z.infer<typeof reservationSchema>;
/**
 * Accommodation entity as returned by listAccommodations / getAccommodationWithPlace
 * (server/src/services/dayService.ts). Columns of the day_accommodations table
 * plus the joined place fields and (on list) the linked reservation_title.
 */
declare const accommodationSchema: z.ZodObject<{
  id: z.ZodNumber;
  trip_id: z.ZodNumber;
  place_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  start_day_id: z.ZodNumber;
  end_day_id: z.ZodNumber;
  check_in: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  check_in_end: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  check_out: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  confirmation: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  created_at: z.ZodOptional<z.ZodString>;
  place_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  place_address: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  place_image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  place_lat: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  place_lng: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  reservation_title: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type Accommodation = z.infer<typeof accommodationSchema>;
/** Reservation create: title is required; the many optional fields stay open. */
declare const reservationCreateRequestSchema: z.ZodIntersection<z.ZodRecord<z.ZodString, z.ZodUnknown>, z.ZodObject<{
  title: z.ZodString;
}, z.core.$strip>>;
type ReservationCreateRequest = z.infer<typeof reservationCreateRequestSchema>;
declare const reservationUpdateRequestSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
type ReservationUpdateRequest = z.infer<typeof reservationUpdateRequestSchema>;
declare const reservationPositionsRequestSchema: z.ZodObject<{
  positions: z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    day_plan_position: z.ZodNumber;
  }, z.core.$strip>>;
  day_id: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
}, z.core.$strip>;
type ReservationPositionsRequest = z.infer<typeof reservationPositionsRequestSchema>;
declare const accommodationCreateRequestSchema: z.ZodObject<{
  place_id: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
  start_day_id: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
  end_day_id: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
  check_in: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  check_in_end: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  check_out: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  confirmation: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type AccommodationCreateRequest = z.infer<typeof accommodationCreateRequestSchema>;
declare const accommodationUpdateRequestSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
type AccommodationUpdateRequest = z.infer<typeof accommodationUpdateRequestSchema>;
declare const bookingImportPreviewItemSchema: z.ZodObject<{
  type: z.ZodString;
  title: z.ZodString;
  reservation_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  reservation_end_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  confirmation_number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  endpoints: z.ZodOptional<z.ZodArray<z.ZodObject<{
    role: z.ZodEnum<{
      from: "from";
      to: "to";
      stop: "stop";
    }>;
    sequence: z.ZodNumber;
    name: z.ZodString;
    code: z.ZodNullable<z.ZodString>;
    lat: z.ZodNumber;
    lng: z.ZodNumber;
    timezone: z.ZodNullable<z.ZodString>;
    local_time: z.ZodNullable<z.ZodString>;
    local_date: z.ZodNullable<z.ZodString>;
  }, z.core.$strip>>>;
  needs_review: z.ZodOptional<z.ZodBoolean>;
  _venue: z.ZodOptional<z.ZodObject<{
    name: z.ZodString;
    lat: z.ZodOptional<z.ZodNumber>;
    lng: z.ZodOptional<z.ZodNumber>;
    address: z.ZodOptional<z.ZodString>;
    website: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
  _accommodation: z.ZodOptional<z.ZodObject<{
    check_in: z.ZodOptional<z.ZodString>;
    check_out: z.ZodOptional<z.ZodString>;
    confirmation: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
  source: z.ZodObject<{
    fileName: z.ZodString;
    index: z.ZodNumber;
  }, z.core.$strip>;
}, z.core.$strip>;
type BookingImportPreviewItem = z.infer<typeof bookingImportPreviewItemSchema>;
declare const bookingImportPreviewResponseSchema: z.ZodObject<{
  items: z.ZodArray<z.ZodObject<{
    type: z.ZodString;
    title: z.ZodString;
    reservation_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    reservation_end_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    confirmation_number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    endpoints: z.ZodOptional<z.ZodArray<z.ZodObject<{
      role: z.ZodEnum<{
        from: "from";
        to: "to";
        stop: "stop";
      }>;
      sequence: z.ZodNumber;
      name: z.ZodString;
      code: z.ZodNullable<z.ZodString>;
      lat: z.ZodNumber;
      lng: z.ZodNumber;
      timezone: z.ZodNullable<z.ZodString>;
      local_time: z.ZodNullable<z.ZodString>;
      local_date: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>>;
    needs_review: z.ZodOptional<z.ZodBoolean>;
    _venue: z.ZodOptional<z.ZodObject<{
      name: z.ZodString;
      lat: z.ZodOptional<z.ZodNumber>;
      lng: z.ZodOptional<z.ZodNumber>;
      address: z.ZodOptional<z.ZodString>;
      website: z.ZodOptional<z.ZodString>;
      phone: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    _accommodation: z.ZodOptional<z.ZodObject<{
      check_in: z.ZodOptional<z.ZodString>;
      check_out: z.ZodOptional<z.ZodString>;
      confirmation: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    source: z.ZodObject<{
      fileName: z.ZodString;
      index: z.ZodNumber;
    }, z.core.$strip>;
  }, z.core.$strip>>;
  warnings: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
type BookingImportPreviewResponse = z.infer<typeof bookingImportPreviewResponseSchema>;
declare const bookingImportConfirmRequestSchema: z.ZodObject<{
  items: z.ZodArray<z.ZodObject<{
    type: z.ZodString;
    title: z.ZodString;
    reservation_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    reservation_end_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    confirmation_number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    endpoints: z.ZodOptional<z.ZodArray<z.ZodObject<{
      role: z.ZodEnum<{
        from: "from";
        to: "to";
        stop: "stop";
      }>;
      sequence: z.ZodNumber;
      name: z.ZodString;
      code: z.ZodNullable<z.ZodString>;
      lat: z.ZodNumber;
      lng: z.ZodNumber;
      timezone: z.ZodNullable<z.ZodString>;
      local_time: z.ZodNullable<z.ZodString>;
      local_date: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>>;
    needs_review: z.ZodOptional<z.ZodBoolean>;
    _venue: z.ZodOptional<z.ZodObject<{
      name: z.ZodString;
      lat: z.ZodOptional<z.ZodNumber>;
      lng: z.ZodOptional<z.ZodNumber>;
      address: z.ZodOptional<z.ZodString>;
      website: z.ZodOptional<z.ZodString>;
      phone: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    _accommodation: z.ZodOptional<z.ZodObject<{
      check_in: z.ZodOptional<z.ZodString>;
      check_out: z.ZodOptional<z.ZodString>;
      confirmation: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    source: z.ZodObject<{
      fileName: z.ZodString;
      index: z.ZodNumber;
    }, z.core.$strip>;
  }, z.core.$strip>>;
}, z.core.$strip>;
type BookingImportConfirmRequest = z.infer<typeof bookingImportConfirmRequestSchema>;
declare const bookingImportConfirmResponseSchema: z.ZodObject<{
  created: z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    trip_id: z.ZodNumber;
    day_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    end_day_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    place_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    assignment_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    title: z.ZodString;
    reservation_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    reservation_end_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    location: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    confirmation_number: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    status: z.ZodString;
    type: z.ZodString;
    accommodation_id: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>>>;
    metadata: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    needs_review: z.ZodOptional<z.ZodNumber>;
    day_plan_position: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    created_at: z.ZodOptional<z.ZodString>;
    external_source: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    external_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    external_owner_user_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    external_synced_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sync_enabled: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    day_number: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    place_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    accommodation_place_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    accommodation_name: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    accommodation_start_day_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    accommodation_end_day_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    day_positions: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodNumber>>>;
    endpoints: z.ZodOptional<z.ZodArray<z.ZodObject<{
      id: z.ZodOptional<z.ZodNumber>;
      reservation_id: z.ZodOptional<z.ZodNumber>;
      role: z.ZodEnum<{
        from: "from";
        to: "to";
        stop: "stop";
      }>;
      sequence: z.ZodNumber;
      name: z.ZodString;
      code: z.ZodNullable<z.ZodString>;
      lat: z.ZodNumber;
      lng: z.ZodNumber;
      timezone: z.ZodNullable<z.ZodString>;
      local_time: z.ZodNullable<z.ZodString>;
      local_date: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>>;
  }, z.core.$strip>>;
}, z.core.$strip>;
type BookingImportConfirmResponse = z.infer<typeof bookingImportConfirmResponseSchema>;
//#endregion
//#region src/airtrail/airtrail.schema.d.ts
/**
 * AirTrail integration contracts (#214).
 *
 * AirTrail is a self-hosted flight tracker (github.com/johanohly/AirTrail).
 * The connection is per-user (Settings → Integrations); the global on/off is the
 * `airtrail` addon. Each user stores their instance URL + a personal Bearer API
 * key, which only ever exposes that user's own flights.
 */
/** Placeholder the server returns instead of the real key once one is stored. */
declare const AIRTRAIL_KEY_MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
declare const airtrailSettingsSchema: z.ZodObject<{
  url: z.ZodString;
  apiKey: z.ZodOptional<z.ZodString>;
  allowInsecureTls: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  writeEnabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>;
type AirtrailSettings = z.infer<typeof airtrailSettingsSchema>;
declare const airtrailConnectionSchema: z.ZodObject<{
  url: z.ZodString;
  apiKeyMasked: z.ZodString;
  allowInsecureTls: z.ZodBoolean;
  writeEnabled: z.ZodBoolean;
  connected: z.ZodBoolean;
}, z.core.$strip>;
type AirtrailConnection = z.infer<typeof airtrailConnectionSchema>;
declare const airtrailStatusSchema: z.ZodObject<{
  connected: z.ZodBoolean;
  flightCount: z.ZodOptional<z.ZodNumber>;
  error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type AirtrailStatus = z.infer<typeof airtrailStatusSchema>;
/** A normalized AirTrail flight as surfaced to the import picker. */
declare const airtrailFlightSchema: z.ZodObject<{
  id: z.ZodString;
  fromCode: z.ZodNullable<z.ZodString>;
  fromName: z.ZodNullable<z.ZodString>;
  toCode: z.ZodNullable<z.ZodString>;
  toName: z.ZodNullable<z.ZodString>;
  date: z.ZodNullable<z.ZodString>;
  departure: z.ZodNullable<z.ZodString>;
  arrival: z.ZodNullable<z.ZodString>;
  airline: z.ZodNullable<z.ZodString>;
  flightNumber: z.ZodNullable<z.ZodString>;
  aircraft: z.ZodNullable<z.ZodString>;
  seatClass: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
type AirtrailFlight = z.infer<typeof airtrailFlightSchema>;
declare const airtrailImportSchema: z.ZodObject<{
  flightIds: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
type AirtrailImport = z.infer<typeof airtrailImportSchema>;
/** Per-flight outcome of an import (so the picker can show what was skipped). */
declare const airtrailImportResultSchema: z.ZodObject<{
  imported: z.ZodArray<z.ZodString>;
  skipped: z.ZodArray<z.ZodObject<{
    flightId: z.ZodString;
    reason: z.ZodEnum<{
      "already-imported": "already-imported";
      "already-in-trip": "already-in-trip";
      invalid: "invalid";
    }>;
    detail: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>;
}, z.core.$strip>;
type AirtrailImportResult = z.infer<typeof airtrailImportResultSchema>;
//#endregion
//#region src/day/day.schema.d.ts
/**
 * Day + day-note API contract — single source of truth for the
 * /api/trips/:tripId/days and /api/trips/:tripId/days/:dayId/notes endpoints.
 *
 * Trip-scoped, both gated by the 'day_edit' permission. The legacy routes
 * (server/src/routes/days.ts + routes/dayNotes.ts) wrap dayService /
 * dayNoteService. Day rows (with their assignments) are wide and DB-derived, so
 * list responses stay open. Day notes cap text at 500 and time at 150 chars
 * (the legacy validateStringLengths middleware) — reproduced in the controller.
 */
/**
 * Day note entity (server day_notes table / dayNoteService). `sort_order` is
 * SQLite REAL; `icon` defaults to a note emoji.
 */
declare const dayNoteSchema: z.ZodObject<{
  id: z.ZodNumber;
  day_id: z.ZodNumber;
  trip_id: z.ZodOptional<z.ZodNumber>;
  text: z.ZodString;
  time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  icon: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  sort_order: z.ZodOptional<z.ZodNumber>;
  created_at: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type DayNote = z.infer<typeof dayNoteSchema>;
/**
 * Day entity as returned by the day list/get endpoints
 * (server/src/services/dayService.ts -> listDays). Columns of the `days` table
 * plus the embedded `assignments` and `notes_items` arrays.
 */
declare const daySchema: z.ZodObject<{
  id: z.ZodNumber;
  trip_id: z.ZodNumber;
  day_number: z.ZodOptional<z.ZodNumber>;
  date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  title: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  assignments: z.ZodOptional<z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    day_id: z.ZodNumber;
    place_id: z.ZodNumber;
    order_index: z.ZodNumber;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    assignment_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    assignment_end_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    participants: z.ZodOptional<z.ZodArray<z.ZodObject<{
      user_id: z.ZodNumber;
      username: z.ZodString;
      avatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>>;
    created_at: z.ZodOptional<z.ZodString>;
    place: z.ZodObject<{
      id: z.ZodNumber;
      name: z.ZodString;
      description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
      lat: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
      lng: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
      address: z.ZodOptional<z.ZodNullable<z.ZodString>>;
      category_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
      price: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
      currency: z.ZodOptional<z.ZodNullable<z.ZodString>>;
      place_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
      end_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
      duration_minutes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
      notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
      image_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
      transport_mode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
      google_place_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
      website: z.ZodOptional<z.ZodNullable<z.ZodString>>;
      phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
      category: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        id: z.ZodNumber;
        name: z.ZodNullable<z.ZodString>;
        color: z.ZodNullable<z.ZodString>;
        icon: z.ZodNullable<z.ZodString>;
      }, z.core.$strip>>>;
      tags: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodNumber>;
        user_id: z.ZodOptional<z.ZodNumber>;
        name: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodString>;
        created_at: z.ZodOptional<z.ZodOptional<z.ZodString>>;
      }, z.core.$strip>>>;
    }, z.core.$strip>;
  }, z.core.$strip>>>;
  notes_items: z.ZodOptional<z.ZodArray<z.ZodObject<{
    id: z.ZodNumber;
    day_id: z.ZodNumber;
    trip_id: z.ZodOptional<z.ZodNumber>;
    text: z.ZodString;
    time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    icon: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    sort_order: z.ZodOptional<z.ZodNumber>;
    created_at: z.ZodOptional<z.ZodString>;
  }, z.core.$strip>>>;
}, z.core.$strip>;
type Day = z.infer<typeof daySchema>;
declare const dayCreateRequestSchema: z.ZodObject<{
  date: z.ZodOptional<z.ZodString>;
  notes: z.ZodOptional<z.ZodString>;
  position: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type DayCreateRequest = z.infer<typeof dayCreateRequestSchema>;
/** Reorder whole days: the desired full sequence of this trip's day ids. */
declare const dayReorderRequestSchema: z.ZodObject<{
  orderedIds: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
type DayReorderRequest = z.infer<typeof dayReorderRequestSchema>;
declare const dayUpdateRequestSchema: z.ZodObject<{
  notes: z.ZodOptional<z.ZodString>;
  title: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type DayUpdateRequest = z.infer<typeof dayUpdateRequestSchema>;
declare const dayNoteCreateRequestSchema: z.ZodObject<{
  text: z.ZodString;
  time: z.ZodOptional<z.ZodString>;
  icon: z.ZodOptional<z.ZodString>;
  sort_order: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type DayNoteCreateRequest = z.infer<typeof dayNoteCreateRequestSchema>;
declare const dayNoteUpdateRequestSchema: z.ZodObject<{
  text: z.ZodOptional<z.ZodString>;
  time: z.ZodOptional<z.ZodString>;
  icon: z.ZodOptional<z.ZodString>;
  sort_order: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type DayNoteUpdateRequest = z.infer<typeof dayNoteUpdateRequestSchema>;
//#endregion
//#region src/assignment/assignment.schema.d.ts
/**
 * Assignment API contract — single source of truth for the place↔day itinerary
 * endpoints under /api/trips/:tripId/days/:dayId/assignments and
 * /api/trips/:tripId/assignments/:id/*.
 *
 * Trip-scoped; mutations use the 'day_edit' permission. The legacy route
 * (server/src/routes/assignments.ts, mounted on /api) wraps assignmentService.
 * Assignment rows carry joined place data and are kept open in responses; the
 * request schemas + the bespoke 404/400 controller messages pin the rest.
 */
/**
 * Assignment participant embedded on an assignment
 * (server/src/services/queryHelpers.ts -> loadParticipantsByAssignmentIds).
 */
declare const assignmentParticipantSchema: z.ZodObject<{
  user_id: z.ZodNumber;
  username: z.ZodString;
  avatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type AssignmentParticipant = z.infer<typeof assignmentParticipantSchema>;
/**
 * Assignment entity as returned by the day/assignment endpoints
 * (server/src/services/queryHelpers.ts -> formatAssignmentWithPlace, and
 * assignmentService.getAssignmentWithPlace). The embedded `place` is the trimmed
 * assignment-place projection, NOT the full place pool entity. `assignment_time`
 * /`assignment_end_time` carry the per-assignment override times.
 */
declare const assignmentSchema: z.ZodObject<{
  id: z.ZodNumber;
  day_id: z.ZodNumber;
  place_id: z.ZodNumber;
  order_index: z.ZodNumber;
  notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  assignment_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  assignment_end_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  participants: z.ZodOptional<z.ZodArray<z.ZodObject<{
    user_id: z.ZodNumber;
    username: z.ZodString;
    avatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  }, z.core.$strip>>>;
  created_at: z.ZodOptional<z.ZodString>;
  place: z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    lat: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    lng: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    address: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    category_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    price: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    currency: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    place_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    end_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    duration_minutes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    image_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    transport_mode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    google_place_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    website: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    category: z.ZodOptional<z.ZodNullable<z.ZodObject<{
      id: z.ZodNumber;
      name: z.ZodNullable<z.ZodString>;
      color: z.ZodNullable<z.ZodString>;
      icon: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodObject<{
      id: z.ZodOptional<z.ZodNumber>;
      user_id: z.ZodOptional<z.ZodNumber>;
      name: z.ZodOptional<z.ZodString>;
      color: z.ZodOptional<z.ZodString>;
      created_at: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    }, z.core.$strip>>>;
  }, z.core.$strip>;
}, z.core.$strip>;
type Assignment = z.infer<typeof assignmentSchema>;
declare const assignmentCreateRequestSchema: z.ZodObject<{
  place_id: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
  notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type AssignmentCreateRequest = z.infer<typeof assignmentCreateRequestSchema>;
declare const assignmentReorderRequestSchema: z.ZodObject<{
  orderedIds: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
type AssignmentReorderRequest = z.infer<typeof assignmentReorderRequestSchema>;
declare const assignmentMoveRequestSchema: z.ZodObject<{
  new_day_id: z.ZodUnion<readonly [z.ZodNumber, z.ZodString]>;
  order_index: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type AssignmentMoveRequest = z.infer<typeof assignmentMoveRequestSchema>;
declare const assignmentTimeRequestSchema: z.ZodObject<{
  place_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  end_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type AssignmentTimeRequest = z.infer<typeof assignmentTimeRequestSchema>;
declare const assignmentParticipantsRequestSchema: z.ZodObject<{
  user_ids: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
type AssignmentParticipantsRequest = z.infer<typeof assignmentParticipantsRequestSchema>;
//#endregion
//#region src/place/place.schema.d.ts
/**
 * Embedded category as returned on a place — a trimmed projection of the
 * categories row (id/name/color/icon), built inline by placeService and
 * getPlaceWithTags. `null` when the place has no category_id.
 */
declare const placeCategorySchema: z.ZodNullable<z.ZodObject<{
  id: z.ZodNumber;
  name: z.ZodNullable<z.ZodString>;
  color: z.ZodNullable<z.ZodString>;
  icon: z.ZodNullable<z.ZodString>;
}, z.core.$strip>>;
type PlaceCategory = z.infer<typeof placeCategorySchema>;
/**
 * Full place entity as returned by the place list / get / create / update
 * endpoints (server/src/services/placeService.ts -> getPlaceWithTags). All
 * columns of the `places` table (see server/data DB) plus the joined `category`
 * projection and `tags` array. Numbers (lat/lng/price) are SQLite REAL, ids are
 * INTEGER; provider-derived columns are nullable.
 */
declare const placeSchema: z.ZodObject<{
  id: z.ZodNumber;
  trip_id: z.ZodNumber;
  name: z.ZodString;
  description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  lat: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  lng: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  address: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  category_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  price: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  currency: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  reservation_status: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  reservation_notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  reservation_datetime: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  place_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  end_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  duration_minutes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  image_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  google_place_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  osm_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  route_geometry: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  website: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  transport_mode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  created_at: z.ZodOptional<z.ZodString>;
  updated_at: z.ZodOptional<z.ZodString>;
  category: z.ZodOptional<z.ZodNullable<z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodNullable<z.ZodString>;
    color: z.ZodNullable<z.ZodString>;
    icon: z.ZodNullable<z.ZodString>;
  }, z.core.$strip>>>;
  tags: z.ZodOptional<z.ZodArray<z.ZodObject<{
    id: z.ZodOptional<z.ZodNumber>;
    user_id: z.ZodOptional<z.ZodNumber>;
    name: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    created_at: z.ZodOptional<z.ZodOptional<z.ZodString>>;
  }, z.core.$strip>>>;
}, z.core.$strip>;
type Place = z.infer<typeof placeSchema>;
/**
 * Trimmed place projection embedded inside a day-assignment response
 * (server/src/services/queryHelpers.ts -> formatAssignmentWithPlace). This is a
 * SUBSET of the full place: no trip_id / osm_id / route_geometry / created_at /
 * reservation_* — only the fields the planner needs to render the itinerary card.
 */
declare const assignmentPlaceSchema: z.ZodObject<{
  id: z.ZodNumber;
  name: z.ZodString;
  description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  lat: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  lng: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  address: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  category_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  price: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  currency: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  place_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  end_time: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  duration_minutes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
  notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  image_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  transport_mode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  google_place_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  website: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  phone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  category: z.ZodOptional<z.ZodNullable<z.ZodObject<{
    id: z.ZodNumber;
    name: z.ZodNullable<z.ZodString>;
    color: z.ZodNullable<z.ZodString>;
    icon: z.ZodNullable<z.ZodString>;
  }, z.core.$strip>>>;
  tags: z.ZodOptional<z.ZodArray<z.ZodObject<{
    id: z.ZodOptional<z.ZodNumber>;
    user_id: z.ZodOptional<z.ZodNumber>;
    name: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<z.ZodString>;
    created_at: z.ZodOptional<z.ZodOptional<z.ZodString>>;
  }, z.core.$strip>>>;
}, z.core.$strip>;
type AssignmentPlace = z.infer<typeof assignmentPlaceSchema>;
declare const placeCreateRequestSchema: z.ZodIntersection<z.ZodRecord<z.ZodString, z.ZodUnknown>, z.ZodObject<{
  name: z.ZodString;
}, z.core.$strip>>;
type PlaceCreateRequest = z.infer<typeof placeCreateRequestSchema>;
declare const placeUpdateRequestSchema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
type PlaceUpdateRequest = z.infer<typeof placeUpdateRequestSchema>;
declare const placeBulkDeleteRequestSchema: z.ZodObject<{
  ids: z.ZodArray<z.ZodNumber>;
}, z.core.$strip>;
type PlaceBulkDeleteRequest = z.infer<typeof placeBulkDeleteRequestSchema>;
declare const placeImportListRequestSchema: z.ZodObject<{
  url: z.ZodString;
  enrich: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
type PlaceImportListRequest = z.infer<typeof placeImportListRequestSchema>;
/** Query filters for the place list. */
declare const placeListQuerySchema: z.ZodObject<{
  search: z.ZodOptional<z.ZodString>;
  category: z.ZodOptional<z.ZodString>;
  tag: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type PlaceListQuery = z.infer<typeof placeListQuerySchema>;
//#endregion
//#region src/trip/trip.schema.d.ts
/**
 * Trip API contract — single source of truth for the /api/trips aggregate-root
 * endpoints (list/create/get/update/delete a trip, cover upload, copy, members,
 * offline bundle, ICS export).
 *
 * The aggregate root shares its path with the trip sub-domains (days, places,
 * collab, files, ...), so in the strangler it uses EXACT prefixes (`/api/trips|`,
 * `/api/trips/:tripId|`) plus the specific sub-route prefixes — never a broad
 * `/api/trips`, which would swallow not-yet-migrated nested mounts. The legacy
 * route (server/src/routes/trips.ts) wraps tripService and does per-field
 * permission checks + audit logging. Trip rows are wide, so responses stay open.
 */
/**
 * Trip entity as returned by the trip list / get / create / update endpoints
 * (server/src/services/tripService.ts -> TRIP_SELECT). Columns of the `trips`
 * table plus the computed list fields (day_count, place_count, is_owner as 0/1,
 * owner_username, shared_count). `is_archived` is the raw SQLite INTEGER.
 */
declare const tripSchema: z.ZodObject<{
  id: z.ZodNumber;
  user_id: z.ZodNumber;
  title: z.ZodString;
  description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  start_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  end_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  currency: z.ZodString;
  cover_image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  is_archived: z.ZodNumber;
  reminder_days: z.ZodNumber;
  created_at: z.ZodOptional<z.ZodString>;
  updated_at: z.ZodOptional<z.ZodString>;
  day_count: z.ZodOptional<z.ZodNumber>;
  place_count: z.ZodOptional<z.ZodNumber>;
  is_owner: z.ZodOptional<z.ZodNumber>;
  owner_username: z.ZodOptional<z.ZodString>;
  shared_count: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type Trip = z.infer<typeof tripSchema>;
/**
 * Trip member as returned by the members endpoint
 * (server/src/services/tripService.ts -> listMembers). Owner + collaborators
 * share this shape; `avatar_url` is resolved from the stored avatar.
 */
declare const tripMemberSchema: z.ZodObject<{
  id: z.ZodNumber;
  username: z.ZodString;
  email: z.ZodOptional<z.ZodString>;
  avatar: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  avatar_url: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  role: z.ZodOptional<z.ZodString>;
  added_at: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  invited_by_username: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type TripMember = z.infer<typeof tripMemberSchema>;
declare const tripCreateRequestSchema: z.ZodObject<{
  title: z.ZodString;
  description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  start_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  end_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  currency: z.ZodOptional<z.ZodString>;
  reminder_days: z.ZodOptional<z.ZodNumber>;
  day_count: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type TripCreateRequest = z.infer<typeof tripCreateRequestSchema>;
/** Update is partial; the route runs per-field permission checks on what's present. */
declare const tripUpdateRequestSchema: z.ZodObject<{
  title: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  start_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  end_date: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  currency: z.ZodOptional<z.ZodString>;
  reminder_days: z.ZodOptional<z.ZodNumber>;
  day_count: z.ZodOptional<z.ZodNumber>;
  is_archived: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodNumber]>>;
  cover_image: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
type TripUpdateRequest = z.infer<typeof tripUpdateRequestSchema>;
declare const tripCopyRequestSchema: z.ZodObject<{
  title: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type TripCopyRequest = z.infer<typeof tripCopyRequestSchema>;
declare const tripAddMemberRequestSchema: z.ZodObject<{
  identifier: z.ZodString;
}, z.core.$strip>;
type TripAddMemberRequest = z.infer<typeof tripAddMemberRequestSchema>;
//#endregion
//#region src/collab/collab.schema.d.ts
/**
 * Collab API contract — single source of truth for the /api/trips/:tripId/collab
 * endpoints (shared notes + file attachments, decision polls, group chat with
 * reactions, link previews).
 *
 * Trip-scoped; mutations use 'collab_edit' (file uploads use 'file_upload'). The
 * legacy route (server/src/routes/collab.ts) wraps collabService and broadcasts
 * over WebSocket + fires chat/note notifications. Rows are wide and kept open;
 * the request schemas + the bespoke 400/403/404 controller messages pin the rest.
 */
declare const collabNoteCreateRequestSchema: z.ZodObject<{
  title: z.ZodString;
  content: z.ZodOptional<z.ZodString>;
  category: z.ZodOptional<z.ZodString>;
  color: z.ZodOptional<z.ZodString>;
  website: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type CollabNoteCreateRequest = z.infer<typeof collabNoteCreateRequestSchema>;
declare const collabNoteUpdateRequestSchema: z.ZodObject<{
  title: z.ZodOptional<z.ZodString>;
  content: z.ZodOptional<z.ZodString>;
  category: z.ZodOptional<z.ZodString>;
  color: z.ZodOptional<z.ZodString>;
  pinned: z.ZodOptional<z.ZodUnion<readonly [z.ZodBoolean, z.ZodNumber]>>;
  website: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type CollabNoteUpdateRequest = z.infer<typeof collabNoteUpdateRequestSchema>;
declare const collabPollCreateRequestSchema: z.ZodObject<{
  question: z.ZodString;
  options: z.ZodArray<z.ZodUnknown>;
  multiple: z.ZodOptional<z.ZodBoolean>;
  multiple_choice: z.ZodOptional<z.ZodBoolean>;
  deadline: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type CollabPollCreateRequest = z.infer<typeof collabPollCreateRequestSchema>;
declare const collabPollVoteRequestSchema: z.ZodObject<{
  option_index: z.ZodNumber;
}, z.core.$strip>;
type CollabPollVoteRequest = z.infer<typeof collabPollVoteRequestSchema>;
declare const collabMessageCreateRequestSchema: z.ZodObject<{
  text: z.ZodString;
  reply_to: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, z.core.$strip>;
type CollabMessageCreateRequest = z.infer<typeof collabMessageCreateRequestSchema>;
declare const collabReactionRequestSchema: z.ZodObject<{
  emoji: z.ZodString;
}, z.core.$strip>;
type CollabReactionRequest = z.infer<typeof collabReactionRequestSchema>;
//#endregion
//#region src/file/file.schema.d.ts
declare const fileUpdateRequestSchema: z.ZodObject<{
  description: z.ZodOptional<z.ZodString>;
  place_id: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>>;
  reservation_id: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>>;
}, z.core.$strip>;
type FileUpdateRequest = z.infer<typeof fileUpdateRequestSchema>;
declare const fileLinkRequestSchema: z.ZodObject<{
  reservation_id: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>>;
  assignment_id: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>>;
  place_id: z.ZodOptional<z.ZodNullable<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>>;
}, z.core.$strip>;
type FileLinkRequest = z.infer<typeof fileLinkRequestSchema>;
/** Variants the photo streaming endpoints accept. */
declare const photoVariantSchema: z.ZodEnum<{
  thumbnail: "thumbnail";
  original: "original";
}>;
type PhotoVariant = z.infer<typeof photoVariantSchema>;
//#endregion
//#region src/journey/journey.schema.d.ts
/**
 * Journey API contract — cross-trip travel narrative (journeys, dated entries,
 * a photo gallery with provider mirroring, contributors, per-user preferences
 * and public share links).
 *
 * Authenticated routes live under /api/journeys (gated by the Journey addon);
 * the public read/photo-proxy routes live under /api/public/journey and are
 * share-token validated. Access control lives inside journeyService (it returns
 * null/false → the controller maps to 403/404), so these schemas pin the
 * well-defined request bodies; entry create/update stay open-ended (forwarded
 * to the service) and the bespoke 400/403/404 messages pin the rest.
 */
declare const journeyCreateRequestSchema: z.ZodObject<{
  title: z.ZodString;
  subtitle: z.ZodOptional<z.ZodString>;
  trip_ids: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>>;
}, z.core.$strip>;
type JourneyCreateRequest = z.infer<typeof journeyCreateRequestSchema>;
declare const journeyAddTripRequestSchema: z.ZodObject<{
  trip_id: z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>;
}, z.core.$strip>;
type JourneyAddTripRequest = z.infer<typeof journeyAddTripRequestSchema>;
declare const journeyReorderEntriesRequestSchema: z.ZodObject<{
  orderedIds: z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
}, z.core.$strip>;
type JourneyReorderEntriesRequest = z.infer<typeof journeyReorderEntriesRequestSchema>;
declare const journeyContributorRequestSchema: z.ZodObject<{
  user_id: z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>;
  role: z.ZodOptional<z.ZodEnum<{
    editor: "editor";
    viewer: "viewer";
  }>>;
}, z.core.$strip>;
type JourneyContributorRequest = z.infer<typeof journeyContributorRequestSchema>;
declare const journeyProviderPhotosRequestSchema: z.ZodObject<{
  provider: z.ZodString;
  asset_id: z.ZodOptional<z.ZodString>;
  asset_ids: z.ZodOptional<z.ZodArray<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>>;
  caption: z.ZodOptional<z.ZodString>;
  passphrase: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type JourneyProviderPhotosRequest = z.infer<typeof journeyProviderPhotosRequestSchema>;
declare const journeyShareLinkRequestSchema: z.ZodObject<{
  share_timeline: z.ZodOptional<z.ZodBoolean>;
  share_gallery: z.ZodOptional<z.ZodBoolean>;
  share_map: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
type JourneyShareLinkRequest = z.infer<typeof journeyShareLinkRequestSchema>;
//#endregion
//#region src/share/share.schema.d.ts
/**
 * Trip share-link API contract.
 *
 * Owner/members create a public read-only token for a trip under
 * /api/trips/:tripId/share-link (gated by 'share_manage'); anyone can read the
 * shared snapshot at /api/shared/:token (no auth). The per-section toggles
 * default server-side (map/bookings on, packing/budget/collab off), so every
 * field is optional here.
 */
declare const shareLinkRequestSchema: z.ZodObject<{
  share_map: z.ZodOptional<z.ZodBoolean>;
  share_bookings: z.ZodOptional<z.ZodBoolean>;
  share_packing: z.ZodOptional<z.ZodBoolean>;
  share_budget: z.ZodOptional<z.ZodBoolean>;
  share_collab: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
type ShareLinkRequest = z.infer<typeof shareLinkRequestSchema>;
//#endregion
//#region src/settings/settings.schema.d.ts
/**
 * User-settings API contract — per-user key/value preferences under
 * /api/settings (get all, upsert one, bulk upsert).
 *
 * Values are intentionally untyped (settings hold strings, numbers, booleans
 * and small objects). A masked value of '••••••••' on a single upsert is a
 * no-op sentinel (the client echoes the masked secret back unchanged).
 */
declare const MASKED_SETTING_VALUE = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
declare const settingUpsertRequestSchema: z.ZodObject<{
  key: z.ZodString;
  value: z.ZodOptional<z.ZodUnknown>;
}, z.core.$strip>;
type SettingUpsertRequest = z.infer<typeof settingUpsertRequestSchema>;
declare const settingsBulkRequestSchema: z.ZodObject<{
  settings: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strip>;
type SettingsBulkRequest = z.infer<typeof settingsBulkRequestSchema>;
//#endregion
//#region src/backup/backup.schema.d.ts
/**
 * Backup API contract (admin-only) for /api/backup.
 *
 * The auto-backup settings body is normalised server-side by the backup
 * service (parseAutoBackupBody), so this schema only pins the well-known toggle
 * fields and stays permissive (passthrough) for the rest. Create/restore/delete
 * carry no JSON body; their inputs are the :filename path param + the upload.
 */
declare const autoBackupSettingsRequestSchema: z.ZodObject<{
  enabled: z.ZodOptional<z.ZodBoolean>;
  interval: z.ZodOptional<z.ZodString>;
  keep_days: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
  time: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
type AutoBackupSettingsRequest = z.infer<typeof autoBackupSettingsRequestSchema>;
//#endregion
//#region src/auth/auth.schema.d.ts
/**
 * Auth API contract for /api/auth.
 *
 * The auth service does the heavy credential/MFA validation internally (and
 * returns its own {error,status}); these schemas pin the well-defined request
 * bodies the public + account endpoints accept. Login/reset can branch to an
 * MFA step, so password fields stay permissive where the service owns the rules.
 */
declare const registerRequestSchema: z.ZodObject<{
  email: z.ZodString;
  password: z.ZodString;
  username: z.ZodOptional<z.ZodString>;
  invite_token: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type RegisterRequest = z.infer<typeof registerRequestSchema>;
declare const loginRequestSchema: z.ZodObject<{
  email: z.ZodString;
  password: z.ZodString;
  remember_me: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
type LoginRequest = z.infer<typeof loginRequestSchema>;
declare const forgotPasswordRequestSchema: z.ZodObject<{
  email: z.ZodString;
}, z.core.$strip>;
type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;
declare const resetPasswordRequestSchema: z.ZodObject<{
  token: z.ZodString;
  new_password: z.ZodString;
  mfa_code: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
declare const changePasswordRequestSchema: z.ZodObject<{
  current_password: z.ZodString;
  new_password: z.ZodString;
}, z.core.$strip>;
type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
declare const mfaVerifyLoginRequestSchema: z.ZodObject<{
  mfa_token: z.ZodString;
  code: z.ZodString;
  remember_me: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
type MfaVerifyLoginRequest = z.infer<typeof mfaVerifyLoginRequestSchema>;
declare const mfaEnableRequestSchema: z.ZodObject<{
  code: z.ZodString;
}, z.core.$strip>;
type MfaEnableRequest = z.infer<typeof mfaEnableRequestSchema>;
declare const mcpTokenCreateRequestSchema: z.ZodObject<{
  name: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type McpTokenCreateRequest = z.infer<typeof mcpTokenCreateRequestSchema>;
//#endregion
//#region src/oidc/oidc.schema.d.ts
/**
 * OIDC SSO contract for /api/auth/oidc.
 *
 * The flow is redirect-based and carries no request bodies — inputs arrive as
 * query params (the provider callback's code/state/error, the optional invite on
 * /login, and the auth-code on /exchange). These schemas pin those query shapes;
 * the cryptographic verification + provisioning live in the OIDC service.
 */
declare const oidcCallbackQuerySchema: z.ZodObject<{
  code: z.ZodOptional<z.ZodString>;
  state: z.ZodOptional<z.ZodString>;
  error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type OidcCallbackQuery = z.infer<typeof oidcCallbackQuerySchema>;
declare const oidcExchangeQuerySchema: z.ZodObject<{
  code: z.ZodString;
}, z.core.$strip>;
type OidcExchangeQuery = z.infer<typeof oidcExchangeQuerySchema>;
//#endregion
//#region src/oauth/oauth.schema.d.ts
/**
 * OAuth 2.1 server contract for /oauth/* (public) + /api/oauth/* (SPA).
 *
 * The token endpoint accepts JSON or form-encoded bodies across three grant
 * types, so its body stays permissive (the service enforces grant-specific
 * rules + the RFC error codes). These schemas pin the consent submit and the
 * client-create body the SPA sends.
 */
declare const oauthTokenRequestSchema: z.ZodObject<{
  grant_type: z.ZodOptional<z.ZodString>;
  client_id: z.ZodOptional<z.ZodString>;
  client_secret: z.ZodOptional<z.ZodString>;
  code: z.ZodOptional<z.ZodString>;
  redirect_uri: z.ZodOptional<z.ZodString>;
  code_verifier: z.ZodOptional<z.ZodString>;
  refresh_token: z.ZodOptional<z.ZodString>;
  scope: z.ZodOptional<z.ZodString>;
  resource: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
type OauthTokenRequest = z.infer<typeof oauthTokenRequestSchema>;
declare const oauthConsentRequestSchema: z.ZodObject<{
  client_id: z.ZodString;
  redirect_uri: z.ZodString;
  scope: z.ZodString;
  state: z.ZodOptional<z.ZodString>;
  code_challenge: z.ZodString;
  code_challenge_method: z.ZodString;
  approved: z.ZodBoolean;
  resource: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
type OauthConsentRequest = z.infer<typeof oauthConsentRequestSchema>;
declare const oauthClientCreateRequestSchema: z.ZodObject<{
  name: z.ZodString;
  redirect_uris: z.ZodOptional<z.ZodArray<z.ZodString>>;
  allowed_scopes: z.ZodArray<z.ZodString>;
  allows_client_credentials: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
type OauthClientCreateRequest = z.infer<typeof oauthClientCreateRequestSchema>;
//#endregion
//#region src/admin/admin.schema.d.ts
/**
 * Admin API contract for /api/admin (admin-only).
 *
 * The admin service validates most bodies itself (returning {error,status}), so
 * these schemas pin the well-defined ones: user create/update, the permission
 * matrix, invites and the boolean feature toggles. Free-form bodies (OIDC
 * settings, addon config, default user settings) stay with the service.
 */
declare const adminUserCreateRequestSchema: z.ZodObject<{
  email: z.ZodString;
  password: z.ZodOptional<z.ZodString>;
  username: z.ZodOptional<z.ZodString>;
  role: z.ZodOptional<z.ZodEnum<{
    user: "user";
    admin: "admin";
  }>>;
}, z.core.$strip>;
type AdminUserCreateRequest = z.infer<typeof adminUserCreateRequestSchema>;
declare const adminPermissionsRequestSchema: z.ZodObject<{
  permissions: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, z.core.$strip>;
type AdminPermissionsRequest = z.infer<typeof adminPermissionsRequestSchema>;
declare const adminInviteCreateRequestSchema: z.ZodObject<{
  max_uses: z.ZodOptional<z.ZodNumber>;
  expires_in_days: z.ZodOptional<z.ZodNumber>;
  role: z.ZodOptional<z.ZodEnum<{
    user: "user";
    admin: "admin";
  }>>;
}, z.core.$strip>;
type AdminInviteCreateRequest = z.infer<typeof adminInviteCreateRequestSchema>;
declare const adminFeatureToggleRequestSchema: z.ZodObject<{
  enabled: z.ZodBoolean;
}, z.core.$strip>;
type AdminFeatureToggleRequest = z.infer<typeof adminFeatureToggleRequestSchema>;
//#endregion
//#region src/relocation/relocation.schema.d.ts
/**
 * Relocation domain contract — single source of truth for the relocation
 * add-on. Schemas defined here are consumed by:
 *   - memove/server/src/ (NestJS relocation module: validation + DTO types)
 *   - memove/client/src/ (typed requests/responses for relocation pages)
 *   - sources/processed/relocation/locations.json (Python ETL validates against
 *     the inferred TS types via JSON Schema export)
 *
 * Companion to CONTRACT.md §1a, §1b, §2b. Per Phase 4 plan T1.1 (Day 1
 * skeleton; BLOCKS Data + Frontend subagents).
 *
 * Layout follows the existing @memove/shared pattern: one folder per domain,
 * schema-first, then inferred types via z.infer.
 */
declare const provenanceRefSchema: z.ZodObject<{
  source: z.ZodString;
  pulledAt: z.ZodString;
  license: z.ZodString;
  url: z.ZodString;
}, z.core.$strip>;
type ProvenanceRef = z.infer<typeof provenanceRefSchema>;
declare const costSummarySchema: z.ZodObject<{
  costOfLivingIndex: z.ZodNumber;
  medianHomeValue: z.ZodNumber;
  medianRent: z.ZodNumber;
  stateIncomeTaxRate: z.ZodNumber;
  propertyTaxRate: z.ZodNumber;
}, z.core.$strip>;
type CostSummary = z.infer<typeof costSummarySchema>;
declare const climateDataSchema: z.ZodObject<{
  daysMaxGt90FAnnual: z.ZodNumber;
  daysMinLt32FAnnual: z.ZodNumber;
  sunshineHoursAnnual: z.ZodNumber;
  annualPrecipitationInches: z.ZodNumber;
  tornadoRiskScore: z.ZodNumber;
  hurricaneRiskScore: z.ZodNumber;
  floodRiskScore: z.ZodNumber;
  earthquakeRiskScore: z.ZodNumber;
  wildfireRiskScore: z.ZodNumber;
}, z.core.$strip>;
type ClimateData = z.infer<typeof climateDataSchema>;
declare const crimeDataSchema: z.ZodObject<{
  violentCrimeRatePer100k: z.ZodNumber;
  propertyCrimeRatePer100k: z.ZodNumber;
  yearOverYearTrend: z.ZodNumber;
}, z.core.$strip>;
type CrimeData = z.infer<typeof crimeDataSchema>;
declare const healthcareDataSchema: z.ZodObject<{
  healthcareAccessScore: z.ZodNumber;
  hospitalCountWithin10mi: z.ZodNumber;
}, z.core.$strip>;
type HealthcareData = z.infer<typeof healthcareDataSchema>;
declare const broadbandDataSchema: z.ZodObject<{
  pctHouseholdsWith100MbpsPlus: z.ZodNumber;
  medianDownloadMbps: z.ZodNumber;
}, z.core.$strip>;
type BroadbandData = z.infer<typeof broadbandDataSchema>;
declare const educationDataSchema: z.ZodObject<{
  publicSchoolRatingAvg: z.ZodOptional<z.ZodNumber>;
  studentTeacherRatio: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type EducationData = z.infer<typeof educationDataSchema>;
declare const fiscalTierSchema: z.ZodEnum<{
  Resilient: "Resilient";
  Fragile: "Fragile";
  Distressed: "Distressed";
  Unknown: "Unknown";
}>;
type FiscalTier = z.infer<typeof fiscalTierSchema>;
declare const fiscalProfileSchema: z.ZodObject<{
  statePensionFundedRatio: z.ZodNumber;
  fiscalTier: z.ZodEnum<{
    Resilient: "Resilient";
    Fragile: "Fragile";
    Distressed: "Distressed";
    Unknown: "Unknown";
  }>;
  taxCompetitivenessScore: z.ZodNumber;
}, z.core.$strip>;
type FiscalProfile = z.infer<typeof fiscalProfileSchema>;
declare const amenityProfileSchema: z.ZodObject<{
  groceryStoreDensityPerCapita: z.ZodNumber;
  bigBoxStoreCount: z.ZodNumber;
  recreationAreaCount: z.ZodNumber;
  natureAreaCount: z.ZodNumber;
}, z.core.$strip>;
type AmenityProfile = z.infer<typeof amenityProfileSchema>;
declare const blendedScoreSchema: z.ZodObject<{
  costScore0to50: z.ZodNumber;
  lifeScore0to50: z.ZodNumber;
  totalScore0to100: z.ZodNumber;
}, z.core.$strip>;
type BlendedScore = z.infer<typeof blendedScoreSchema>;
declare const transportationDataSchema: z.ZodObject<{
  avgCommuteMinutes: z.ZodNumber;
  pctTransitCommute: z.ZodNumber;
  pctRemoteWork: z.ZodNumber;
  longCommutePct: z.ZodNumber;
}, z.core.$strip>;
type TransportationData = z.infer<typeof transportationDataSchema>;
declare const mobilityDataSchema: z.ZodObject<{
  upwardMobilityScore: z.ZodNumber;
  mobilityPercentile: z.ZodNumber;
}, z.core.$strip>;
type MobilityData = z.infer<typeof mobilityDataSchema>;
declare const healthOutcomesDataSchema: z.ZodObject<{
  lifeExpectancy: z.ZodNumber;
  adultObesityPct: z.ZodNumber;
  adultSmokingPct: z.ZodNumber;
  poorMentalHealthDays: z.ZodNumber;
  primaryCarePhysiciansPer100k: z.ZodNumber;
}, z.core.$strip>;
type HealthOutcomesData = z.infer<typeof healthOutcomesDataSchema>;
declare const walkabilityDataSchema: z.ZodObject<{
  walkabilityScore: z.ZodNumber;
  walkabilityUnweighted: z.ZodNumber;
  blockGroupCount: z.ZodNumber;
  totPop: z.ZodNumber;
}, z.core.$strip>;
type WalkabilityData = z.infer<typeof walkabilityDataSchema>;
declare const locationSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  state: z.ZodString;
  lat: z.ZodNumber;
  lng: z.ZodNumber;
  population: z.ZodNumber;
  cost: z.ZodObject<{
    costOfLivingIndex: z.ZodNumber;
    medianHomeValue: z.ZodNumber;
    medianRent: z.ZodNumber;
    stateIncomeTaxRate: z.ZodNumber;
    propertyTaxRate: z.ZodNumber;
  }, z.core.$strip>;
  climate: z.ZodObject<{
    daysMaxGt90FAnnual: z.ZodNumber;
    daysMinLt32FAnnual: z.ZodNumber;
    sunshineHoursAnnual: z.ZodNumber;
    annualPrecipitationInches: z.ZodNumber;
    tornadoRiskScore: z.ZodNumber;
    hurricaneRiskScore: z.ZodNumber;
    floodRiskScore: z.ZodNumber;
    earthquakeRiskScore: z.ZodNumber;
    wildfireRiskScore: z.ZodNumber;
  }, z.core.$strip>;
  crime: z.ZodObject<{
    violentCrimeRatePer100k: z.ZodNumber;
    propertyCrimeRatePer100k: z.ZodNumber;
    yearOverYearTrend: z.ZodNumber;
  }, z.core.$strip>;
  healthcare: z.ZodObject<{
    healthcareAccessScore: z.ZodNumber;
    hospitalCountWithin10mi: z.ZodNumber;
  }, z.core.$strip>;
  broadband: z.ZodObject<{
    pctHouseholdsWith100MbpsPlus: z.ZodNumber;
    medianDownloadMbps: z.ZodNumber;
  }, z.core.$strip>;
  education: z.ZodOptional<z.ZodObject<{
    publicSchoolRatingAvg: z.ZodOptional<z.ZodNumber>;
    studentTeacherRatio: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strip>>;
  fiscal: z.ZodObject<{
    statePensionFundedRatio: z.ZodNumber;
    fiscalTier: z.ZodEnum<{
      Resilient: "Resilient";
      Fragile: "Fragile";
      Distressed: "Distressed";
      Unknown: "Unknown";
    }>;
    taxCompetitivenessScore: z.ZodNumber;
  }, z.core.$strip>;
  amenities: z.ZodObject<{
    groceryStoreDensityPerCapita: z.ZodNumber;
    bigBoxStoreCount: z.ZodNumber;
    recreationAreaCount: z.ZodNumber;
    natureAreaCount: z.ZodNumber;
  }, z.core.$strip>;
  transportation: z.ZodOptional<z.ZodObject<{
    avgCommuteMinutes: z.ZodNumber;
    pctTransitCommute: z.ZodNumber;
    pctRemoteWork: z.ZodNumber;
    longCommutePct: z.ZodNumber;
  }, z.core.$strip>>;
  mobility: z.ZodOptional<z.ZodObject<{
    upwardMobilityScore: z.ZodNumber;
    mobilityPercentile: z.ZodNumber;
  }, z.core.$strip>>;
  healthOutcomes: z.ZodOptional<z.ZodObject<{
    lifeExpectancy: z.ZodNumber;
    adultObesityPct: z.ZodNumber;
    adultSmokingPct: z.ZodNumber;
    poorMentalHealthDays: z.ZodNumber;
    primaryCarePhysiciansPer100k: z.ZodNumber;
  }, z.core.$strip>>;
  walkability: z.ZodOptional<z.ZodObject<{
    walkabilityScore: z.ZodNumber;
    walkabilityUnweighted: z.ZodNumber;
    blockGroupCount: z.ZodNumber;
    totPop: z.ZodNumber;
  }, z.core.$strip>>;
  blended: z.ZodObject<{
    costScore0to50: z.ZodNumber;
    lifeScore0to50: z.ZodNumber;
    totalScore0to100: z.ZodNumber;
  }, z.core.$strip>;
  fiscalTier: z.ZodEnum<{
    Resilient: "Resilient";
    Fragile: "Fragile";
    Distressed: "Distressed";
    Unknown: "Unknown";
  }>;
  metricsProvenance: z.ZodRecord<z.ZodString, z.ZodObject<{
    source: z.ZodString;
    pulledAt: z.ZodString;
    license: z.ZodString;
    url: z.ZodString;
  }, z.core.$strip>>;
}, z.core.$strip>;
type Location = z.infer<typeof locationSchema>;
declare const statedPrioritySchema: z.ZodObject<{
  metric: z.ZodString;
  rank: z.ZodNumber;
  weight: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
type StatedPriority = z.infer<typeof statedPrioritySchema>;
declare const hardFilterSchema: z.ZodObject<{
  field: z.ZodString;
  operator: z.ZodEnum<{
    in: "in";
    lt: "lt";
    lte: "lte";
    gt: "gt";
    gte: "gte";
    eq: "eq";
    notIn: "notIn";
  }>;
  value: z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodArray<z.ZodString>]>;
  source: z.ZodEnum<{
    stated: "stated";
    revealed: "revealed";
  }>;
  confidence: z.ZodNumber;
  discoveredAt: z.ZodString;
}, z.core.$strip>;
type HardFilter = z.infer<typeof hardFilterSchema>;
declare const moveContextSchema: z.ZodObject<{
  isFirstMove: z.ZodOptional<z.ZodBoolean>;
  demographic: z.ZodOptional<z.ZodEnum<{
    young_professional: "young_professional";
    family_with_kids: "family_with_kids";
    retiree: "retiree";
    remote_worker: "remote_worker";
    low_income_mover: "low_income_mover";
    student: "student";
  }>>;
  moveDate: z.ZodOptional<z.ZodString>;
  destinationState: z.ZodOptional<z.ZodString>;
  originState: z.ZodOptional<z.ZodString>;
  hasPets: z.ZodOptional<z.ZodBoolean>;
  householdSize: z.ZodOptional<z.ZodNumber>;
  timelineUrgency: z.ZodOptional<z.ZodEnum<{
    exploring: "exploring";
    planning: "planning";
    urgent: "urgent";
  }>>;
}, z.core.$strip>;
type MoveContext = z.infer<typeof moveContextSchema>;
declare const userProfileSchema: z.ZodObject<{
  userId: z.ZodString;
  statedPriorities: z.ZodArray<z.ZodObject<{
    metric: z.ZodString;
    rank: z.ZodNumber;
    weight: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strip>>;
  revealedEmbeddingRef: z.ZodString;
  hardFilters: z.ZodArray<z.ZodObject<{
    field: z.ZodString;
    operator: z.ZodEnum<{
      in: "in";
      lt: "lt";
      lte: "lte";
      gt: "gt";
      gte: "gte";
      eq: "eq";
      notIn: "notIn";
    }>;
    value: z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodArray<z.ZodString>]>;
    source: z.ZodEnum<{
      stated: "stated";
      revealed: "revealed";
    }>;
    confidence: z.ZodNumber;
    discoveredAt: z.ZodString;
  }, z.core.$strip>>;
  softWeights: z.ZodRecord<z.ZodString, z.ZodNumber>;
  nonNegotiablesDiscovered: z.ZodArray<z.ZodString>;
  moveContext: z.ZodOptional<z.ZodObject<{
    isFirstMove: z.ZodOptional<z.ZodBoolean>;
    demographic: z.ZodOptional<z.ZodEnum<{
      young_professional: "young_professional";
      family_with_kids: "family_with_kids";
      retiree: "retiree";
      remote_worker: "remote_worker";
      low_income_mover: "low_income_mover";
      student: "student";
    }>>;
    moveDate: z.ZodOptional<z.ZodString>;
    destinationState: z.ZodOptional<z.ZodString>;
    originState: z.ZodOptional<z.ZodString>;
    hasPets: z.ZodOptional<z.ZodBoolean>;
    householdSize: z.ZodOptional<z.ZodNumber>;
    timelineUrgency: z.ZodOptional<z.ZodEnum<{
      exploring: "exploring";
      planning: "planning";
      urgent: "urgent";
    }>>;
  }, z.core.$strip>>;
  createdAt: z.ZodString;
  updatedAt: z.ZodString;
  elicitationRoundsCompleted: z.ZodNumber;
  implicitSignalCount: z.ZodNumber;
  dismissCounts: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
}, z.core.$strip>;
type UserProfile = z.infer<typeof userProfileSchema>;
declare const hardFilterProposalSchema: z.ZodObject<{
  locationId: z.ZodString;
  locationName: z.ZodString;
  dismissCount: z.ZodNumber;
}, z.core.$strip>;
type HardFilterProposal = z.infer<typeof hardFilterProposalSchema>;
declare const implicitSignalSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
  kind: z.ZodLiteral<"map_pan">;
  center: z.ZodObject<{
    lat: z.ZodNumber;
    lng: z.ZodNumber;
  }, z.core.$strip>;
  zoom: z.ZodNumber;
  ts: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  kind: z.ZodLiteral<"candidate_view">;
  locationId: z.ZodString;
  dwellMs: z.ZodNumber;
  ts: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  kind: z.ZodLiteral<"candidate_dismiss">;
  locationId: z.ZodString;
  dwellMs: z.ZodNumber;
  reason: z.ZodOptional<z.ZodString>;
  ts: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  kind: z.ZodLiteral<"candidate_save">;
  locationId: z.ZodString;
  ts: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  kind: z.ZodLiteral<"candidate_compare">;
  locationIds: z.ZodArray<z.ZodString>;
  ts: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  kind: z.ZodLiteral<"search_query">;
  query: z.ZodString;
  ts: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
  kind: z.ZodLiteral<"filter_apply">;
  filter: z.ZodRecord<z.ZodString, z.ZodUnknown>;
  ts: z.ZodString;
}, z.core.$strip>], "kind">;
type ImplicitSignal = z.infer<typeof implicitSignalSchema>;
declare const scoreRangeSchema: z.ZodObject<{
  min: z.ZodOptional<z.ZodNumber>;
  max: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
declare const scoreRequestSchema: z.ZodObject<{
  topK: z.ZodOptional<z.ZodNumber>;
  filters: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
    min: z.ZodOptional<z.ZodNumber>;
    max: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strip>>>;
}, z.core.$strip>;
type ScoreRequest = z.infer<typeof scoreRequestSchema>;
type ScoreRange = z.infer<typeof scoreRangeSchema>;
declare const topMatchSchema: z.ZodObject<{
  rank: z.ZodNumber;
  id: z.ZodString;
  name: z.ZodString;
  state: z.ZodString;
  matchScore: z.ZodNumber;
  subscores: z.ZodRecord<z.ZodString, z.ZodNumber>;
  trace: z.ZodArray<z.ZodString>;
  dataGaps: z.ZodArray<z.ZodString>;
  keyMetrics: z.ZodRecord<z.ZodString, z.ZodNumber>;
}, z.core.$strip>;
type TopMatch = z.infer<typeof topMatchSchema>;
declare const scoreResponseSchema: z.ZodObject<{
  totalScored: z.ZodNumber;
  passedFilters: z.ZodNumber;
  returned: z.ZodNumber;
  weights: z.ZodRecord<z.ZodString, z.ZodNumber>;
  topMatches: z.ZodArray<z.ZodObject<{
    rank: z.ZodNumber;
    id: z.ZodString;
    name: z.ZodString;
    state: z.ZodString;
    matchScore: z.ZodNumber;
    subscores: z.ZodRecord<z.ZodString, z.ZodNumber>;
    trace: z.ZodArray<z.ZodString>;
    dataGaps: z.ZodArray<z.ZodString>;
    keyMetrics: z.ZodRecord<z.ZodString, z.ZodNumber>;
  }, z.core.$strip>>;
}, z.core.$strip>;
type ScoreResponse = z.infer<typeof scoreResponseSchema>;
declare const viewportBoundsSchema: z.ZodObject<{
  north: z.ZodNumber;
  south: z.ZodNumber;
  east: z.ZodNumber;
  west: z.ZodNumber;
}, z.core.$strip>;
type ViewportBounds = z.infer<typeof viewportBoundsSchema>;
declare const viewportStatsResponseSchema: z.ZodObject<{
  count: z.ZodNumber;
  bounds: z.ZodObject<{
    north: z.ZodNumber;
    south: z.ZodNumber;
    east: z.ZodNumber;
    west: z.ZodNumber;
  }, z.core.$strip>;
  averages: z.ZodRecord<z.ZodString, z.ZodNumber>;
}, z.core.$strip>;
type ViewportStatsResponse = z.infer<typeof viewportStatsResponseSchema>;
declare const elicitationQuestionSchema: z.ZodObject<{
  id: z.ZodString;
  prompt: z.ZodString;
  options: z.ZodOptional<z.ZodArray<z.ZodObject<{
    value: z.ZodString;
    label: z.ZodString;
  }, z.core.$strip>>>;
  skippable: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
type ElicitationQuestion = z.infer<typeof elicitationQuestionSchema>;
declare const elicitationSessionSchema: z.ZodObject<{
  sessionId: z.ZodString;
  userId: z.ZodString;
  currentQuestion: z.ZodNullable<z.ZodObject<{
    id: z.ZodString;
    prompt: z.ZodString;
    options: z.ZodOptional<z.ZodArray<z.ZodObject<{
      value: z.ZodString;
      label: z.ZodString;
    }, z.core.$strip>>>;
    skippable: z.ZodDefault<z.ZodBoolean>;
  }, z.core.$strip>>;
  roundsCompleted: z.ZodNumber;
  status: z.ZodEnum<{
    active: "active";
    complete: "complete";
    abandoned: "abandoned";
  }>;
  createdAt: z.ZodString;
  updatedAt: z.ZodString;
}, z.core.$strip>;
type ElicitationSession = z.infer<typeof elicitationSessionSchema>;
declare const JOURNEY_PHASES: readonly ["discovery", "housing", "logistics", "settlement"];
type JourneyPhase = (typeof JOURNEY_PHASES)[number];
declare const journeyPreferencesSchema: z.ZodObject<{
  maxBudget: z.ZodOptional<z.ZodNumber>;
  householdSize: z.ZodOptional<z.ZodNumber>;
  employment: z.ZodOptional<z.ZodEnum<{
    student: "student";
    remote: "remote";
    hybrid: "hybrid";
    onsite: "onsite";
    retired: "retired";
    looking: "looking";
  }>>;
  demographics: z.ZodOptional<z.ZodObject<{
    ageRange: z.ZodOptional<z.ZodString>;
    hasChildren: z.ZodOptional<z.ZodBoolean>;
    schoolAgeChildren: z.ZodOptional<z.ZodNumber>;
  }, z.core.$strip>>;
  climatePreference: z.ZodOptional<z.ZodEnum<{
    warm: "warm";
    mild: "mild";
    four_seasons: "four_seasons";
    cold_tolerant: "cold_tolerant";
  }>>;
  priorities: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
}, z.core.$strip>;
type JourneyPreferences = z.infer<typeof journeyPreferencesSchema>;
declare const journeyTimelineTaskSchema: z.ZodObject<{
  id: z.ZodString;
  phase: z.ZodString;
  title: z.ZodString;
  description: z.ZodString;
  dueOffsetDays: z.ZodNumber;
  category: z.ZodEnum<{
    admin: "admin";
    housing: "housing";
    logistics: "logistics";
    research: "research";
    financial: "financial";
  }>;
  completed: z.ZodBoolean;
}, z.core.$strip>;
type JourneyTimelineTask = z.infer<typeof journeyTimelineTaskSchema>;
declare const journeyTimelineSchema: z.ZodObject<{
  moveDate: z.ZodOptional<z.ZodString>;
  tasks: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    phase: z.ZodString;
    title: z.ZodString;
    description: z.ZodString;
    dueOffsetDays: z.ZodNumber;
    category: z.ZodEnum<{
      admin: "admin";
      housing: "housing";
      logistics: "logistics";
      research: "research";
      financial: "financial";
    }>;
    completed: z.ZodBoolean;
  }, z.core.$strip>>;
}, z.core.$strip>;
type JourneyTimeline = z.infer<typeof journeyTimelineSchema>;
declare const journeyDecisionSchema: z.ZodObject<{
  timestamp: z.ZodString;
  type: z.ZodEnum<{
    shortlist: "shortlist";
    eliminate: "eliminate";
    compare: "compare";
    preference_update: "preference_update";
    phase_change: "phase_change";
  }>;
  description: z.ZodString;
  data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
type JourneyDecision = z.infer<typeof journeyDecisionSchema>;
declare const relocationJourneySchema: z.ZodObject<{
  userId: z.ZodNumber;
  shortlistedLocations: z.ZodArray<z.ZodString>;
  savedComparisons: z.ZodArray<z.ZodUnknown>;
  moveTimeline: z.ZodNullable<z.ZodObject<{
    moveDate: z.ZodOptional<z.ZodString>;
    tasks: z.ZodArray<z.ZodObject<{
      id: z.ZodString;
      phase: z.ZodString;
      title: z.ZodString;
      description: z.ZodString;
      dueOffsetDays: z.ZodNumber;
      category: z.ZodEnum<{
        admin: "admin";
        housing: "housing";
        logistics: "logistics";
        research: "research";
        financial: "financial";
      }>;
      completed: z.ZodBoolean;
    }, z.core.$strip>>;
  }, z.core.$strip>>;
  preferences: z.ZodObject<{
    maxBudget: z.ZodOptional<z.ZodNumber>;
    householdSize: z.ZodOptional<z.ZodNumber>;
    employment: z.ZodOptional<z.ZodEnum<{
      student: "student";
      remote: "remote";
      hybrid: "hybrid";
      onsite: "onsite";
      retired: "retired";
      looking: "looking";
    }>>;
    demographics: z.ZodOptional<z.ZodObject<{
      ageRange: z.ZodOptional<z.ZodString>;
      hasChildren: z.ZodOptional<z.ZodBoolean>;
      schoolAgeChildren: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    climatePreference: z.ZodOptional<z.ZodEnum<{
      warm: "warm";
      mild: "mild";
      four_seasons: "four_seasons";
      cold_tolerant: "cold_tolerant";
    }>>;
    priorities: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
  }, z.core.$strip>;
  decisionLog: z.ZodArray<z.ZodObject<{
    timestamp: z.ZodString;
    type: z.ZodEnum<{
      shortlist: "shortlist";
      eliminate: "eliminate";
      compare: "compare";
      preference_update: "preference_update";
      phase_change: "phase_change";
    }>;
    description: z.ZodString;
    data: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  }, z.core.$strip>>;
  completedTasks: z.ZodArray<z.ZodString>;
  currentPhase: z.ZodString;
  createdAt: z.ZodString;
  updatedAt: z.ZodString;
}, z.core.$strip>;
type RelocationJourney = z.infer<typeof relocationJourneySchema>;
//#endregion
//#region src/sanitize/sanitize.d.ts
/**
 * Escapes the five HTML metacharacters so a raw string can be safely
 * interpolated into an HTML template. Use this BEFORE substitution when a
 * user-controlled value lands inside a markup-shaped translation string.
 *
 * This is *not* a substitute for `sanitizeInlineHtml`: escape input, then
 * sanitise the resulting template — both layers run together in `tHtml`.
 */
declare function escapeHtml(value: string): string;
/**
 * Strict inline sanitiser. Use for short, mostly-text strings that may include
 * basic emphasis (`<strong>`, `<em>`, …) — e.g. the Journey suggestion banner
 * where a translated template embeds a user-controlled trip title.
 *
 * Drops every tag outside the inline allow-list, strips all attributes, and
 * blocks every URL scheme except http/https/mailto/tel via DOMPurify's
 * built-in URL allow-list.
 */
declare function sanitizeInlineHtml(html: string): string;
/**
 * Permissive rich-text sanitiser. Use when a surface legitimately renders a
 * prose document (lists, paragraphs, links). Keeps the same tag families as
 * the inline sanitiser plus block-level markup and anchors with safe attrs.
 */
declare function sanitizeRichTextHtml(html: string): string;
//#endregion
export { AIRTRAIL_KEY_MASK, Accommodation, AccommodationCreateRequest, AccommodationUpdateRequest, AdminFeatureToggleRequest, AdminInviteCreateRequest, AdminPermissionsRequest, AdminUserCreateRequest, Airport, AirportSearchQuery, AirtrailConnection, AirtrailFlight, AirtrailImport, AirtrailImportResult, AirtrailSettings, AirtrailStatus, AmenityProfile, Assignment, AssignmentCreateRequest, AssignmentMoveRequest, AssignmentParticipant, AssignmentParticipantsRequest, AssignmentPlace, AssignmentReorderRequest, AssignmentTimeRequest, AutoBackupSettingsRequest, BlendedScore, BookingImportConfirmRequest, BookingImportConfirmResponse, BookingImportPreviewItem, BookingImportPreviewResponse, BroadbandData, BucketListResponse, BudgetCreateItemRequest, BudgetCreateSettlementRequest, BudgetItem, BudgetItemMember, BudgetItemPayer, BudgetReorderCategoriesRequest, BudgetReorderItemsRequest, BudgetSettlement, BudgetToggleMemberPaidRequest, BudgetUpdateItemRequest, BudgetUpdateMembersRequest, BudgetUpdatePayersRequest, BudgetUpdateSettlementRequest, CONTINENT_MAP, COST_CATEGORIES, Category, CategoryListResponse, ChangePasswordRequest, ChannelTestResult, ClimateData, CollabMessageCreateRequest, CollabNoteCreateRequest, CollabNoteUpdateRequest, CollabPollCreateRequest, CollabPollVoteRequest, CollabReactionRequest, CostCategory, CostSummary, CreateBucketItemRequest, CreateCategoryRequest, CreateTagRequest, CrimeData, Day, DayCreateRequest, DayNote, DayNoteCreateRequest, DayNoteUpdateRequest, DayReorderRequest, DayUpdateRequest, DetailedWeatherQuery, EducationData, ElicitationQuestion, ElicitationSession, FileLinkRequest, FileUpdateRequest, FiscalProfile, FiscalTier, ForgotPasswordRequest, HardFilter, HardFilterProposal, HealthOutcomesData, HealthcareData, HourlyEntry, Id, ImplicitSignal, InAppListResult, JOURNEY_PHASES, JourneyAddTripRequest, JourneyContributorRequest, JourneyCreateRequest, JourneyDecision, JourneyPhase, JourneyPreferences, JourneyProviderPhotosRequest, JourneyReorderEntriesRequest, JourneyShareLinkRequest, JourneyTimeline, JourneyTimelineTask, Location, LoginRequest, MASKED_SETTING_VALUE, MapsAutocompleteRequest, MapsAutocompleteResult, MapsPlaceDetailsResult, MapsPlacePhotoResult, MapsResolveUrlRequest, MapsResolveUrlResult, MapsReverseQuery, MapsReverseResult, MapsSearchRequest, MapsSearchResult, MarkRegionRequest, McpTokenCreateRequest, MfaEnableRequest, MfaVerifyLoginRequest, MobilityData, MoveContext, NotificationRespondRequest, OauthClientCreateRequest, OauthConsentRequest, OauthTokenRequest, OidcCallbackQuery, OidcExchangeQuery, PackingBag, PackingBagMember, PackingBagMembersRequest, PackingCategoryAssigneesRequest, PackingCreateBagRequest, PackingCreateItemRequest, PackingImportRequest, PackingItem, PackingReorderRequest, PackingSaveTemplateRequest, PackingTemplateSummary, PackingTemplatesResponse, PackingUpdateBagRequest, PackingUpdateItemRequest, PaginationQuery, PhotoVariant, Place, PlaceBulkDeleteRequest, PlaceCategory, PlaceCreateRequest, PlaceImportListRequest, PlaceListQuery, PlaceUpdateRequest, PreferencesUpdateRequest, ProvenanceRef, PublicConfig, RegionGeo, RegisterRequest, RelocationJourney, Reservation, ReservationCreateRequest, ReservationEndpoint, ReservationPositionsRequest, ReservationUpdateRequest, ResetPasswordRequest, SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_CODES, ScoreRange, ScoreRequest, ScoreResponse, SettingUpsertRequest, SettingsBulkRequest, ShareLinkRequest, StatedPriority, SupportedLanguageCode, SystemNoticeDto, Tag, TagListResponse, TodoCategoryAssigneesRequest, TodoCreateItemRequest, TodoReorderRequest, TodoUpdateItemRequest, TopMatch, TransportationData, Trip, TripAddMemberRequest, TripCopyRequest, TripCreateRequest, TripMember, TripUpdateRequest, UnreadCountResult, UpdateBucketItemRequest, UpdateCategoryRequest, UpdateTagRequest, UserProfile, VacayAddHolidayCalendarRequest, VacayAddYearRequest, VacayCompanyHolidayRequest, VacayInviteActionRequest, VacayInviteRequest, VacayPlanData, VacaySetColorRequest, VacayToggleEntryRequest, VacayUpdateStatsRequest, ViewportBounds, ViewportStatsResponse, WalkabilityData, WeatherQuery, WeatherResult, accommodationCreateRequestSchema, accommodationSchema, accommodationUpdateRequestSchema, adminFeatureToggleRequestSchema, adminInviteCreateRequestSchema, adminPermissionsRequestSchema, adminUserCreateRequestSchema, airportSchema, airportSearchQuerySchema, airtrailConnectionSchema, airtrailFlightSchema, airtrailImportResultSchema, airtrailImportSchema, airtrailSettingsSchema, airtrailStatusSchema, amenityProfileSchema, assignmentCreateRequestSchema, assignmentMoveRequestSchema, assignmentParticipantSchema, assignmentParticipantsRequestSchema, assignmentPlaceSchema, assignmentReorderRequestSchema, assignmentSchema, assignmentTimeRequestSchema, autoBackupSettingsRequestSchema, blendedScoreSchema, bookingImportConfirmRequestSchema, bookingImportConfirmResponseSchema, bookingImportPreviewItemSchema, bookingImportPreviewResponseSchema, broadbandDataSchema, bucketItemSchema, bucketListResponseSchema, budgetCreateItemRequestSchema, budgetCreateSettlementRequestSchema, budgetItemMemberSchema, budgetItemPayerSchema, budgetItemSchema, budgetReorderCategoriesRequestSchema, budgetReorderItemsRequestSchema, budgetSettlementSchema, budgetToggleMemberPaidRequestSchema, budgetUpdateItemRequestSchema, budgetUpdateMembersRequestSchema, budgetUpdatePayersRequestSchema, budgetUpdateSettlementRequestSchema, categoryListResponseSchema, categorySchema, changePasswordRequestSchema, channelTestResultSchema, climateDataSchema, collabMessageCreateRequestSchema, collabNoteCreateRequestSchema, collabNoteUpdateRequestSchema, collabPollCreateRequestSchema, collabPollVoteRequestSchema, collabReactionRequestSchema, continentForCountry, costSummarySchema, createBucketItemRequestSchema, createCategoryRequestSchema, createTagRequestSchema, crimeDataSchema, dayCreateRequestSchema, dayNoteCreateRequestSchema, dayNoteSchema, dayNoteUpdateRequestSchema, dayReorderRequestSchema, daySchema, dayUpdateRequestSchema, detailedWeatherQuerySchema, educationDataSchema, elicitationQuestionSchema, elicitationSessionSchema, escapeHtml, fileLinkRequestSchema, fileUpdateRequestSchema, fiscalProfileSchema, fiscalTierSchema, forgotPasswordRequestSchema, getIntlLanguage, getLocaleForLanguage, hardFilterProposalSchema, hardFilterSchema, healthOutcomesDataSchema, healthcareDataSchema, hourlyEntrySchema, idParamSchema, idSchema, implicitSignalSchema, inAppListResultSchema, isRtlLanguage, isoDateTime, journeyAddTripRequestSchema, journeyContributorRequestSchema, journeyCreateRequestSchema, journeyDecisionSchema, journeyPreferencesSchema, journeyProviderPhotosRequestSchema, journeyReorderEntriesRequestSchema, journeyShareLinkRequestSchema, journeyTimelineSchema, journeyTimelineTaskSchema, locationSchema, loginRequestSchema, mapsAutocompleteRequestSchema, mapsAutocompleteResultSchema, mapsAutocompleteSuggestionSchema, mapsPlaceDetailsResultSchema, mapsPlacePhotoResultSchema, mapsResolveUrlRequestSchema, mapsResolveUrlResultSchema, mapsReverseQuerySchema, mapsReverseResultSchema, mapsSearchRequestSchema, mapsSearchResultSchema, markRegionRequestSchema, mcpTokenCreateRequestSchema, mfaEnableRequestSchema, mfaVerifyLoginRequestSchema, mobilityDataSchema, moveContextSchema, nonEmptyString, noticeDisplaySchema, noticeSeveritySchema, notificationRespondRequestSchema, notificationRowSchema, oauthClientCreateRequestSchema, oauthConsentRequestSchema, oauthTokenRequestSchema, oidcCallbackQuerySchema, oidcExchangeQuerySchema, packingBagMemberSchema, packingBagMembersRequestSchema, packingBagSchema, packingCategoryAssigneesRequestSchema, packingCreateBagRequestSchema, packingCreateItemRequestSchema, packingImportRequestSchema, packingItemSchema, packingReorderRequestSchema, packingSaveTemplateRequestSchema, packingTemplateSummarySchema, packingTemplatesResponseSchema, packingUpdateBagRequestSchema, packingUpdateItemRequestSchema, paginationQuerySchema, photoVariantSchema, placeBulkDeleteRequestSchema, placeCategorySchema, placeCreateRequestSchema, placeImportListRequestSchema, placeListQuerySchema, placeSchema, placeUpdateRequestSchema, preferencesUpdateRequestSchema, provenanceRefSchema, publicConfigSchema, regionGeoSchema, registerRequestSchema, relocationJourneySchema, reservationCreateRequestSchema, reservationEndpointSchema, reservationPositionsRequestSchema, reservationSchema, reservationUpdateRequestSchema, resetPasswordRequestSchema, sanitizeInlineHtml, sanitizeRichTextHtml, scoreRangeSchema, scoreRequestSchema, scoreResponseSchema, settingUpsertRequestSchema, settingsBulkRequestSchema, shareLinkRequestSchema, statedPrioritySchema, systemNoticeDtoSchema, tagListResponseSchema, tagSchema, testNtfyRequestSchema, testSmtpRequestSchema, testWebhookRequestSchema, todoCategoryAssigneesRequestSchema, todoCreateItemRequestSchema, todoReorderRequestSchema, todoUpdateItemRequestSchema, topMatchSchema, transportationDataSchema, tripAddMemberRequestSchema, tripCopyRequestSchema, tripCreateRequestSchema, tripMemberSchema, tripSchema, tripUpdateRequestSchema, typeToCostCategory, unreadCountResultSchema, updateBucketItemRequestSchema, updateCategoryRequestSchema, updateTagRequestSchema, userProfileSchema, vacayAddHolidayCalendarRequestSchema, vacayAddYearRequestSchema, vacayCompanyHolidayRequestSchema, vacayInviteActionRequestSchema, vacayInviteRequestSchema, vacayPlanDataSchema, vacaySetColorRequestSchema, vacayToggleEntryRequestSchema, vacayUpdateStatsRequestSchema, viewportBoundsSchema, viewportStatsResponseSchema, walkabilityDataSchema, weatherQuerySchema, weatherResultSchema };