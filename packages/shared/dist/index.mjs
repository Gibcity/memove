import { a as isRtlLanguage, i as getLocaleForLanguage, n as SUPPORTED_LANGUAGE_CODES, r as getIntlLanguage, t as SUPPORTED_LANGUAGES } from "./languages-CreX1-tq.mjs";
import { z } from "zod";
import DOMPurify from "isomorphic-dompurify";
//#region src/common/primitives.schema.ts
/**
* Primitive, domain-agnostic building blocks shared by every contract.
* Domain schemas (trips, places, ...) live in their own folders and reuse these.
*/
/** memove uses auto-increment integer primary keys. */
const idSchema = z.number().int().positive();
/**
* Numeric id coming from a URL param / query string. Express hands these over
* as strings, so we coerce, then enforce a positive integer.
*/
const idParamSchema = z.coerce.number().int().positive();
/** Non-empty, trimmed string. */
const nonEmptyString = z.string().trim().min(1);
/** ISO-8601 timestamp string (the shape memove serialises dates as in JSON). */
const isoDateTime = z.string().datetime({ offset: true });
//#endregion
//#region src/common/pagination.schema.ts
/**
* Generic pagination query helper. Individual endpoints opt in by extending
* this; it is NOT applied globally (many memove list endpoints return full sets).
* Defaults are conservative and only used where a route already paginates.
*/
const paginationQuerySchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	perPage: z.coerce.number().int().min(1).max(200).default(50)
});
//#endregion
//#region src/weather/weather.schema.ts
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
const weatherQuerySchema = z.object({
	lat: z.string().min(1),
	lng: z.string().min(1),
	date: z.string().min(1).optional(),
	lang: z.string().min(1).default("de")
});
/** Detailed weather requires a date (the Express route 400s without it). */
const detailedWeatherQuerySchema = weatherQuerySchema.extend({ date: z.string().min(1) });
const hourlyEntrySchema = z.object({
	hour: z.number(),
	temp: z.number(),
	precipitation: z.number(),
	precipitation_probability: z.number(),
	main: z.string(),
	wind: z.number(),
	humidity: z.number()
});
/**
* Weather response DTO. Fields are optional because the Express service emits
* different subsets depending on the request type (current / forecast / climate /
* detailed) and on error (`{ ..., error: 'no_forecast' }`).
*/
const weatherResultSchema = z.object({
	temp: z.number(),
	temp_max: z.number().optional(),
	temp_min: z.number().optional(),
	main: z.string(),
	description: z.string(),
	type: z.string(),
	sunrise: z.string().nullable().optional(),
	sunset: z.string().nullable().optional(),
	precipitation_sum: z.number().optional(),
	precipitation_probability_max: z.number().optional(),
	wind_max: z.number().optional(),
	hourly: z.array(hourlyEntrySchema).optional(),
	error: z.string().optional()
});
//#endregion
//#region src/airport/airport.schema.ts
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
const airportSchema = z.object({
	iata: z.string(),
	icao: z.string().nullable(),
	name: z.string(),
	city: z.string(),
	country: z.string(),
	lat: z.number(),
	lng: z.number(),
	tz: z.string()
});
/**
* Search query. `q` is optional — the route answers with `[]` when it is missing
* or empty rather than 400ing, so presence is handled in the controller.
*/
const airportSearchQuerySchema = z.object({ q: z.string().optional() });
//#endregion
//#region src/config/config.schema.ts
/**
* Public config contract — the unauthenticated /api/config endpoint.
*
* This is the only public (non-authenticated) endpoint in the L2 bundle: the
* login page reads it before a user signs in to pick the initial language. The
* legacy route (server/src/routes/publicConfig.ts) returns just the server's
* configured default language, so the response is intentionally minimal.
*/
const publicConfigSchema = z.object({ defaultLanguage: z.string() });
//#endregion
//#region src/system-notice/system-notice.schema.ts
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
const noticeDisplaySchema = z.enum([
	"modal",
	"banner",
	"toast"
]);
const noticeSeveritySchema = z.enum([
	"info",
	"warn",
	"critical"
]);
const noticeMediaSchema = z.object({
	src: z.string(),
	srcDark: z.string().optional(),
	altKey: z.string(),
	placement: z.enum(["hero", "inline"]).optional(),
	aspectRatio: z.string().optional()
});
const noticeHighlightSchema = z.object({
	labelKey: z.string(),
	iconName: z.string().optional()
});
/** Call-to-action: either a navigation link or an in-app action. */
const noticeCtaSchema = z.discriminatedUnion("kind", [z.object({
	kind: z.literal("nav"),
	labelKey: z.string(),
	href: z.string()
}), z.object({
	kind: z.literal("action"),
	labelKey: z.string(),
	actionId: z.string(),
	dismissOnAction: z.boolean().optional()
})]);
/** The client-facing notice (server-evaluated; conditions/versioning stripped). */
const systemNoticeDtoSchema = z.object({
	id: z.string(),
	display: noticeDisplaySchema,
	severity: noticeSeveritySchema,
	titleKey: z.string(),
	bodyKey: z.string(),
	bodyParams: z.record(z.string(), z.string()).optional(),
	icon: z.string().optional(),
	media: noticeMediaSchema.optional(),
	highlights: z.array(noticeHighlightSchema).optional(),
	cta: noticeCtaSchema.optional(),
	dismissible: z.boolean()
});
//#endregion
//#region src/maps/maps.schema.ts
/**
* Maps / geo API contract — single source of truth for the /api/maps endpoints.
*
* The legacy Express route (server/src/routes/maps.ts) is a thin layer over
* services/mapsService.ts, which talks to Nominatim/Overpass (and optionally
* Google Places when a key is configured) and applies the SSRF guard on every
* outbound URL. The place objects these return are provider-shaped and vary by
* source, so the response schemas keep them as open records — the contract pins
* down the request shapes and the stable envelope fields, not the provider blobs.
*
* The bespoke 400 validation messages and the per-endpoint kill-switch responses
* are reproduced in the controller, not derived from these schemas, so the bodies
* stay byte-identical to Express.
*/
const latLng = z.object({
	lat: z.number(),
	lng: z.number()
});
const mapsSearchRequestSchema = z.object({ query: z.string().min(1) });
const mapsAutocompleteRequestSchema = z.object({
	input: z.string().min(1).max(200),
	lang: z.string().optional(),
	locationBias: z.object({
		low: latLng,
		high: latLng
	}).optional()
});
const mapsReverseQuerySchema = z.object({
	lat: z.string().min(1),
	lng: z.string().min(1),
	lang: z.string().optional()
});
const mapsResolveUrlRequestSchema = z.object({ url: z.string().min(1) });
/** Provider-shaped place blob (Google/OSM fields differ); kept open by design. */
const placeRecord = z.record(z.string(), z.unknown());
const mapsSearchResultSchema = z.object({
	places: z.array(placeRecord),
	source: z.string()
});
const mapsAutocompleteSuggestionSchema = z.object({
	placeId: z.string(),
	mainText: z.string(),
	secondaryText: z.string()
});
const mapsAutocompleteResultSchema = z.object({
	suggestions: z.array(mapsAutocompleteSuggestionSchema),
	source: z.string()
});
const mapsPlaceDetailsResultSchema = z.object({
	place: placeRecord.nullable(),
	disabled: z.boolean().optional()
});
const mapsPlacePhotoResultSchema = z.object({
	photoUrl: z.string().nullable(),
	attribution: z.string().nullable().optional()
});
const mapsReverseResultSchema = z.object({
	name: z.string().nullable(),
	address: z.string().nullable()
});
const mapsResolveUrlResultSchema = z.object({
	lat: z.number(),
	lng: z.number(),
	name: z.string().nullable(),
	address: z.string().nullable()
});
//#endregion
//#region src/category/category.schema.ts
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
const categorySchema = z.object({
	id: z.number(),
	name: z.string(),
	color: z.string(),
	icon: z.string(),
	user_id: z.number().nullable().optional(),
	created_at: z.string().optional()
});
const createCategoryRequestSchema = z.object({
	name: z.string().min(1),
	color: z.string().optional(),
	icon: z.string().optional()
});
/** All fields optional — the service COALESCEs each against the stored value. */
const updateCategoryRequestSchema = z.object({
	name: z.string().optional(),
	color: z.string().optional(),
	icon: z.string().optional()
});
const categoryListResponseSchema = z.object({ categories: z.array(categorySchema) });
//#endregion
//#region src/tag/tag.schema.ts
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
const tagSchema = z.object({
	id: z.number(),
	user_id: z.number(),
	name: z.string(),
	color: z.string(),
	created_at: z.string().optional()
});
const createTagRequestSchema = z.object({
	name: z.string().min(1),
	color: z.string().optional()
});
/** Both fields optional — the service COALESCEs each against the stored value. */
const updateTagRequestSchema = z.object({
	name: z.string().optional(),
	color: z.string().optional()
});
const tagListResponseSchema = z.object({ tags: z.array(tagSchema) });
//#endregion
//#region src/notification/notification.schema.ts
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
const preferencesUpdateRequestSchema = z.record(z.string(), z.record(z.string(), z.boolean()));
const testSmtpRequestSchema = z.object({ email: z.string().optional() });
const testWebhookRequestSchema = z.object({ url: z.string().optional() });
const testNtfyRequestSchema = z.object({
	topic: z.string().optional(),
	server: z.string().optional(),
	token: z.string().optional()
});
/** Result of a channel test ping. */
const channelTestResultSchema = z.object({
	success: z.boolean(),
	error: z.string().optional()
});
/** Respond to a boolean (yes/no) notification. */
const notificationRespondRequestSchema = z.object({ response: z.enum(["positive", "negative"]) });
/** A single in-app notification row (DB-shaped; kept open). */
const notificationRowSchema = z.record(z.string(), z.unknown());
const inAppListResultSchema = z.object({
	notifications: z.array(notificationRowSchema),
	total: z.number(),
	unread_count: z.number()
});
const unreadCountResultSchema = z.object({ count: z.number() });
//#endregion
//#region src/atlas/atlas.schema.ts
/**
* Atlas API contract — single source of truth for the /api/addons/atlas endpoints
* (visited countries/regions, region GeoJSON, and the travel bucket list).
*
* Parity note: unlike the journey addon, the legacy atlas route is NOT gated by
* an addon-enabled check (app.ts mounts it without one), so the migration does
* not add a gate either — adding one would be a breaking 404.
*
* Stats, visited-regions and GeoJSON are wide, externally-derived shapes kept as
* open records; the request schemas and the bespoke 400/404 controller messages
* pin the parts the client depends on.
*/
const open$4 = z.record(z.string(), z.unknown());
const markRegionRequestSchema = z.object({
	name: z.string().min(1),
	country_code: z.string().min(1)
});
const createBucketItemRequestSchema = z.object({
	name: z.string().min(1),
	lat: z.number().nullable().optional(),
	lng: z.number().nullable().optional(),
	country_code: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	target_date: z.string().nullable().optional()
});
const updateBucketItemRequestSchema = z.object({
	name: z.string().optional(),
	notes: z.string().optional(),
	lat: z.number().nullable().optional(),
	lng: z.number().nullable().optional(),
	country_code: z.string().nullable().optional(),
	target_date: z.string().nullable().optional()
});
/** A bucket-list item row (DB-shaped; kept open). */
const bucketItemSchema = open$4;
const bucketListResponseSchema = z.object({ items: z.array(bucketItemSchema) });
/** GeoJSON FeatureCollection (kept open — provider-derived geometry). */
const regionGeoSchema = z.object({
	type: z.literal("FeatureCollection"),
	features: z.array(z.unknown())
});
/**
* ISO 3166-1 alpha-2 country code → continent. Single source of truth for the
* Atlas continent breakdown, used by the server (stats aggregation) and the
* client (keeping the per-continent counts in sync on optimistic mark/unmark).
*/
const CONTINENT_MAP = {
	AF: "Asia",
	AL: "Europe",
	DZ: "Africa",
	AD: "Europe",
	AO: "Africa",
	AR: "South America",
	AM: "Asia",
	AU: "Oceania",
	AT: "Europe",
	AZ: "Asia",
	BA: "Europe",
	BD: "Asia",
	BF: "Africa",
	BH: "Asia",
	BI: "Africa",
	BJ: "Africa",
	BN: "Asia",
	BO: "South America",
	BR: "South America",
	BE: "Europe",
	BG: "Europe",
	BW: "Africa",
	CA: "North America",
	CD: "Africa",
	CG: "Africa",
	CI: "Africa",
	CL: "South America",
	CM: "Africa",
	CN: "Asia",
	CO: "South America",
	CR: "North America",
	CU: "North America",
	CV: "Africa",
	CY: "Europe",
	HR: "Europe",
	CZ: "Europe",
	DJ: "Africa",
	DK: "Europe",
	DO: "North America",
	EC: "South America",
	EG: "Africa",
	EE: "Europe",
	ER: "Africa",
	ET: "Africa",
	FI: "Europe",
	FR: "Europe",
	DE: "Europe",
	GE: "Asia",
	GH: "Africa",
	GN: "Africa",
	GR: "Europe",
	GT: "North America",
	HN: "North America",
	HT: "North America",
	HU: "Europe",
	IS: "Europe",
	IN: "Asia",
	ID: "Asia",
	IR: "Asia",
	IQ: "Asia",
	IE: "Europe",
	IL: "Asia",
	IT: "Europe",
	JM: "North America",
	JO: "Asia",
	JP: "Asia",
	KE: "Africa",
	KG: "Asia",
	KH: "Asia",
	KR: "Asia",
	KW: "Asia",
	KZ: "Asia",
	LA: "Asia",
	LB: "Asia",
	LK: "Asia",
	LV: "Europe",
	LT: "Europe",
	LU: "Europe",
	LY: "Africa",
	MA: "Africa",
	MD: "Europe",
	ME: "Europe",
	MG: "Africa",
	MK: "Europe",
	ML: "Africa",
	MM: "Asia",
	MN: "Asia",
	MR: "Africa",
	MT: "Europe",
	MU: "Africa",
	MV: "Asia",
	MW: "Africa",
	MY: "Asia",
	MX: "North America",
	MZ: "Africa",
	NA: "Africa",
	NE: "Africa",
	NI: "North America",
	NL: "Europe",
	NP: "Asia",
	NZ: "Oceania",
	NO: "Europe",
	OM: "Asia",
	PA: "North America",
	PG: "Oceania",
	PK: "Asia",
	PE: "South America",
	PH: "Asia",
	PL: "Europe",
	PS: "Asia",
	PT: "Europe",
	PY: "South America",
	QA: "Asia",
	RO: "Europe",
	RU: "Europe",
	RW: "Africa",
	SA: "Asia",
	SC: "Africa",
	SD: "Africa",
	SG: "Asia",
	SI: "Europe",
	SK: "Europe",
	SN: "Africa",
	SO: "Africa",
	RS: "Europe",
	SV: "North America",
	SY: "Asia",
	TG: "Africa",
	TJ: "Asia",
	TM: "Asia",
	TN: "Africa",
	TT: "North America",
	TW: "Asia",
	TZ: "Africa",
	ZA: "Africa",
	SE: "Europe",
	CH: "Europe",
	TH: "Asia",
	TR: "Europe",
	UA: "Europe",
	UG: "Africa",
	UY: "South America",
	UZ: "Asia",
	VE: "South America",
	AE: "Asia",
	GB: "Europe",
	US: "North America",
	VN: "Asia",
	XK: "Europe",
	YE: "Asia",
	ZM: "Africa",
	ZW: "Africa",
	NG: "Africa",
	HK: "Asia",
	MO: "Asia",
	SM: "Europe",
	VA: "Europe",
	MC: "Europe",
	LI: "Europe",
	GI: "Europe",
	PR: "North America"
};
/** Continent for an ISO alpha-2 country code; 'Other' when unknown. */
function continentForCountry(code) {
	if (!code) return "Other";
	return CONTINENT_MAP[code.toUpperCase()] || "Other";
}
//#endregion
//#region src/vacay/vacay.schema.ts
/**
* Vacay API contract — single source of truth for the /api/addons/vacay endpoints
* (shared vacation-day planner: plan, holiday calendars, members/invites, years,
* entries, stats, public-holiday lookups).
*
* Parity note: like atlas, the legacy vacay route is NOT addon-gated at the mount
* (app.ts), so the migration adds no gate. Plan/entry/stats shapes are wide and
* DB-derived, so the response schemas stay open records; the request schemas and
* the bespoke 400/403/404/502 controller messages pin the client-facing parts.
*
* Many mutations carry an `X-Socket-Id` header that the services use to suppress
* the echo broadcast to the originating client — it is forwarded unchanged.
*/
const open$3 = z.record(z.string(), z.unknown());
const vacayAddHolidayCalendarRequestSchema = z.object({
	region: z.string().min(1),
	label: z.string().nullable().optional(),
	color: z.string().optional(),
	sort_order: z.number().optional()
});
const vacaySetColorRequestSchema = z.object({
	color: z.string().optional(),
	target_user_id: z.union([z.number(), z.string()]).optional()
});
const vacayInviteRequestSchema = z.object({ user_id: z.union([z.number(), z.string()]) });
const vacayInviteActionRequestSchema = z.object({ plan_id: z.number().optional() });
const vacayAddYearRequestSchema = z.object({ year: z.union([z.number(), z.string()]) });
const vacayToggleEntryRequestSchema = z.object({
	date: z.string().min(1),
	target_user_id: z.union([z.number(), z.string()]).optional()
});
const vacayCompanyHolidayRequestSchema = z.object({
	date: z.string(),
	note: z.string().optional()
});
const vacayUpdateStatsRequestSchema = z.object({
	vacation_days: z.number().optional(),
	target_user_id: z.union([z.number(), z.string()]).optional()
});
/** Plan / entries / stats payloads are wide and DB-derived; kept open. */
const vacayPlanDataSchema = open$3;
//#endregion
//#region src/packing/packing.schema.ts
/**
* Packing API contract — single source of truth for the
* /api/trips/:tripId/packing endpoints (items, bags, templates, assignees).
*
* Trip-scoped: every endpoint verifies trip access (404 "Trip not found") and
* mutations additionally check the 'packing_edit' permission (403 "No
* permission"). The legacy route (server/src/routes/packing.ts) wraps
* services/packingService.ts; rows are DB-shaped and kept as open records here.
* Mutations broadcast over WebSocket using the forwarded X-Socket-Id.
*/
const open$2 = z.record(z.string(), z.unknown());
/**
* Packing item entity as returned by the packing endpoints
* (server/src/services/packingService.ts -> SELECT * FROM packing_items).
* `checked` is the raw SQLite INTEGER (0/1). Columns match the packing_items
* table (see server DB): weight_grams/bag_id are nullable, quantity defaults 1.
*/
const packingItemSchema = z.object({
	id: z.number(),
	trip_id: z.number(),
	name: z.string(),
	checked: z.number(),
	category: z.string().nullable().optional(),
	sort_order: z.number(),
	weight_grams: z.number().nullable().optional(),
	bag_id: z.number().nullable().optional(),
	quantity: z.number().optional(),
	created_at: z.string().optional()
});
/**
* Packing bag member embedded on a bag (server packingService -> listBags).
* `avatar` is the resolved avatar URL.
*/
const packingBagMemberSchema = z.object({
	user_id: z.number(),
	username: z.string(),
	avatar: z.string().nullable().optional()
});
/**
* Packing bag entity (server packingService -> listBags). Columns of the
* packing_bags table plus the embedded `members` array (and the optional
* `assigned_username` join present on updateBag).
*/
const packingBagSchema = z.object({
	id: z.number(),
	trip_id: z.number(),
	name: z.string(),
	color: z.string(),
	weight_limit_grams: z.number().nullable().optional(),
	sort_order: z.number(),
	user_id: z.number().nullable().optional(),
	assigned_username: z.string().nullable().optional(),
	created_at: z.string().optional(),
	members: z.array(packingBagMemberSchema).optional()
});
const packingCreateItemRequestSchema = z.object({
	name: z.string().min(1),
	category: z.string().optional(),
	checked: z.boolean().optional()
});
const packingUpdateItemRequestSchema = z.object({
	name: z.string().optional(),
	checked: z.boolean().optional(),
	category: z.string().optional(),
	weight_grams: z.number().nullable().optional(),
	bag_id: z.number().nullable().optional(),
	quantity: z.number().optional()
});
const packingImportRequestSchema = z.object({ items: z.array(open$2) });
const packingReorderRequestSchema = z.object({ orderedIds: z.array(z.number()) });
const packingCreateBagRequestSchema = z.object({
	name: z.string().min(1),
	color: z.string().optional()
});
const packingUpdateBagRequestSchema = z.object({
	name: z.string().optional(),
	color: z.string().optional(),
	weight_limit_grams: z.number().nullable().optional(),
	user_id: z.number().nullable().optional()
});
const packingBagMembersRequestSchema = z.object({ user_ids: z.array(z.number()) });
const packingSaveTemplateRequestSchema = z.object({ name: z.string().min(1) });
const packingTemplateSummarySchema = z.object({
	id: z.number(),
	name: z.string(),
	item_count: z.number()
});
const packingTemplatesResponseSchema = z.object({ templates: z.array(packingTemplateSummarySchema) });
const packingCategoryAssigneesRequestSchema = z.object({ user_ids: z.array(z.number()) });
//#endregion
//#region src/todo/todo.schema.ts
/**
* To-do API contract — single source of truth for the /api/trips/:tripId/todo
* endpoints (trip task list with categories + assignees).
*
* Trip-scoped like packing: every endpoint verifies trip access (404 "Trip not
* found") and mutations check the same 'packing_edit' permission the legacy route
* uses (403 "No permission"). Rows are DB-shaped and kept open. Mutations
* broadcast over WebSocket with the forwarded X-Socket-Id.
*/
const todoCreateItemRequestSchema = z.object({
	name: z.string().min(1),
	category: z.string().optional(),
	due_date: z.string().optional(),
	description: z.string().optional(),
	assigned_user_id: z.number().optional(),
	priority: z.number().optional()
});
const todoUpdateItemRequestSchema = z.object({
	name: z.string().optional(),
	checked: z.boolean().optional(),
	category: z.string().optional(),
	due_date: z.string().optional(),
	description: z.string().optional(),
	assigned_user_id: z.number().optional(),
	priority: z.number().optional()
});
const todoReorderRequestSchema = z.object({ orderedIds: z.array(z.number()) });
const todoCategoryAssigneesRequestSchema = z.object({ user_ids: z.array(z.number()) });
//#endregion
//#region src/budget/budget.schema.ts
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
const budgetItemMemberSchema = z.object({
	user_id: z.number(),
	paid: z.number(),
	username: z.string(),
	avatar_url: z.string().nullable().optional(),
	avatar: z.string().nullable().optional(),
	budget_item_id: z.number().optional()
});
/**
* The fixed "Costs" expense categories. Unlike the old budget, users cannot
* create their own categories — every expense maps to one of these keys. The
* label/icon/colour per key live in the client; the server only stores the key.
* Pre-rework rows used free-text categories; those are shown as `other`.
*/
const COST_CATEGORIES = [
	"accommodation",
	"food",
	"groceries",
	"transport",
	"flights",
	"activities",
	"sightseeing",
	"shopping",
	"fees",
	"health",
	"tips",
	"other"
];
/**
* Maps a reservation `type` (flight, train, hotel, …) to one of the fixed Costs
* categories, so an expense created from a booking lands in the right bucket
* instead of a free-text/localized label. Unknown types fall back to `other`.
*/
const RESERVATION_TYPE_TO_COST_CATEGORY = {
	flight: "flights",
	plane: "flights",
	train: "transport",
	bus: "transport",
	car: "transport",
	"car-rental": "transport",
	ferry: "transport",
	boat: "transport",
	taxi: "transport",
	transfer: "transport",
	transport: "transport",
	hotel: "accommodation",
	accommodation: "accommodation",
	lodging: "accommodation",
	restaurant: "food",
	activity: "activities"
};
function typeToCostCategory(type) {
	if (!type) return "other";
	return RESERVATION_TYPE_TO_COST_CATEGORY[type.trim().toLowerCase()] || "other";
}
/**
* One payer of an expense — a row of budget_item_payers. `amount` is in the
* expense's own currency (budget_items.currency). Several payers can split who
* actually paid one bill. Username/avatar are joined for display.
*/
const budgetItemPayerSchema = z.object({
	user_id: z.number(),
	amount: z.number(),
	username: z.string().optional(),
	avatar_url: z.string().nullable().optional(),
	avatar: z.string().nullable().optional(),
	budget_item_id: z.number().optional()
});
/**
* Budget item entity as returned by the budget list/create/update endpoints
* (server/src/services/budgetService.ts). Columns of the `budget_items` table
* plus the embedded `members` (equal-split participants) and `payers` arrays.
* total_price is the sum of payer amounts in `currency`; `exchange_rate` converts
* that to the trip base currency (NULL currency + rate 1 = base currency).
*/
const budgetItemSchema = z.object({
	id: z.number(),
	trip_id: z.number(),
	category: z.string(),
	name: z.string(),
	total_price: z.number(),
	currency: z.string().nullable().optional(),
	exchange_rate: z.number().optional(),
	persons: z.number().nullable().optional(),
	days: z.number().nullable().optional(),
	note: z.string().nullable().optional(),
	reservation_id: z.number().nullable().optional(),
	paid_by_user_id: z.number().nullable().optional(),
	expense_date: z.string().nullable().optional(),
	sort_order: z.number().optional(),
	created_at: z.string().optional(),
	members: z.array(budgetItemMemberSchema).optional(),
	payers: z.array(budgetItemPayerSchema).optional()
});
const payerInputSchema = z.object({
	user_id: z.number(),
	amount: z.number()
});
const budgetCreateItemRequestSchema = z.object({
	name: z.string().min(1),
	category: z.string().optional(),
	total_price: z.number().optional(),
	currency: z.string().nullable().optional(),
	exchange_rate: z.number().optional(),
	payers: z.array(payerInputSchema).optional(),
	member_ids: z.array(z.number()).optional(),
	persons: z.number().nullable().optional(),
	days: z.number().nullable().optional(),
	note: z.string().nullable().optional(),
	expense_date: z.string().nullable().optional(),
	reservation_id: z.number().optional()
});
/** Update accepts the same fields plus total_price changes; all optional. */
const budgetUpdateItemRequestSchema = z.object({
	name: z.string().optional(),
	category: z.string().optional(),
	total_price: z.number().optional(),
	currency: z.string().nullable().optional(),
	exchange_rate: z.number().optional(),
	payers: z.array(payerInputSchema).optional(),
	member_ids: z.array(z.number()).optional(),
	persons: z.number().nullable().optional(),
	days: z.number().nullable().optional(),
	note: z.string().nullable().optional(),
	expense_date: z.string().nullable().optional()
});
/** Replace the explicit payers of an expense (amounts in expense currency). */
const budgetUpdatePayersRequestSchema = z.object({ payers: z.array(payerInputSchema) });
/**
* A persisted settle-up transfer (budget_settlements row): "from paid to" a
* given amount in the trip base currency. Creating one marks a suggested flow as
* paid; deleting it (undo) brings the flow back. Names joined for display.
*/
const budgetSettlementSchema = z.object({
	id: z.number(),
	trip_id: z.number(),
	from_user_id: z.number(),
	to_user_id: z.number(),
	amount: z.number(),
	created_at: z.string().optional(),
	created_by_user_id: z.number().nullable().optional(),
	from_username: z.string().optional(),
	from_avatar_url: z.string().nullable().optional(),
	to_username: z.string().optional(),
	to_avatar_url: z.string().nullable().optional()
});
const budgetCreateSettlementRequestSchema = z.object({
	from_user_id: z.number(),
	to_user_id: z.number(),
	amount: z.number()
});
/** Edit a persisted settle-up transfer (same fields as create; full replace). */
const budgetUpdateSettlementRequestSchema = z.object({
	from_user_id: z.number(),
	to_user_id: z.number(),
	amount: z.number()
});
const budgetUpdateMembersRequestSchema = z.object({ user_ids: z.array(z.number()) });
const budgetToggleMemberPaidRequestSchema = z.object({ paid: z.boolean() });
const budgetReorderItemsRequestSchema = z.object({ orderedIds: z.array(z.number()) });
const budgetReorderCategoriesRequestSchema = z.object({ orderedCategories: z.array(z.string()) });
//#endregion
//#region src/reservation/reservation.schema.ts
/**
* Reservation + accommodation API contract — single source of truth for the
* /api/trips/:tripId/reservations and /api/trips/:tripId/accommodations endpoints.
*
* Trip-scoped. Reservations use the 'reservation_edit' permission; accommodations
* use 'day_edit' (they live in the day/accommodation service). The legacy routes
* (server/src/routes/reservations.ts + the accommodations sub-router in
* routes/days.ts) carry several side effects — auto-creating/updating/deleting a
* linked budget item, accommodation broadcasts and booking notifications — which
* the Nest service reproduces 1:1. Reservation bodies are wide and provider-ish,
* so the create/update payloads stay mostly open with `title` pinned.
*/
const open$1 = z.record(z.string(), z.unknown());
/**
* A reservation endpoint (flight/train leg terminal) — row of the
* reservation_endpoints table (server/src/services/reservationService.ts).
*/
const reservationEndpointSchema = z.object({
	id: z.number().optional(),
	reservation_id: z.number().optional(),
	role: z.enum([
		"from",
		"to",
		"stop"
	]),
	sequence: z.number(),
	name: z.string(),
	code: z.string().nullable(),
	lat: z.number(),
	lng: z.number(),
	timezone: z.string().nullable(),
	local_time: z.string().nullable(),
	local_date: z.string().nullable()
});
/**
* Reservation entity as returned by the reservation list endpoint
* (server/src/services/reservationService.ts -> listReservations). Columns of
* the `reservations` table plus the joined day_number / place_name / linked
* accommodation fields and the computed `day_positions` + `endpoints`.
* `accommodation_id` is stored as TEXT in the DB.
*/
const reservationSchema = z.object({
	id: z.number(),
	trip_id: z.number(),
	day_id: z.number().nullable().optional(),
	end_day_id: z.number().nullable().optional(),
	place_id: z.number().nullable().optional(),
	assignment_id: z.number().nullable().optional(),
	title: z.string(),
	reservation_time: z.string().nullable().optional(),
	reservation_end_time: z.string().nullable().optional(),
	location: z.string().nullable().optional(),
	confirmation_number: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	status: z.string(),
	type: z.string(),
	accommodation_id: z.union([z.number(), z.string()]).nullable().optional(),
	metadata: z.string().nullable().optional(),
	needs_review: z.number().optional(),
	day_plan_position: z.number().nullable().optional(),
	created_at: z.string().optional(),
	external_source: z.string().nullable().optional(),
	external_id: z.string().nullable().optional(),
	external_owner_user_id: z.number().nullable().optional(),
	external_synced_at: z.string().nullable().optional(),
	sync_enabled: z.number().nullable().optional(),
	day_number: z.number().nullable().optional(),
	place_name: z.string().nullable().optional(),
	accommodation_place_id: z.number().nullable().optional(),
	accommodation_name: z.string().nullable().optional(),
	accommodation_start_day_id: z.number().nullable().optional(),
	accommodation_end_day_id: z.number().nullable().optional(),
	day_positions: z.record(z.string(), z.number()).nullable().optional(),
	endpoints: z.array(reservationEndpointSchema).optional()
});
/**
* Accommodation entity as returned by listAccommodations / getAccommodationWithPlace
* (server/src/services/dayService.ts). Columns of the day_accommodations table
* plus the joined place fields and (on list) the linked reservation_title.
*/
const accommodationSchema = z.object({
	id: z.number(),
	trip_id: z.number(),
	place_id: z.number().nullable().optional(),
	start_day_id: z.number(),
	end_day_id: z.number(),
	check_in: z.string().nullable().optional(),
	check_in_end: z.string().nullable().optional(),
	check_out: z.string().nullable().optional(),
	confirmation: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	created_at: z.string().optional(),
	place_name: z.string().nullable().optional(),
	place_address: z.string().nullable().optional(),
	place_image: z.string().nullable().optional(),
	place_lat: z.number().nullable().optional(),
	place_lng: z.number().nullable().optional(),
	reservation_title: z.string().nullable().optional()
});
/** Reservation create: title is required; the many optional fields stay open. */
const reservationCreateRequestSchema = open$1.and(z.object({ title: z.string().min(1) }));
const reservationUpdateRequestSchema = open$1;
const reservationPositionsRequestSchema = z.object({
	positions: z.array(z.object({
		id: z.number(),
		day_plan_position: z.number()
	})),
	day_id: z.union([z.number(), z.string()]).nullable().optional()
});
const accommodationCreateRequestSchema = z.object({
	place_id: z.union([z.number(), z.string()]),
	start_day_id: z.union([z.number(), z.string()]),
	end_day_id: z.union([z.number(), z.string()]),
	check_in: z.string().nullable().optional(),
	check_in_end: z.string().nullable().optional(),
	check_out: z.string().nullable().optional(),
	confirmation: z.string().nullable().optional(),
	notes: z.string().nullable().optional()
});
const accommodationUpdateRequestSchema = open$1;
const bookingImportEndpointSchema = z.object({
	role: z.enum([
		"from",
		"to",
		"stop"
	]),
	sequence: z.number(),
	name: z.string(),
	code: z.string().nullable(),
	lat: z.number(),
	lng: z.number(),
	timezone: z.string().nullable(),
	local_time: z.string().nullable(),
	local_date: z.string().nullable()
});
const bookingImportVenueSchema = z.object({
	name: z.string(),
	lat: z.number().optional(),
	lng: z.number().optional(),
	address: z.string().optional(),
	website: z.string().optional(),
	phone: z.string().optional()
});
const bookingImportAccommodationSchema = z.object({
	check_in: z.string().optional(),
	check_out: z.string().optional(),
	confirmation: z.string().optional()
});
const bookingImportPreviewItemSchema = z.object({
	type: z.string(),
	title: z.string().min(1),
	reservation_time: z.string().nullable().optional(),
	reservation_end_time: z.string().nullable().optional(),
	confirmation_number: z.string().nullable().optional(),
	location: z.string().nullable().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
	endpoints: z.array(bookingImportEndpointSchema).optional(),
	needs_review: z.boolean().optional(),
	_venue: bookingImportVenueSchema.optional(),
	_accommodation: bookingImportAccommodationSchema.optional(),
	source: z.object({
		fileName: z.string(),
		index: z.number()
	})
});
const bookingImportPreviewResponseSchema = z.object({
	items: z.array(bookingImportPreviewItemSchema),
	warnings: z.array(z.string())
});
const bookingImportConfirmRequestSchema = z.object({ items: z.array(bookingImportPreviewItemSchema).min(1) });
const bookingImportConfirmResponseSchema = z.object({ created: z.array(reservationSchema) });
//#endregion
//#region src/airtrail/airtrail.schema.ts
/**
* AirTrail integration contracts (#214).
*
* AirTrail is a self-hosted flight tracker (github.com/johanohly/AirTrail).
* The connection is per-user (Settings → Integrations); the global on/off is the
* `airtrail` addon. Each user stores their instance URL + a personal Bearer API
* key, which only ever exposes that user's own flights.
*/
/** Placeholder the server returns instead of the real key once one is stored. */
const AIRTRAIL_KEY_MASK = "••••••••";
const airtrailSettingsSchema = z.object({
	/** Instance origin, e.g. https://flights.example.com — memove appends /api itself. */
	url: z.string().trim().max(2048),
	/** Bearer API key. Omitted / blank / the mask keeps the stored key unchanged. */
	apiKey: z.string().max(512).optional(),
	/** Allow self-signed TLS certs (common on LAN instances). */
	allowInsecureTls: z.boolean().optional().default(false),
	/**
	* Opt in to writing memove edits back to AirTrail (#1240). Off by default:
	* AirTrail is the source of truth and memove only reads from it.
	*/
	writeEnabled: z.boolean().optional().default(false)
});
const airtrailConnectionSchema = z.object({
	url: z.string(),
	apiKeyMasked: z.string(),
	allowInsecureTls: z.boolean(),
	writeEnabled: z.boolean(),
	connected: z.boolean()
});
const airtrailStatusSchema = z.object({
	connected: z.boolean(),
	flightCount: z.number().optional(),
	error: z.string().optional()
});
/** A normalized AirTrail flight as surfaced to the import picker. */
const airtrailFlightSchema = z.object({
	id: z.string(),
	fromCode: z.string().nullable(),
	fromName: z.string().nullable(),
	toCode: z.string().nullable(),
	toName: z.string().nullable(),
	date: z.string().nullable(),
	departure: z.string().nullable(),
	arrival: z.string().nullable(),
	airline: z.string().nullable(),
	flightNumber: z.string().nullable(),
	aircraft: z.string().nullable(),
	seatClass: z.string().nullable()
});
const airtrailImportSchema = z.object({ flightIds: z.array(z.string()).min(1, "Select at least one flight") });
/** Per-flight outcome of an import (so the picker can show what was skipped). */
const airtrailImportResultSchema = z.object({
	imported: z.array(z.string()),
	skipped: z.array(z.object({
		flightId: z.string(),
		reason: z.enum([
			"already-imported",
			"already-in-trip",
			"invalid"
		]),
		detail: z.string().optional()
	}))
});
//#endregion
//#region src/place/place.schema.ts
/**
* Place API contract — single source of truth for the /api/trips/:tripId/places
* endpoints (place pool CRUD, GPX/map/list imports, image search, bulk delete).
*
* Trip-scoped; mutations use the 'place_edit' permission. The legacy route
* (server/src/routes/places.ts) wraps placeService and fires the journey
* place-created/updated/deleted hooks. Place rows are wide and provider-derived,
* so create/update payloads stay mostly open with `name` pinned; string fields
* are capped (name 200, description 2000, address 500, notes 2000) by the legacy
* validateStringLengths, reproduced in the controller.
*/
const open = z.record(z.string(), z.unknown());
/**
* Embedded category as returned on a place — a trimmed projection of the
* categories row (id/name/color/icon), built inline by placeService and
* getPlaceWithTags. `null` when the place has no category_id.
*/
const placeCategorySchema = z.object({
	id: z.number(),
	name: z.string().nullable(),
	color: z.string().nullable(),
	icon: z.string().nullable()
}).nullable();
/**
* Full place entity as returned by the place list / get / create / update
* endpoints (server/src/services/placeService.ts -> getPlaceWithTags). All
* columns of the `places` table (see server/data DB) plus the joined `category`
* projection and `tags` array. Numbers (lat/lng/price) are SQLite REAL, ids are
* INTEGER; provider-derived columns are nullable.
*/
const placeSchema = z.object({
	id: z.number(),
	trip_id: z.number(),
	name: z.string(),
	description: z.string().nullable().optional(),
	lat: z.number().nullable().optional(),
	lng: z.number().nullable().optional(),
	address: z.string().nullable().optional(),
	category_id: z.number().nullable().optional(),
	price: z.number().nullable().optional(),
	currency: z.string().nullable().optional(),
	reservation_status: z.string().nullable().optional(),
	reservation_notes: z.string().nullable().optional(),
	reservation_datetime: z.string().nullable().optional(),
	place_time: z.string().nullable().optional(),
	end_time: z.string().nullable().optional(),
	duration_minutes: z.number().nullable().optional(),
	notes: z.string().nullable().optional(),
	image_url: z.string().nullable().optional(),
	google_place_id: z.string().nullable().optional(),
	osm_id: z.string().nullable().optional(),
	route_geometry: z.string().nullable().optional(),
	website: z.string().nullable().optional(),
	phone: z.string().nullable().optional(),
	transport_mode: z.string().nullable().optional(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
	category: placeCategorySchema.optional(),
	tags: z.array(tagSchema.partial()).optional()
});
/**
* Trimmed place projection embedded inside a day-assignment response
* (server/src/services/queryHelpers.ts -> formatAssignmentWithPlace). This is a
* SUBSET of the full place: no trip_id / osm_id / route_geometry / created_at /
* reservation_* — only the fields the planner needs to render the itinerary card.
*/
const assignmentPlaceSchema = z.object({
	id: z.number(),
	name: z.string(),
	description: z.string().nullable().optional(),
	lat: z.number().nullable().optional(),
	lng: z.number().nullable().optional(),
	address: z.string().nullable().optional(),
	category_id: z.number().nullable().optional(),
	price: z.number().nullable().optional(),
	currency: z.string().nullable().optional(),
	place_time: z.string().nullable().optional(),
	end_time: z.string().nullable().optional(),
	duration_minutes: z.number().nullable().optional(),
	notes: z.string().nullable().optional(),
	image_url: z.string().nullable().optional(),
	transport_mode: z.string().nullable().optional(),
	google_place_id: z.string().nullable().optional(),
	website: z.string().nullable().optional(),
	phone: z.string().nullable().optional(),
	category: placeCategorySchema.optional(),
	tags: z.array(tagSchema.partial()).optional()
});
const placeCreateRequestSchema = open.and(z.object({ name: z.string().min(1) }));
const placeUpdateRequestSchema = open;
const placeBulkDeleteRequestSchema = z.object({ ids: z.array(z.number()) });
const placeImportListRequestSchema = z.object({
	url: z.string().min(1),
	enrich: z.boolean().optional()
});
/** Query filters for the place list. */
const placeListQuerySchema = z.object({
	search: z.string().optional(),
	category: z.string().optional(),
	tag: z.string().optional()
});
//#endregion
//#region src/assignment/assignment.schema.ts
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
const assignmentParticipantSchema = z.object({
	user_id: z.number(),
	username: z.string(),
	avatar: z.string().nullable().optional()
});
/**
* Assignment entity as returned by the day/assignment endpoints
* (server/src/services/queryHelpers.ts -> formatAssignmentWithPlace, and
* assignmentService.getAssignmentWithPlace). The embedded `place` is the trimmed
* assignment-place projection, NOT the full place pool entity. `assignment_time`
* /`assignment_end_time` carry the per-assignment override times.
*/
const assignmentSchema = z.object({
	id: z.number(),
	day_id: z.number(),
	place_id: z.number(),
	order_index: z.number(),
	notes: z.string().nullable().optional(),
	assignment_time: z.string().nullable().optional(),
	assignment_end_time: z.string().nullable().optional(),
	participants: z.array(assignmentParticipantSchema).optional(),
	created_at: z.string().optional(),
	place: assignmentPlaceSchema
});
const assignmentCreateRequestSchema = z.object({
	place_id: z.union([z.number(), z.string()]),
	notes: z.string().nullable().optional()
});
const assignmentReorderRequestSchema = z.object({ orderedIds: z.array(z.number()) });
const assignmentMoveRequestSchema = z.object({
	new_day_id: z.union([z.number(), z.string()]),
	order_index: z.number().optional()
});
const assignmentTimeRequestSchema = z.object({
	place_time: z.string().nullable().optional(),
	end_time: z.string().nullable().optional()
});
const assignmentParticipantsRequestSchema = z.object({ user_ids: z.array(z.number()) });
//#endregion
//#region src/day/day.schema.ts
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
const dayNoteSchema = z.object({
	id: z.number(),
	day_id: z.number(),
	trip_id: z.number().optional(),
	text: z.string(),
	time: z.string().nullable().optional(),
	icon: z.string().nullable().optional(),
	sort_order: z.number().optional(),
	created_at: z.string().optional()
});
/**
* Day entity as returned by the day list/get endpoints
* (server/src/services/dayService.ts -> listDays). Columns of the `days` table
* plus the embedded `assignments` and `notes_items` arrays.
*/
const daySchema = z.object({
	id: z.number(),
	trip_id: z.number(),
	day_number: z.number().optional(),
	date: z.string().nullable().optional(),
	title: z.string().nullable().optional(),
	notes: z.string().nullable().optional(),
	assignments: z.array(assignmentSchema).optional(),
	notes_items: z.array(dayNoteSchema).optional()
});
const dayCreateRequestSchema = z.object({
	date: z.string().optional(),
	notes: z.string().optional(),
	position: z.number().int().positive().optional()
});
/** Reorder whole days: the desired full sequence of this trip's day ids. */
const dayReorderRequestSchema = z.object({ orderedIds: z.array(z.number()) });
const dayUpdateRequestSchema = z.object({
	notes: z.string().optional(),
	title: z.string().nullable().optional()
});
const dayNoteCreateRequestSchema = z.object({
	text: z.string().min(1).max(500),
	time: z.string().max(250).optional(),
	icon: z.string().optional(),
	sort_order: z.number().optional()
});
const dayNoteUpdateRequestSchema = z.object({
	text: z.string().max(500).optional(),
	time: z.string().max(250).optional(),
	icon: z.string().optional(),
	sort_order: z.number().optional()
});
//#endregion
//#region src/trip/trip.schema.ts
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
const tripSchema = z.object({
	id: z.number(),
	user_id: z.number(),
	title: z.string(),
	description: z.string().nullable().optional(),
	start_date: z.string().nullable().optional(),
	end_date: z.string().nullable().optional(),
	currency: z.string(),
	cover_image: z.string().nullable().optional(),
	is_archived: z.number(),
	reminder_days: z.number(),
	created_at: z.string().optional(),
	updated_at: z.string().optional(),
	day_count: z.number().optional(),
	place_count: z.number().optional(),
	is_owner: z.number().optional(),
	owner_username: z.string().optional(),
	shared_count: z.number().optional()
});
/**
* Trip member as returned by the members endpoint
* (server/src/services/tripService.ts -> listMembers). Owner + collaborators
* share this shape; `avatar_url` is resolved from the stored avatar.
*/
const tripMemberSchema = z.object({
	id: z.number(),
	username: z.string(),
	email: z.string().optional(),
	avatar: z.string().nullable().optional(),
	avatar_url: z.string().nullable().optional(),
	role: z.string().optional(),
	added_at: z.string().nullable().optional(),
	invited_by_username: z.string().nullable().optional()
});
const tripCreateRequestSchema = z.object({
	title: z.string().min(1),
	description: z.string().nullable().optional(),
	start_date: z.string().nullable().optional(),
	end_date: z.string().nullable().optional(),
	currency: z.string().optional(),
	reminder_days: z.number().optional(),
	day_count: z.number().optional()
});
/** Update is partial; the route runs per-field permission checks on what's present. */
const tripUpdateRequestSchema = z.object({
	title: z.string().optional(),
	description: z.string().nullable().optional(),
	start_date: z.string().nullable().optional(),
	end_date: z.string().nullable().optional(),
	currency: z.string().optional(),
	reminder_days: z.number().optional(),
	day_count: z.number().optional(),
	is_archived: z.union([z.boolean(), z.number()]).optional(),
	cover_image: z.string().nullable().optional()
});
const tripCopyRequestSchema = z.object({ title: z.string().optional() });
const tripAddMemberRequestSchema = z.object({ identifier: z.string() });
//#endregion
//#region src/collab/collab.schema.ts
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
const collabNoteCreateRequestSchema = z.object({
	title: z.string().min(1),
	content: z.string().optional(),
	category: z.string().optional(),
	color: z.string().optional(),
	website: z.string().optional()
});
const collabNoteUpdateRequestSchema = z.object({
	title: z.string().optional(),
	content: z.string().optional(),
	category: z.string().optional(),
	color: z.string().optional(),
	pinned: z.union([z.boolean(), z.number()]).optional(),
	website: z.string().optional()
});
const collabPollCreateRequestSchema = z.object({
	question: z.string().min(1),
	options: z.array(z.unknown()).min(2),
	multiple: z.boolean().optional(),
	multiple_choice: z.boolean().optional(),
	deadline: z.string().optional()
});
const collabPollVoteRequestSchema = z.object({ option_index: z.number() });
const collabMessageCreateRequestSchema = z.object({
	text: z.string().min(1).max(5e3),
	reply_to: z.number().nullable().optional()
});
const collabReactionRequestSchema = z.object({ emoji: z.string().min(1) });
//#endregion
//#region src/file/file.schema.ts
/**
* File + photo API contract.
*
* Files live under /api/trips/:tripId/files (upload, metadata, star, trash,
* reservation links, authenticated download). Photos live under /api/photos
* (thumbnail/original streaming + info) and are global, not trip-scoped.
*
* Uploads are multipart/form-data so the file itself isn't modelled here; these
* schemas pin the JSON-ish metadata fields that ride along or come as request
* bodies. The bespoke 400/403/404 controller messages pin the rest.
*/
const nullableIdField = z.union([z.string(), z.number()]).nullable().optional();
const fileUpdateRequestSchema = z.object({
	description: z.string().optional(),
	place_id: nullableIdField,
	reservation_id: nullableIdField
});
const fileLinkRequestSchema = z.object({
	reservation_id: nullableIdField,
	assignment_id: nullableIdField,
	place_id: nullableIdField
});
/** Variants the photo streaming endpoints accept. */
const photoVariantSchema = z.enum(["thumbnail", "original"]);
//#endregion
//#region src/journey/journey.schema.ts
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
const journeyCreateRequestSchema = z.object({
	title: z.string().min(1),
	subtitle: z.string().optional(),
	trip_ids: z.array(z.union([z.string(), z.number()])).optional()
});
const journeyAddTripRequestSchema = z.object({ trip_id: z.union([z.string(), z.number()]) });
const journeyReorderEntriesRequestSchema = z.object({ orderedIds: z.array(z.union([z.string(), z.number()])).min(1) });
const journeyContributorRequestSchema = z.object({
	user_id: z.union([z.string(), z.number()]),
	role: z.enum(["editor", "viewer"]).optional()
});
const journeyProviderPhotosRequestSchema = z.object({
	provider: z.string().min(1),
	asset_id: z.string().optional(),
	asset_ids: z.array(z.union([z.string(), z.number()])).optional(),
	caption: z.string().optional(),
	passphrase: z.string().optional()
});
const journeyShareLinkRequestSchema = z.object({
	share_timeline: z.boolean().optional(),
	share_gallery: z.boolean().optional(),
	share_map: z.boolean().optional()
});
//#endregion
//#region src/share/share.schema.ts
/**
* Trip share-link API contract.
*
* Owner/members create a public read-only token for a trip under
* /api/trips/:tripId/share-link (gated by 'share_manage'); anyone can read the
* shared snapshot at /api/shared/:token (no auth). The per-section toggles
* default server-side (map/bookings on, packing/budget/collab off), so every
* field is optional here.
*/
const shareLinkRequestSchema = z.object({
	share_map: z.boolean().optional(),
	share_bookings: z.boolean().optional(),
	share_packing: z.boolean().optional(),
	share_budget: z.boolean().optional(),
	share_collab: z.boolean().optional()
});
//#endregion
//#region src/settings/settings.schema.ts
/**
* User-settings API contract — per-user key/value preferences under
* /api/settings (get all, upsert one, bulk upsert).
*
* Values are intentionally untyped (settings hold strings, numbers, booleans
* and small objects). A masked value of '••••••••' on a single upsert is a
* no-op sentinel (the client echoes the masked secret back unchanged).
*/
const MASKED_SETTING_VALUE = "••••••••";
const settingUpsertRequestSchema = z.object({
	key: z.string().min(1),
	value: z.unknown().optional()
});
const settingsBulkRequestSchema = z.object({ settings: z.record(z.string(), z.unknown()) });
//#endregion
//#region src/backup/backup.schema.ts
/**
* Backup API contract (admin-only) for /api/backup.
*
* The auto-backup settings body is normalised server-side by the backup
* service (parseAutoBackupBody), so this schema only pins the well-known toggle
* fields and stays permissive (passthrough) for the rest. Create/restore/delete
* carry no JSON body; their inputs are the :filename path param + the upload.
*/
const autoBackupSettingsRequestSchema = z.object({
	enabled: z.boolean().optional(),
	interval: z.string().optional(),
	keep_days: z.union([z.string(), z.number()]).optional(),
	time: z.string().optional()
}).passthrough();
//#endregion
//#region src/auth/auth.schema.ts
/**
* Auth API contract for /api/auth.
*
* The auth service does the heavy credential/MFA validation internally (and
* returns its own {error,status}); these schemas pin the well-defined request
* bodies the public + account endpoints accept. Login/reset can branch to an
* MFA step, so password fields stay permissive where the service owns the rules.
*/
const registerRequestSchema = z.object({
	email: z.string(),
	password: z.string(),
	username: z.string().optional(),
	invite_token: z.string().optional()
});
const loginRequestSchema = z.object({
	email: z.string(),
	password: z.string(),
	remember_me: z.boolean().optional()
});
const forgotPasswordRequestSchema = z.object({ email: z.string() });
const resetPasswordRequestSchema = z.object({
	token: z.string(),
	new_password: z.string(),
	mfa_code: z.string().optional()
});
const changePasswordRequestSchema = z.object({
	current_password: z.string(),
	new_password: z.string()
});
const mfaVerifyLoginRequestSchema = z.object({
	mfa_token: z.string(),
	code: z.string(),
	remember_me: z.boolean().optional()
});
const mfaEnableRequestSchema = z.object({ code: z.string() });
const mcpTokenCreateRequestSchema = z.object({ name: z.string().optional() });
//#endregion
//#region src/oidc/oidc.schema.ts
/**
* OIDC SSO contract for /api/auth/oidc.
*
* The flow is redirect-based and carries no request bodies — inputs arrive as
* query params (the provider callback's code/state/error, the optional invite on
* /login, and the auth-code on /exchange). These schemas pin those query shapes;
* the cryptographic verification + provisioning live in the OIDC service.
*/
const oidcCallbackQuerySchema = z.object({
	code: z.string().optional(),
	state: z.string().optional(),
	error: z.string().optional()
});
const oidcExchangeQuerySchema = z.object({ code: z.string() });
//#endregion
//#region src/oauth/oauth.schema.ts
/**
* OAuth 2.1 server contract for /oauth/* (public) + /api/oauth/* (SPA).
*
* The token endpoint accepts JSON or form-encoded bodies across three grant
* types, so its body stays permissive (the service enforces grant-specific
* rules + the RFC error codes). These schemas pin the consent submit and the
* client-create body the SPA sends.
*/
const oauthTokenRequestSchema = z.object({
	grant_type: z.string().optional(),
	client_id: z.string().optional(),
	client_secret: z.string().optional(),
	code: z.string().optional(),
	redirect_uri: z.string().optional(),
	code_verifier: z.string().optional(),
	refresh_token: z.string().optional(),
	scope: z.string().optional(),
	resource: z.string().optional()
}).passthrough();
const oauthConsentRequestSchema = z.object({
	client_id: z.string(),
	redirect_uri: z.string(),
	scope: z.string(),
	state: z.string().optional(),
	code_challenge: z.string(),
	code_challenge_method: z.string(),
	approved: z.boolean(),
	resource: z.string().optional()
});
const oauthClientCreateRequestSchema = z.object({
	name: z.string().min(1),
	redirect_uris: z.array(z.string()).optional(),
	allowed_scopes: z.array(z.string()),
	allows_client_credentials: z.boolean().optional()
});
//#endregion
//#region src/admin/admin.schema.ts
/**
* Admin API contract for /api/admin (admin-only).
*
* The admin service validates most bodies itself (returning {error,status}), so
* these schemas pin the well-defined ones: user create/update, the permission
* matrix, invites and the boolean feature toggles. Free-form bodies (OIDC
* settings, addon config, default user settings) stay with the service.
*/
const adminUserCreateRequestSchema = z.object({
	email: z.string(),
	password: z.string().optional(),
	username: z.string().optional(),
	role: z.enum(["user", "admin"]).optional()
});
const adminPermissionsRequestSchema = z.object({ permissions: z.record(z.string(), z.unknown()) });
const adminInviteCreateRequestSchema = z.object({
	max_uses: z.number().optional(),
	expires_in_days: z.number().optional(),
	role: z.enum(["user", "admin"]).optional()
});
const adminFeatureToggleRequestSchema = z.object({ enabled: z.boolean() });
//#endregion
//#region src/relocation/relocation.schema.ts
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
const provenanceRefSchema = z.object({
	source: z.string(),
	pulledAt: z.string(),
	license: z.string(),
	url: z.string()
});
const costSummarySchema = z.object({
	costOfLivingIndex: z.number(),
	medianHomeValue: z.number(),
	medianRent: z.number(),
	stateIncomeTaxRate: z.number(),
	propertyTaxRate: z.number()
});
const climateDataSchema = z.object({
	daysMaxGt90FAnnual: z.number(),
	daysMinLt32FAnnual: z.number(),
	sunshineHoursAnnual: z.number(),
	annualPrecipitationInches: z.number(),
	tornadoRiskScore: z.number(),
	hurricaneRiskScore: z.number(),
	floodRiskScore: z.number(),
	earthquakeRiskScore: z.number(),
	wildfireRiskScore: z.number()
});
const crimeDataSchema = z.object({
	violentCrimeRatePer100k: z.number(),
	propertyCrimeRatePer100k: z.number(),
	yearOverYearTrend: z.number()
});
const healthcareDataSchema = z.object({
	healthcareAccessScore: z.number(),
	hospitalCountWithin10mi: z.number()
});
const broadbandDataSchema = z.object({
	pctHouseholdsWith100MbpsPlus: z.number(),
	medianDownloadMbps: z.number()
});
const educationDataSchema = z.object({
	publicSchoolRatingAvg: z.number().optional(),
	studentTeacherRatio: z.number().optional()
});
const fiscalTierSchema = z.enum([
	"Resilient",
	"Fragile",
	"Distressed",
	"Unknown"
]);
const fiscalProfileSchema = z.object({
	statePensionFundedRatio: z.number(),
	fiscalTier: fiscalTierSchema,
	taxCompetitivenessScore: z.number()
});
const amenityProfileSchema = z.object({
	groceryStoreDensityPerCapita: z.number(),
	bigBoxStoreCount: z.number(),
	recreationAreaCount: z.number(),
	natureAreaCount: z.number()
});
const blendedScoreSchema = z.object({
	costScore0to50: z.number(),
	lifeScore0to50: z.number(),
	totalScore0to100: z.number()
});
const transportationDataSchema = z.object({
	avgCommuteMinutes: z.number(),
	pctTransitCommute: z.number(),
	pctRemoteWork: z.number(),
	longCommutePct: z.number()
});
const mobilityDataSchema = z.object({
	upwardMobilityScore: z.number(),
	mobilityPercentile: z.number()
});
const healthOutcomesDataSchema = z.object({
	lifeExpectancy: z.number(),
	adultObesityPct: z.number(),
	adultSmokingPct: z.number(),
	poorMentalHealthDays: z.number(),
	primaryCarePhysiciansPer100k: z.number()
});
const walkabilityDataSchema = z.object({
	walkabilityScore: z.number(),
	walkabilityUnweighted: z.number(),
	blockGroupCount: z.number(),
	totPop: z.number()
});
const locationSchema = z.object({
	id: z.string(),
	name: z.string(),
	state: z.string(),
	lat: z.number(),
	lng: z.number(),
	population: z.number(),
	cost: costSummarySchema,
	climate: climateDataSchema,
	crime: crimeDataSchema,
	healthcare: healthcareDataSchema,
	broadband: broadbandDataSchema,
	education: educationDataSchema.optional(),
	fiscal: fiscalProfileSchema,
	amenities: amenityProfileSchema,
	transportation: transportationDataSchema.optional(),
	mobility: mobilityDataSchema.optional(),
	healthOutcomes: healthOutcomesDataSchema.optional(),
	walkability: walkabilityDataSchema.optional(),
	blended: blendedScoreSchema,
	fiscalTier: fiscalTierSchema,
	metricsProvenance: z.record(z.string(), provenanceRefSchema)
});
const statedPrioritySchema = z.object({
	metric: z.string(),
	rank: z.number(),
	weight: z.number().optional()
});
const hardFilterSchema = z.object({
	field: z.string(),
	operator: z.enum([
		"lt",
		"lte",
		"gt",
		"gte",
		"eq",
		"in",
		"notIn"
	]),
	value: z.union([
		z.number(),
		z.string(),
		z.array(z.string())
	]),
	source: z.enum(["stated", "revealed"]),
	confidence: z.number(),
	discoveredAt: z.string()
});
const moveContextSchema = z.object({
	isFirstMove: z.boolean().optional(),
	demographic: z.enum([
		"young_professional",
		"family_with_kids",
		"retiree",
		"remote_worker",
		"low_income_mover",
		"student"
	]).optional(),
	moveDate: z.string().optional(),
	destinationState: z.string().optional(),
	originState: z.string().optional(),
	hasPets: z.boolean().optional(),
	householdSize: z.number().optional(),
	timelineUrgency: z.enum([
		"exploring",
		"planning",
		"urgent"
	]).optional()
});
const userProfileSchema = z.object({
	userId: z.string(),
	statedPriorities: z.array(statedPrioritySchema),
	revealedEmbeddingRef: z.string(),
	hardFilters: z.array(hardFilterSchema),
	softWeights: z.record(z.string(), z.number()),
	nonNegotiablesDiscovered: z.array(z.string()),
	moveContext: moveContextSchema.optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
	elicitationRoundsCompleted: z.number(),
	implicitSignalCount: z.number(),
	dismissCounts: z.record(z.string(), z.number()).optional()
});
const hardFilterProposalSchema = z.object({
	locationId: z.string(),
	locationName: z.string(),
	dismissCount: z.number().int().nonnegative()
});
const implicitSignalSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("map_pan"),
		center: z.object({
			lat: z.number(),
			lng: z.number()
		}),
		zoom: z.number(),
		ts: z.string()
	}),
	z.object({
		kind: z.literal("candidate_view"),
		locationId: z.string(),
		dwellMs: z.number(),
		ts: z.string()
	}),
	z.object({
		kind: z.literal("candidate_dismiss"),
		locationId: z.string(),
		dwellMs: z.number(),
		reason: z.string().optional(),
		ts: z.string()
	}),
	z.object({
		kind: z.literal("candidate_save"),
		locationId: z.string(),
		ts: z.string()
	}),
	z.object({
		kind: z.literal("candidate_compare"),
		locationIds: z.array(z.string()),
		ts: z.string()
	}),
	z.object({
		kind: z.literal("search_query"),
		query: z.string(),
		ts: z.string()
	}),
	z.object({
		kind: z.literal("filter_apply"),
		filter: z.record(z.string(), z.unknown()),
		ts: z.string()
	})
]);
const scoreRangeSchema = z.object({
	min: z.number().optional(),
	max: z.number().optional()
});
const scoreRequestSchema = z.object({
	topK: z.number().int().positive().optional(),
	filters: z.record(z.string(), scoreRangeSchema).optional()
});
const topMatchSchema = z.object({
	rank: z.number().int().positive(),
	id: z.string(),
	name: z.string(),
	state: z.string(),
	matchScore: z.number(),
	subscores: z.record(z.string(), z.number()),
	trace: z.array(z.string()),
	dataGaps: z.array(z.string()),
	keyMetrics: z.record(z.string(), z.number())
});
const scoreResponseSchema = z.object({
	totalScored: z.number(),
	passedFilters: z.number(),
	returned: z.number(),
	weights: z.record(z.string(), z.number()),
	topMatches: z.array(topMatchSchema)
});
const viewportBoundsSchema = z.object({
	north: z.number().min(-90).max(90),
	south: z.number().min(-90).max(90),
	east: z.number().min(-180).max(180),
	west: z.number().min(-180).max(180)
});
const viewportStatsResponseSchema = z.object({
	count: z.number().int().nonnegative(),
	bounds: viewportBoundsSchema,
	averages: z.record(z.string(), z.number())
});
const elicitationQuestionSchema = z.object({
	id: z.string(),
	prompt: z.string(),
	options: z.array(z.object({
		value: z.string(),
		label: z.string()
	})).optional(),
	skippable: z.boolean().default(true)
});
const elicitationSessionSchema = z.object({
	sessionId: z.string(),
	userId: z.string(),
	currentQuestion: elicitationQuestionSchema.nullable(),
	roundsCompleted: z.number(),
	status: z.enum([
		"active",
		"complete",
		"abandoned"
	]),
	createdAt: z.string(),
	updatedAt: z.string()
});
const JOURNEY_PHASES = [
	"discovery",
	"housing",
	"logistics",
	"settlement"
];
const journeyPreferencesSchema = z.object({
	maxBudget: z.number().optional(),
	householdSize: z.number().optional(),
	employment: z.enum([
		"remote",
		"hybrid",
		"onsite",
		"retired",
		"student",
		"looking"
	]).optional(),
	demographics: z.object({
		ageRange: z.string().optional(),
		hasChildren: z.boolean().optional(),
		schoolAgeChildren: z.number().optional()
	}).optional(),
	climatePreference: z.enum([
		"warm",
		"mild",
		"four_seasons",
		"cold_tolerant"
	]).optional(),
	priorities: z.record(z.string(), z.number()).optional()
});
const journeyTimelineTaskSchema = z.object({
	id: z.string(),
	phase: z.string(),
	title: z.string(),
	description: z.string(),
	dueOffsetDays: z.number(),
	category: z.enum([
		"research",
		"logistics",
		"admin",
		"housing",
		"financial"
	]),
	completed: z.boolean()
});
const journeyTimelineSchema = z.object({
	moveDate: z.string().optional(),
	tasks: z.array(journeyTimelineTaskSchema)
});
const journeyDecisionSchema = z.object({
	timestamp: z.string(),
	type: z.enum([
		"shortlist",
		"eliminate",
		"compare",
		"preference_update",
		"phase_change"
	]),
	description: z.string(),
	data: z.record(z.string(), z.unknown()).optional()
});
const relocationJourneySchema = z.object({
	userId: z.number(),
	shortlistedLocations: z.array(z.string()),
	savedComparisons: z.array(z.unknown()),
	moveTimeline: journeyTimelineSchema.nullable(),
	preferences: journeyPreferencesSchema,
	decisionLog: z.array(journeyDecisionSchema),
	completedTasks: z.array(z.string()),
	currentPhase: z.string(),
	createdAt: z.string(),
	updatedAt: z.string()
});
//#endregion
//#region src/sanitize/sanitize.ts
/**
* HTML sanitisation for memove.
*
* memove currently has no rich-text editor and no user-provided HTML reaches
* the database, so this module exists only to guard the handful of client
* sites that interpolate user-controlled strings into a markup template
* (today: the Journey suggestion banner). It is also the future home for
* sanitisation if TipTap / Markdown ever ships.
*
* Why isomorphic-dompurify: works unchanged in browser (DOMPurify) and Node
* (DOMPurify + jsdom). Tree-shakes correctly so the client bundle does not
* pull jsdom.
*/
const INLINE_TAGS = [
	"b",
	"strong",
	"i",
	"em",
	"u",
	"s",
	"del",
	"ins",
	"mark",
	"code",
	"sub",
	"sup",
	"br",
	"span"
];
const FULL_TAGS = [
	...INLINE_TAGS,
	"p",
	"div",
	"ul",
	"ol",
	"li",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"blockquote",
	"pre",
	"hr",
	"a"
];
const SAFE_ATTRIBUTES = [
	"href",
	"rel",
	"target"
];
/**
* Escapes the five HTML metacharacters so a raw string can be safely
* interpolated into an HTML template. Use this BEFORE substitution when a
* user-controlled value lands inside a markup-shaped translation string.
*
* This is *not* a substitute for `sanitizeInlineHtml`: escape input, then
* sanitise the resulting template — both layers run together in `tHtml`.
*/
function escapeHtml(value) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/**
* Strict inline sanitiser. Use for short, mostly-text strings that may include
* basic emphasis (`<strong>`, `<em>`, …) — e.g. the Journey suggestion banner
* where a translated template embeds a user-controlled trip title.
*
* Drops every tag outside the inline allow-list, strips all attributes, and
* blocks every URL scheme except http/https/mailto/tel via DOMPurify's
* built-in URL allow-list.
*/
function sanitizeInlineHtml(html) {
	if (!html) return "";
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: [...INLINE_TAGS],
		ALLOWED_ATTR: [],
		KEEP_CONTENT: true,
		ALLOW_DATA_ATTR: false
	});
}
/**
* Permissive rich-text sanitiser. Use when a surface legitimately renders a
* prose document (lists, paragraphs, links). Keeps the same tag families as
* the inline sanitiser plus block-level markup and anchors with safe attrs.
*/
function sanitizeRichTextHtml(html) {
	if (!html) return "";
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS: [...FULL_TAGS],
		ALLOWED_ATTR: [...SAFE_ATTRIBUTES],
		ALLOW_DATA_ATTR: false
	});
}
//#endregion
export { AIRTRAIL_KEY_MASK, CONTINENT_MAP, COST_CATEGORIES, JOURNEY_PHASES, MASKED_SETTING_VALUE, SUPPORTED_LANGUAGES, SUPPORTED_LANGUAGE_CODES, accommodationCreateRequestSchema, accommodationSchema, accommodationUpdateRequestSchema, adminFeatureToggleRequestSchema, adminInviteCreateRequestSchema, adminPermissionsRequestSchema, adminUserCreateRequestSchema, airportSchema, airportSearchQuerySchema, airtrailConnectionSchema, airtrailFlightSchema, airtrailImportResultSchema, airtrailImportSchema, airtrailSettingsSchema, airtrailStatusSchema, amenityProfileSchema, assignmentCreateRequestSchema, assignmentMoveRequestSchema, assignmentParticipantSchema, assignmentParticipantsRequestSchema, assignmentPlaceSchema, assignmentReorderRequestSchema, assignmentSchema, assignmentTimeRequestSchema, autoBackupSettingsRequestSchema, blendedScoreSchema, bookingImportConfirmRequestSchema, bookingImportConfirmResponseSchema, bookingImportPreviewItemSchema, bookingImportPreviewResponseSchema, broadbandDataSchema, bucketItemSchema, bucketListResponseSchema, budgetCreateItemRequestSchema, budgetCreateSettlementRequestSchema, budgetItemMemberSchema, budgetItemPayerSchema, budgetItemSchema, budgetReorderCategoriesRequestSchema, budgetReorderItemsRequestSchema, budgetSettlementSchema, budgetToggleMemberPaidRequestSchema, budgetUpdateItemRequestSchema, budgetUpdateMembersRequestSchema, budgetUpdatePayersRequestSchema, budgetUpdateSettlementRequestSchema, categoryListResponseSchema, categorySchema, changePasswordRequestSchema, channelTestResultSchema, climateDataSchema, collabMessageCreateRequestSchema, collabNoteCreateRequestSchema, collabNoteUpdateRequestSchema, collabPollCreateRequestSchema, collabPollVoteRequestSchema, collabReactionRequestSchema, continentForCountry, costSummarySchema, createBucketItemRequestSchema, createCategoryRequestSchema, createTagRequestSchema, crimeDataSchema, dayCreateRequestSchema, dayNoteCreateRequestSchema, dayNoteSchema, dayNoteUpdateRequestSchema, dayReorderRequestSchema, daySchema, dayUpdateRequestSchema, detailedWeatherQuerySchema, educationDataSchema, elicitationQuestionSchema, elicitationSessionSchema, escapeHtml, fileLinkRequestSchema, fileUpdateRequestSchema, fiscalProfileSchema, fiscalTierSchema, forgotPasswordRequestSchema, getIntlLanguage, getLocaleForLanguage, hardFilterProposalSchema, hardFilterSchema, healthOutcomesDataSchema, healthcareDataSchema, hourlyEntrySchema, idParamSchema, idSchema, implicitSignalSchema, inAppListResultSchema, isRtlLanguage, isoDateTime, journeyAddTripRequestSchema, journeyContributorRequestSchema, journeyCreateRequestSchema, journeyDecisionSchema, journeyPreferencesSchema, journeyProviderPhotosRequestSchema, journeyReorderEntriesRequestSchema, journeyShareLinkRequestSchema, journeyTimelineSchema, journeyTimelineTaskSchema, locationSchema, loginRequestSchema, mapsAutocompleteRequestSchema, mapsAutocompleteResultSchema, mapsAutocompleteSuggestionSchema, mapsPlaceDetailsResultSchema, mapsPlacePhotoResultSchema, mapsResolveUrlRequestSchema, mapsResolveUrlResultSchema, mapsReverseQuerySchema, mapsReverseResultSchema, mapsSearchRequestSchema, mapsSearchResultSchema, markRegionRequestSchema, mcpTokenCreateRequestSchema, mfaEnableRequestSchema, mfaVerifyLoginRequestSchema, mobilityDataSchema, moveContextSchema, nonEmptyString, noticeDisplaySchema, noticeSeveritySchema, notificationRespondRequestSchema, notificationRowSchema, oauthClientCreateRequestSchema, oauthConsentRequestSchema, oauthTokenRequestSchema, oidcCallbackQuerySchema, oidcExchangeQuerySchema, packingBagMemberSchema, packingBagMembersRequestSchema, packingBagSchema, packingCategoryAssigneesRequestSchema, packingCreateBagRequestSchema, packingCreateItemRequestSchema, packingImportRequestSchema, packingItemSchema, packingReorderRequestSchema, packingSaveTemplateRequestSchema, packingTemplateSummarySchema, packingTemplatesResponseSchema, packingUpdateBagRequestSchema, packingUpdateItemRequestSchema, paginationQuerySchema, photoVariantSchema, placeBulkDeleteRequestSchema, placeCategorySchema, placeCreateRequestSchema, placeImportListRequestSchema, placeListQuerySchema, placeSchema, placeUpdateRequestSchema, preferencesUpdateRequestSchema, provenanceRefSchema, publicConfigSchema, regionGeoSchema, registerRequestSchema, relocationJourneySchema, reservationCreateRequestSchema, reservationEndpointSchema, reservationPositionsRequestSchema, reservationSchema, reservationUpdateRequestSchema, resetPasswordRequestSchema, sanitizeInlineHtml, sanitizeRichTextHtml, scoreRangeSchema, scoreRequestSchema, scoreResponseSchema, settingUpsertRequestSchema, settingsBulkRequestSchema, shareLinkRequestSchema, statedPrioritySchema, systemNoticeDtoSchema, tagListResponseSchema, tagSchema, testNtfyRequestSchema, testSmtpRequestSchema, testWebhookRequestSchema, todoCategoryAssigneesRequestSchema, todoCreateItemRequestSchema, todoReorderRequestSchema, todoUpdateItemRequestSchema, topMatchSchema, transportationDataSchema, tripAddMemberRequestSchema, tripCopyRequestSchema, tripCreateRequestSchema, tripMemberSchema, tripSchema, tripUpdateRequestSchema, typeToCostCategory, unreadCountResultSchema, updateBucketItemRequestSchema, updateCategoryRequestSchema, updateTagRequestSchema, userProfileSchema, vacayAddHolidayCalendarRequestSchema, vacayAddYearRequestSchema, vacayCompanyHolidayRequestSchema, vacayInviteActionRequestSchema, vacayInviteRequestSchema, vacayPlanDataSchema, vacaySetColorRequestSchema, vacayToggleEntryRequestSchema, vacayUpdateStatsRequestSchema, viewportBoundsSchema, viewportStatsResponseSchema, walkabilityDataSchema, weatherQuerySchema, weatherResultSchema };
