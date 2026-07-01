Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
const require_languages = require("./languages-gzv_j3bs.cjs");
let zod = require("zod");
let isomorphic_dompurify = require("isomorphic-dompurify");
isomorphic_dompurify = __toESM(isomorphic_dompurify, 1);
//#region src/common/primitives.schema.ts
/**
* Primitive, domain-agnostic building blocks shared by every contract.
* Domain schemas (trips, places, ...) live in their own folders and reuse these.
*/
/** memove uses auto-increment integer primary keys. */
const idSchema = zod.z.number().int().positive();
/**
* Numeric id coming from a URL param / query string. Express hands these over
* as strings, so we coerce, then enforce a positive integer.
*/
const idParamSchema = zod.z.coerce.number().int().positive();
/** Non-empty, trimmed string. */
const nonEmptyString = zod.z.string().trim().min(1);
/** ISO-8601 timestamp string (the shape memove serialises dates as in JSON). */
const isoDateTime = zod.z.string().datetime({ offset: true });
//#endregion
//#region src/common/pagination.schema.ts
/**
* Generic pagination query helper. Individual endpoints opt in by extending
* this; it is NOT applied globally (many memove list endpoints return full sets).
* Defaults are conservative and only used where a route already paginates.
*/
const paginationQuerySchema = zod.z.object({
	page: zod.z.coerce.number().int().min(1).default(1),
	perPage: zod.z.coerce.number().int().min(1).max(200).default(50)
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
const weatherQuerySchema = zod.z.object({
	lat: zod.z.string().min(1),
	lng: zod.z.string().min(1),
	date: zod.z.string().min(1).optional(),
	lang: zod.z.string().min(1).default("de")
});
/** Detailed weather requires a date (the Express route 400s without it). */
const detailedWeatherQuerySchema = weatherQuerySchema.extend({ date: zod.z.string().min(1) });
const hourlyEntrySchema = zod.z.object({
	hour: zod.z.number(),
	temp: zod.z.number(),
	precipitation: zod.z.number(),
	precipitation_probability: zod.z.number(),
	main: zod.z.string(),
	wind: zod.z.number(),
	humidity: zod.z.number()
});
/**
* Weather response DTO. Fields are optional because the Express service emits
* different subsets depending on the request type (current / forecast / climate /
* detailed) and on error (`{ ..., error: 'no_forecast' }`).
*/
const weatherResultSchema = zod.z.object({
	temp: zod.z.number(),
	temp_max: zod.z.number().optional(),
	temp_min: zod.z.number().optional(),
	main: zod.z.string(),
	description: zod.z.string(),
	type: zod.z.string(),
	sunrise: zod.z.string().nullable().optional(),
	sunset: zod.z.string().nullable().optional(),
	precipitation_sum: zod.z.number().optional(),
	precipitation_probability_max: zod.z.number().optional(),
	wind_max: zod.z.number().optional(),
	hourly: zod.z.array(hourlyEntrySchema).optional(),
	error: zod.z.string().optional()
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
const airportSchema = zod.z.object({
	iata: zod.z.string(),
	icao: zod.z.string().nullable(),
	name: zod.z.string(),
	city: zod.z.string(),
	country: zod.z.string(),
	lat: zod.z.number(),
	lng: zod.z.number(),
	tz: zod.z.string()
});
/**
* Search query. `q` is optional — the route answers with `[]` when it is missing
* or empty rather than 400ing, so presence is handled in the controller.
*/
const airportSearchQuerySchema = zod.z.object({ q: zod.z.string().optional() });
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
const publicConfigSchema = zod.z.object({ defaultLanguage: zod.z.string() });
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
const noticeDisplaySchema = zod.z.enum([
	"modal",
	"banner",
	"toast"
]);
const noticeSeveritySchema = zod.z.enum([
	"info",
	"warn",
	"critical"
]);
const noticeMediaSchema = zod.z.object({
	src: zod.z.string(),
	srcDark: zod.z.string().optional(),
	altKey: zod.z.string(),
	placement: zod.z.enum(["hero", "inline"]).optional(),
	aspectRatio: zod.z.string().optional()
});
const noticeHighlightSchema = zod.z.object({
	labelKey: zod.z.string(),
	iconName: zod.z.string().optional()
});
/** Call-to-action: either a navigation link or an in-app action. */
const noticeCtaSchema = zod.z.discriminatedUnion("kind", [zod.z.object({
	kind: zod.z.literal("nav"),
	labelKey: zod.z.string(),
	href: zod.z.string()
}), zod.z.object({
	kind: zod.z.literal("action"),
	labelKey: zod.z.string(),
	actionId: zod.z.string(),
	dismissOnAction: zod.z.boolean().optional()
})]);
/** The client-facing notice (server-evaluated; conditions/versioning stripped). */
const systemNoticeDtoSchema = zod.z.object({
	id: zod.z.string(),
	display: noticeDisplaySchema,
	severity: noticeSeveritySchema,
	titleKey: zod.z.string(),
	bodyKey: zod.z.string(),
	bodyParams: zod.z.record(zod.z.string(), zod.z.string()).optional(),
	icon: zod.z.string().optional(),
	media: noticeMediaSchema.optional(),
	highlights: zod.z.array(noticeHighlightSchema).optional(),
	cta: noticeCtaSchema.optional(),
	dismissible: zod.z.boolean()
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
const latLng = zod.z.object({
	lat: zod.z.number(),
	lng: zod.z.number()
});
const mapsSearchRequestSchema = zod.z.object({ query: zod.z.string().min(1) });
const mapsAutocompleteRequestSchema = zod.z.object({
	input: zod.z.string().min(1).max(200),
	lang: zod.z.string().optional(),
	locationBias: zod.z.object({
		low: latLng,
		high: latLng
	}).optional()
});
const mapsReverseQuerySchema = zod.z.object({
	lat: zod.z.string().min(1),
	lng: zod.z.string().min(1),
	lang: zod.z.string().optional()
});
const mapsResolveUrlRequestSchema = zod.z.object({ url: zod.z.string().min(1) });
/** Provider-shaped place blob (Google/OSM fields differ); kept open by design. */
const placeRecord = zod.z.record(zod.z.string(), zod.z.unknown());
const mapsSearchResultSchema = zod.z.object({
	places: zod.z.array(placeRecord),
	source: zod.z.string()
});
const mapsAutocompleteSuggestionSchema = zod.z.object({
	placeId: zod.z.string(),
	mainText: zod.z.string(),
	secondaryText: zod.z.string()
});
const mapsAutocompleteResultSchema = zod.z.object({
	suggestions: zod.z.array(mapsAutocompleteSuggestionSchema),
	source: zod.z.string()
});
const mapsPlaceDetailsResultSchema = zod.z.object({
	place: placeRecord.nullable(),
	disabled: zod.z.boolean().optional()
});
const mapsPlacePhotoResultSchema = zod.z.object({
	photoUrl: zod.z.string().nullable(),
	attribution: zod.z.string().nullable().optional()
});
const mapsReverseResultSchema = zod.z.object({
	name: zod.z.string().nullable(),
	address: zod.z.string().nullable()
});
const mapsResolveUrlResultSchema = zod.z.object({
	lat: zod.z.number(),
	lng: zod.z.number(),
	name: zod.z.string().nullable(),
	address: zod.z.string().nullable()
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
const categorySchema = zod.z.object({
	id: zod.z.number(),
	name: zod.z.string(),
	color: zod.z.string(),
	icon: zod.z.string(),
	user_id: zod.z.number().nullable().optional(),
	created_at: zod.z.string().optional()
});
const createCategoryRequestSchema = zod.z.object({
	name: zod.z.string().min(1),
	color: zod.z.string().optional(),
	icon: zod.z.string().optional()
});
/** All fields optional — the service COALESCEs each against the stored value. */
const updateCategoryRequestSchema = zod.z.object({
	name: zod.z.string().optional(),
	color: zod.z.string().optional(),
	icon: zod.z.string().optional()
});
const categoryListResponseSchema = zod.z.object({ categories: zod.z.array(categorySchema) });
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
const tagSchema = zod.z.object({
	id: zod.z.number(),
	user_id: zod.z.number(),
	name: zod.z.string(),
	color: zod.z.string(),
	created_at: zod.z.string().optional()
});
const createTagRequestSchema = zod.z.object({
	name: zod.z.string().min(1),
	color: zod.z.string().optional()
});
/** Both fields optional — the service COALESCEs each against the stored value. */
const updateTagRequestSchema = zod.z.object({
	name: zod.z.string().optional(),
	color: zod.z.string().optional()
});
const tagListResponseSchema = zod.z.object({ tags: zod.z.array(tagSchema) });
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
const preferencesUpdateRequestSchema = zod.z.record(zod.z.string(), zod.z.record(zod.z.string(), zod.z.boolean()));
const testSmtpRequestSchema = zod.z.object({ email: zod.z.string().optional() });
const testWebhookRequestSchema = zod.z.object({ url: zod.z.string().optional() });
const testNtfyRequestSchema = zod.z.object({
	topic: zod.z.string().optional(),
	server: zod.z.string().optional(),
	token: zod.z.string().optional()
});
/** Result of a channel test ping. */
const channelTestResultSchema = zod.z.object({
	success: zod.z.boolean(),
	error: zod.z.string().optional()
});
/** Respond to a boolean (yes/no) notification. */
const notificationRespondRequestSchema = zod.z.object({ response: zod.z.enum(["positive", "negative"]) });
/** A single in-app notification row (DB-shaped; kept open). */
const notificationRowSchema = zod.z.record(zod.z.string(), zod.z.unknown());
const inAppListResultSchema = zod.z.object({
	notifications: zod.z.array(notificationRowSchema),
	total: zod.z.number(),
	unread_count: zod.z.number()
});
const unreadCountResultSchema = zod.z.object({ count: zod.z.number() });
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
const open$4 = zod.z.record(zod.z.string(), zod.z.unknown());
const markRegionRequestSchema = zod.z.object({
	name: zod.z.string().min(1),
	country_code: zod.z.string().min(1)
});
const createBucketItemRequestSchema = zod.z.object({
	name: zod.z.string().min(1),
	lat: zod.z.number().nullable().optional(),
	lng: zod.z.number().nullable().optional(),
	country_code: zod.z.string().nullable().optional(),
	notes: zod.z.string().nullable().optional(),
	target_date: zod.z.string().nullable().optional()
});
const updateBucketItemRequestSchema = zod.z.object({
	name: zod.z.string().optional(),
	notes: zod.z.string().optional(),
	lat: zod.z.number().nullable().optional(),
	lng: zod.z.number().nullable().optional(),
	country_code: zod.z.string().nullable().optional(),
	target_date: zod.z.string().nullable().optional()
});
/** A bucket-list item row (DB-shaped; kept open). */
const bucketItemSchema = open$4;
const bucketListResponseSchema = zod.z.object({ items: zod.z.array(bucketItemSchema) });
/** GeoJSON FeatureCollection (kept open — provider-derived geometry). */
const regionGeoSchema = zod.z.object({
	type: zod.z.literal("FeatureCollection"),
	features: zod.z.array(zod.z.unknown())
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
const open$3 = zod.z.record(zod.z.string(), zod.z.unknown());
const vacayAddHolidayCalendarRequestSchema = zod.z.object({
	region: zod.z.string().min(1),
	label: zod.z.string().nullable().optional(),
	color: zod.z.string().optional(),
	sort_order: zod.z.number().optional()
});
const vacaySetColorRequestSchema = zod.z.object({
	color: zod.z.string().optional(),
	target_user_id: zod.z.union([zod.z.number(), zod.z.string()]).optional()
});
const vacayInviteRequestSchema = zod.z.object({ user_id: zod.z.union([zod.z.number(), zod.z.string()]) });
const vacayInviteActionRequestSchema = zod.z.object({ plan_id: zod.z.number().optional() });
const vacayAddYearRequestSchema = zod.z.object({ year: zod.z.union([zod.z.number(), zod.z.string()]) });
const vacayToggleEntryRequestSchema = zod.z.object({
	date: zod.z.string().min(1),
	target_user_id: zod.z.union([zod.z.number(), zod.z.string()]).optional()
});
const vacayCompanyHolidayRequestSchema = zod.z.object({
	date: zod.z.string(),
	note: zod.z.string().optional()
});
const vacayUpdateStatsRequestSchema = zod.z.object({
	vacation_days: zod.z.number().optional(),
	target_user_id: zod.z.union([zod.z.number(), zod.z.string()]).optional()
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
const open$2 = zod.z.record(zod.z.string(), zod.z.unknown());
/**
* Packing item entity as returned by the packing endpoints
* (server/src/services/packingService.ts -> SELECT * FROM packing_items).
* `checked` is the raw SQLite INTEGER (0/1). Columns match the packing_items
* table (see server DB): weight_grams/bag_id are nullable, quantity defaults 1.
*/
const packingItemSchema = zod.z.object({
	id: zod.z.number(),
	trip_id: zod.z.number(),
	name: zod.z.string(),
	checked: zod.z.number(),
	category: zod.z.string().nullable().optional(),
	sort_order: zod.z.number(),
	weight_grams: zod.z.number().nullable().optional(),
	bag_id: zod.z.number().nullable().optional(),
	quantity: zod.z.number().optional(),
	created_at: zod.z.string().optional()
});
/**
* Packing bag member embedded on a bag (server packingService -> listBags).
* `avatar` is the resolved avatar URL.
*/
const packingBagMemberSchema = zod.z.object({
	user_id: zod.z.number(),
	username: zod.z.string(),
	avatar: zod.z.string().nullable().optional()
});
/**
* Packing bag entity (server packingService -> listBags). Columns of the
* packing_bags table plus the embedded `members` array (and the optional
* `assigned_username` join present on updateBag).
*/
const packingBagSchema = zod.z.object({
	id: zod.z.number(),
	trip_id: zod.z.number(),
	name: zod.z.string(),
	color: zod.z.string(),
	weight_limit_grams: zod.z.number().nullable().optional(),
	sort_order: zod.z.number(),
	user_id: zod.z.number().nullable().optional(),
	assigned_username: zod.z.string().nullable().optional(),
	created_at: zod.z.string().optional(),
	members: zod.z.array(packingBagMemberSchema).optional()
});
const packingCreateItemRequestSchema = zod.z.object({
	name: zod.z.string().min(1),
	category: zod.z.string().optional(),
	checked: zod.z.boolean().optional()
});
const packingUpdateItemRequestSchema = zod.z.object({
	name: zod.z.string().optional(),
	checked: zod.z.boolean().optional(),
	category: zod.z.string().optional(),
	weight_grams: zod.z.number().nullable().optional(),
	bag_id: zod.z.number().nullable().optional(),
	quantity: zod.z.number().optional()
});
const packingImportRequestSchema = zod.z.object({ items: zod.z.array(open$2) });
const packingReorderRequestSchema = zod.z.object({ orderedIds: zod.z.array(zod.z.number()) });
const packingCreateBagRequestSchema = zod.z.object({
	name: zod.z.string().min(1),
	color: zod.z.string().optional()
});
const packingUpdateBagRequestSchema = zod.z.object({
	name: zod.z.string().optional(),
	color: zod.z.string().optional(),
	weight_limit_grams: zod.z.number().nullable().optional(),
	user_id: zod.z.number().nullable().optional()
});
const packingBagMembersRequestSchema = zod.z.object({ user_ids: zod.z.array(zod.z.number()) });
const packingSaveTemplateRequestSchema = zod.z.object({ name: zod.z.string().min(1) });
const packingTemplateSummarySchema = zod.z.object({
	id: zod.z.number(),
	name: zod.z.string(),
	item_count: zod.z.number()
});
const packingTemplatesResponseSchema = zod.z.object({ templates: zod.z.array(packingTemplateSummarySchema) });
const packingCategoryAssigneesRequestSchema = zod.z.object({ user_ids: zod.z.array(zod.z.number()) });
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
const todoCreateItemRequestSchema = zod.z.object({
	name: zod.z.string().min(1),
	category: zod.z.string().optional(),
	due_date: zod.z.string().optional(),
	description: zod.z.string().optional(),
	assigned_user_id: zod.z.number().optional(),
	priority: zod.z.number().optional()
});
const todoUpdateItemRequestSchema = zod.z.object({
	name: zod.z.string().optional(),
	checked: zod.z.boolean().optional(),
	category: zod.z.string().optional(),
	due_date: zod.z.string().optional(),
	description: zod.z.string().optional(),
	assigned_user_id: zod.z.number().optional(),
	priority: zod.z.number().optional()
});
const todoReorderRequestSchema = zod.z.object({ orderedIds: zod.z.array(zod.z.number()) });
const todoCategoryAssigneesRequestSchema = zod.z.object({ user_ids: zod.z.array(zod.z.number()) });
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
const budgetItemMemberSchema = zod.z.object({
	user_id: zod.z.number(),
	paid: zod.z.number(),
	username: zod.z.string(),
	avatar_url: zod.z.string().nullable().optional(),
	avatar: zod.z.string().nullable().optional(),
	budget_item_id: zod.z.number().optional()
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
const budgetItemPayerSchema = zod.z.object({
	user_id: zod.z.number(),
	amount: zod.z.number(),
	username: zod.z.string().optional(),
	avatar_url: zod.z.string().nullable().optional(),
	avatar: zod.z.string().nullable().optional(),
	budget_item_id: zod.z.number().optional()
});
/**
* Budget item entity as returned by the budget list/create/update endpoints
* (server/src/services/budgetService.ts). Columns of the `budget_items` table
* plus the embedded `members` (equal-split participants) and `payers` arrays.
* total_price is the sum of payer amounts in `currency`; `exchange_rate` converts
* that to the trip base currency (NULL currency + rate 1 = base currency).
*/
const budgetItemSchema = zod.z.object({
	id: zod.z.number(),
	trip_id: zod.z.number(),
	category: zod.z.string(),
	name: zod.z.string(),
	total_price: zod.z.number(),
	currency: zod.z.string().nullable().optional(),
	exchange_rate: zod.z.number().optional(),
	persons: zod.z.number().nullable().optional(),
	days: zod.z.number().nullable().optional(),
	note: zod.z.string().nullable().optional(),
	reservation_id: zod.z.number().nullable().optional(),
	paid_by_user_id: zod.z.number().nullable().optional(),
	expense_date: zod.z.string().nullable().optional(),
	sort_order: zod.z.number().optional(),
	created_at: zod.z.string().optional(),
	members: zod.z.array(budgetItemMemberSchema).optional(),
	payers: zod.z.array(budgetItemPayerSchema).optional()
});
const payerInputSchema = zod.z.object({
	user_id: zod.z.number(),
	amount: zod.z.number()
});
const budgetCreateItemRequestSchema = zod.z.object({
	name: zod.z.string().min(1),
	category: zod.z.string().optional(),
	total_price: zod.z.number().optional(),
	currency: zod.z.string().nullable().optional(),
	exchange_rate: zod.z.number().optional(),
	payers: zod.z.array(payerInputSchema).optional(),
	member_ids: zod.z.array(zod.z.number()).optional(),
	persons: zod.z.number().nullable().optional(),
	days: zod.z.number().nullable().optional(),
	note: zod.z.string().nullable().optional(),
	expense_date: zod.z.string().nullable().optional(),
	reservation_id: zod.z.number().optional()
});
/** Update accepts the same fields plus total_price changes; all optional. */
const budgetUpdateItemRequestSchema = zod.z.object({
	name: zod.z.string().optional(),
	category: zod.z.string().optional(),
	total_price: zod.z.number().optional(),
	currency: zod.z.string().nullable().optional(),
	exchange_rate: zod.z.number().optional(),
	payers: zod.z.array(payerInputSchema).optional(),
	member_ids: zod.z.array(zod.z.number()).optional(),
	persons: zod.z.number().nullable().optional(),
	days: zod.z.number().nullable().optional(),
	note: zod.z.string().nullable().optional(),
	expense_date: zod.z.string().nullable().optional()
});
/** Replace the explicit payers of an expense (amounts in expense currency). */
const budgetUpdatePayersRequestSchema = zod.z.object({ payers: zod.z.array(payerInputSchema) });
/**
* A persisted settle-up transfer (budget_settlements row): "from paid to" a
* given amount in the trip base currency. Creating one marks a suggested flow as
* paid; deleting it (undo) brings the flow back. Names joined for display.
*/
const budgetSettlementSchema = zod.z.object({
	id: zod.z.number(),
	trip_id: zod.z.number(),
	from_user_id: zod.z.number(),
	to_user_id: zod.z.number(),
	amount: zod.z.number(),
	created_at: zod.z.string().optional(),
	created_by_user_id: zod.z.number().nullable().optional(),
	from_username: zod.z.string().optional(),
	from_avatar_url: zod.z.string().nullable().optional(),
	to_username: zod.z.string().optional(),
	to_avatar_url: zod.z.string().nullable().optional()
});
const budgetCreateSettlementRequestSchema = zod.z.object({
	from_user_id: zod.z.number(),
	to_user_id: zod.z.number(),
	amount: zod.z.number()
});
/** Edit a persisted settle-up transfer (same fields as create; full replace). */
const budgetUpdateSettlementRequestSchema = zod.z.object({
	from_user_id: zod.z.number(),
	to_user_id: zod.z.number(),
	amount: zod.z.number()
});
const budgetUpdateMembersRequestSchema = zod.z.object({ user_ids: zod.z.array(zod.z.number()) });
const budgetToggleMemberPaidRequestSchema = zod.z.object({ paid: zod.z.boolean() });
const budgetReorderItemsRequestSchema = zod.z.object({ orderedIds: zod.z.array(zod.z.number()) });
const budgetReorderCategoriesRequestSchema = zod.z.object({ orderedCategories: zod.z.array(zod.z.string()) });
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
const open$1 = zod.z.record(zod.z.string(), zod.z.unknown());
/**
* A reservation endpoint (flight/train leg terminal) — row of the
* reservation_endpoints table (server/src/services/reservationService.ts).
*/
const reservationEndpointSchema = zod.z.object({
	id: zod.z.number().optional(),
	reservation_id: zod.z.number().optional(),
	role: zod.z.enum([
		"from",
		"to",
		"stop"
	]),
	sequence: zod.z.number(),
	name: zod.z.string(),
	code: zod.z.string().nullable(),
	lat: zod.z.number(),
	lng: zod.z.number(),
	timezone: zod.z.string().nullable(),
	local_time: zod.z.string().nullable(),
	local_date: zod.z.string().nullable()
});
/**
* Reservation entity as returned by the reservation list endpoint
* (server/src/services/reservationService.ts -> listReservations). Columns of
* the `reservations` table plus the joined day_number / place_name / linked
* accommodation fields and the computed `day_positions` + `endpoints`.
* `accommodation_id` is stored as TEXT in the DB.
*/
const reservationSchema = zod.z.object({
	id: zod.z.number(),
	trip_id: zod.z.number(),
	day_id: zod.z.number().nullable().optional(),
	end_day_id: zod.z.number().nullable().optional(),
	place_id: zod.z.number().nullable().optional(),
	assignment_id: zod.z.number().nullable().optional(),
	title: zod.z.string(),
	reservation_time: zod.z.string().nullable().optional(),
	reservation_end_time: zod.z.string().nullable().optional(),
	location: zod.z.string().nullable().optional(),
	confirmation_number: zod.z.string().nullable().optional(),
	notes: zod.z.string().nullable().optional(),
	status: zod.z.string(),
	type: zod.z.string(),
	accommodation_id: zod.z.union([zod.z.number(), zod.z.string()]).nullable().optional(),
	metadata: zod.z.string().nullable().optional(),
	needs_review: zod.z.number().optional(),
	day_plan_position: zod.z.number().nullable().optional(),
	created_at: zod.z.string().optional(),
	external_source: zod.z.string().nullable().optional(),
	external_id: zod.z.string().nullable().optional(),
	external_owner_user_id: zod.z.number().nullable().optional(),
	external_synced_at: zod.z.string().nullable().optional(),
	sync_enabled: zod.z.number().nullable().optional(),
	day_number: zod.z.number().nullable().optional(),
	place_name: zod.z.string().nullable().optional(),
	accommodation_place_id: zod.z.number().nullable().optional(),
	accommodation_name: zod.z.string().nullable().optional(),
	accommodation_start_day_id: zod.z.number().nullable().optional(),
	accommodation_end_day_id: zod.z.number().nullable().optional(),
	day_positions: zod.z.record(zod.z.string(), zod.z.number()).nullable().optional(),
	endpoints: zod.z.array(reservationEndpointSchema).optional()
});
/**
* Accommodation entity as returned by listAccommodations / getAccommodationWithPlace
* (server/src/services/dayService.ts). Columns of the day_accommodations table
* plus the joined place fields and (on list) the linked reservation_title.
*/
const accommodationSchema = zod.z.object({
	id: zod.z.number(),
	trip_id: zod.z.number(),
	place_id: zod.z.number().nullable().optional(),
	start_day_id: zod.z.number(),
	end_day_id: zod.z.number(),
	check_in: zod.z.string().nullable().optional(),
	check_in_end: zod.z.string().nullable().optional(),
	check_out: zod.z.string().nullable().optional(),
	confirmation: zod.z.string().nullable().optional(),
	notes: zod.z.string().nullable().optional(),
	created_at: zod.z.string().optional(),
	place_name: zod.z.string().nullable().optional(),
	place_address: zod.z.string().nullable().optional(),
	place_image: zod.z.string().nullable().optional(),
	place_lat: zod.z.number().nullable().optional(),
	place_lng: zod.z.number().nullable().optional(),
	reservation_title: zod.z.string().nullable().optional()
});
/** Reservation create: title is required; the many optional fields stay open. */
const reservationCreateRequestSchema = open$1.and(zod.z.object({ title: zod.z.string().min(1) }));
const reservationUpdateRequestSchema = open$1;
const reservationPositionsRequestSchema = zod.z.object({
	positions: zod.z.array(zod.z.object({
		id: zod.z.number(),
		day_plan_position: zod.z.number()
	})),
	day_id: zod.z.union([zod.z.number(), zod.z.string()]).nullable().optional()
});
const accommodationCreateRequestSchema = zod.z.object({
	place_id: zod.z.union([zod.z.number(), zod.z.string()]),
	start_day_id: zod.z.union([zod.z.number(), zod.z.string()]),
	end_day_id: zod.z.union([zod.z.number(), zod.z.string()]),
	check_in: zod.z.string().nullable().optional(),
	check_in_end: zod.z.string().nullable().optional(),
	check_out: zod.z.string().nullable().optional(),
	confirmation: zod.z.string().nullable().optional(),
	notes: zod.z.string().nullable().optional()
});
const accommodationUpdateRequestSchema = open$1;
const bookingImportEndpointSchema = zod.z.object({
	role: zod.z.enum([
		"from",
		"to",
		"stop"
	]),
	sequence: zod.z.number(),
	name: zod.z.string(),
	code: zod.z.string().nullable(),
	lat: zod.z.number(),
	lng: zod.z.number(),
	timezone: zod.z.string().nullable(),
	local_time: zod.z.string().nullable(),
	local_date: zod.z.string().nullable()
});
const bookingImportVenueSchema = zod.z.object({
	name: zod.z.string(),
	lat: zod.z.number().optional(),
	lng: zod.z.number().optional(),
	address: zod.z.string().optional(),
	website: zod.z.string().optional(),
	phone: zod.z.string().optional()
});
const bookingImportAccommodationSchema = zod.z.object({
	check_in: zod.z.string().optional(),
	check_out: zod.z.string().optional(),
	confirmation: zod.z.string().optional()
});
const bookingImportPreviewItemSchema = zod.z.object({
	type: zod.z.string(),
	title: zod.z.string().min(1),
	reservation_time: zod.z.string().nullable().optional(),
	reservation_end_time: zod.z.string().nullable().optional(),
	confirmation_number: zod.z.string().nullable().optional(),
	location: zod.z.string().nullable().optional(),
	metadata: zod.z.record(zod.z.string(), zod.z.unknown()).optional(),
	endpoints: zod.z.array(bookingImportEndpointSchema).optional(),
	needs_review: zod.z.boolean().optional(),
	_venue: bookingImportVenueSchema.optional(),
	_accommodation: bookingImportAccommodationSchema.optional(),
	source: zod.z.object({
		fileName: zod.z.string(),
		index: zod.z.number()
	})
});
const bookingImportPreviewResponseSchema = zod.z.object({
	items: zod.z.array(bookingImportPreviewItemSchema),
	warnings: zod.z.array(zod.z.string())
});
const bookingImportConfirmRequestSchema = zod.z.object({ items: zod.z.array(bookingImportPreviewItemSchema).min(1) });
const bookingImportConfirmResponseSchema = zod.z.object({ created: zod.z.array(reservationSchema) });
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
const airtrailSettingsSchema = zod.z.object({
	/** Instance origin, e.g. https://flights.example.com — memove appends /api itself. */
	url: zod.z.string().trim().max(2048),
	/** Bearer API key. Omitted / blank / the mask keeps the stored key unchanged. */
	apiKey: zod.z.string().max(512).optional(),
	/** Allow self-signed TLS certs (common on LAN instances). */
	allowInsecureTls: zod.z.boolean().optional().default(false),
	/**
	* Opt in to writing memove edits back to AirTrail (#1240). Off by default:
	* AirTrail is the source of truth and memove only reads from it.
	*/
	writeEnabled: zod.z.boolean().optional().default(false)
});
const airtrailConnectionSchema = zod.z.object({
	url: zod.z.string(),
	apiKeyMasked: zod.z.string(),
	allowInsecureTls: zod.z.boolean(),
	writeEnabled: zod.z.boolean(),
	connected: zod.z.boolean()
});
const airtrailStatusSchema = zod.z.object({
	connected: zod.z.boolean(),
	flightCount: zod.z.number().optional(),
	error: zod.z.string().optional()
});
/** A normalized AirTrail flight as surfaced to the import picker. */
const airtrailFlightSchema = zod.z.object({
	id: zod.z.string(),
	fromCode: zod.z.string().nullable(),
	fromName: zod.z.string().nullable(),
	toCode: zod.z.string().nullable(),
	toName: zod.z.string().nullable(),
	date: zod.z.string().nullable(),
	departure: zod.z.string().nullable(),
	arrival: zod.z.string().nullable(),
	airline: zod.z.string().nullable(),
	flightNumber: zod.z.string().nullable(),
	aircraft: zod.z.string().nullable(),
	seatClass: zod.z.string().nullable()
});
const airtrailImportSchema = zod.z.object({ flightIds: zod.z.array(zod.z.string()).min(1, "Select at least one flight") });
/** Per-flight outcome of an import (so the picker can show what was skipped). */
const airtrailImportResultSchema = zod.z.object({
	imported: zod.z.array(zod.z.string()),
	skipped: zod.z.array(zod.z.object({
		flightId: zod.z.string(),
		reason: zod.z.enum([
			"already-imported",
			"already-in-trip",
			"invalid"
		]),
		detail: zod.z.string().optional()
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
const open = zod.z.record(zod.z.string(), zod.z.unknown());
/**
* Embedded category as returned on a place — a trimmed projection of the
* categories row (id/name/color/icon), built inline by placeService and
* getPlaceWithTags. `null` when the place has no category_id.
*/
const placeCategorySchema = zod.z.object({
	id: zod.z.number(),
	name: zod.z.string().nullable(),
	color: zod.z.string().nullable(),
	icon: zod.z.string().nullable()
}).nullable();
/**
* Full place entity as returned by the place list / get / create / update
* endpoints (server/src/services/placeService.ts -> getPlaceWithTags). All
* columns of the `places` table (see server/data DB) plus the joined `category`
* projection and `tags` array. Numbers (lat/lng/price) are SQLite REAL, ids are
* INTEGER; provider-derived columns are nullable.
*/
const placeSchema = zod.z.object({
	id: zod.z.number(),
	trip_id: zod.z.number(),
	name: zod.z.string(),
	description: zod.z.string().nullable().optional(),
	lat: zod.z.number().nullable().optional(),
	lng: zod.z.number().nullable().optional(),
	address: zod.z.string().nullable().optional(),
	category_id: zod.z.number().nullable().optional(),
	price: zod.z.number().nullable().optional(),
	currency: zod.z.string().nullable().optional(),
	reservation_status: zod.z.string().nullable().optional(),
	reservation_notes: zod.z.string().nullable().optional(),
	reservation_datetime: zod.z.string().nullable().optional(),
	place_time: zod.z.string().nullable().optional(),
	end_time: zod.z.string().nullable().optional(),
	duration_minutes: zod.z.number().nullable().optional(),
	notes: zod.z.string().nullable().optional(),
	image_url: zod.z.string().nullable().optional(),
	google_place_id: zod.z.string().nullable().optional(),
	osm_id: zod.z.string().nullable().optional(),
	route_geometry: zod.z.string().nullable().optional(),
	website: zod.z.string().nullable().optional(),
	phone: zod.z.string().nullable().optional(),
	transport_mode: zod.z.string().nullable().optional(),
	created_at: zod.z.string().optional(),
	updated_at: zod.z.string().optional(),
	category: placeCategorySchema.optional(),
	tags: zod.z.array(tagSchema.partial()).optional()
});
/**
* Trimmed place projection embedded inside a day-assignment response
* (server/src/services/queryHelpers.ts -> formatAssignmentWithPlace). This is a
* SUBSET of the full place: no trip_id / osm_id / route_geometry / created_at /
* reservation_* — only the fields the planner needs to render the itinerary card.
*/
const assignmentPlaceSchema = zod.z.object({
	id: zod.z.number(),
	name: zod.z.string(),
	description: zod.z.string().nullable().optional(),
	lat: zod.z.number().nullable().optional(),
	lng: zod.z.number().nullable().optional(),
	address: zod.z.string().nullable().optional(),
	category_id: zod.z.number().nullable().optional(),
	price: zod.z.number().nullable().optional(),
	currency: zod.z.string().nullable().optional(),
	place_time: zod.z.string().nullable().optional(),
	end_time: zod.z.string().nullable().optional(),
	duration_minutes: zod.z.number().nullable().optional(),
	notes: zod.z.string().nullable().optional(),
	image_url: zod.z.string().nullable().optional(),
	transport_mode: zod.z.string().nullable().optional(),
	google_place_id: zod.z.string().nullable().optional(),
	website: zod.z.string().nullable().optional(),
	phone: zod.z.string().nullable().optional(),
	category: placeCategorySchema.optional(),
	tags: zod.z.array(tagSchema.partial()).optional()
});
const placeCreateRequestSchema = open.and(zod.z.object({ name: zod.z.string().min(1) }));
const placeUpdateRequestSchema = open;
const placeBulkDeleteRequestSchema = zod.z.object({ ids: zod.z.array(zod.z.number()) });
const placeImportListRequestSchema = zod.z.object({
	url: zod.z.string().min(1),
	enrich: zod.z.boolean().optional()
});
/** Query filters for the place list. */
const placeListQuerySchema = zod.z.object({
	search: zod.z.string().optional(),
	category: zod.z.string().optional(),
	tag: zod.z.string().optional()
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
const assignmentParticipantSchema = zod.z.object({
	user_id: zod.z.number(),
	username: zod.z.string(),
	avatar: zod.z.string().nullable().optional()
});
/**
* Assignment entity as returned by the day/assignment endpoints
* (server/src/services/queryHelpers.ts -> formatAssignmentWithPlace, and
* assignmentService.getAssignmentWithPlace). The embedded `place` is the trimmed
* assignment-place projection, NOT the full place pool entity. `assignment_time`
* /`assignment_end_time` carry the per-assignment override times.
*/
const assignmentSchema = zod.z.object({
	id: zod.z.number(),
	day_id: zod.z.number(),
	place_id: zod.z.number(),
	order_index: zod.z.number(),
	notes: zod.z.string().nullable().optional(),
	assignment_time: zod.z.string().nullable().optional(),
	assignment_end_time: zod.z.string().nullable().optional(),
	participants: zod.z.array(assignmentParticipantSchema).optional(),
	created_at: zod.z.string().optional(),
	place: assignmentPlaceSchema
});
const assignmentCreateRequestSchema = zod.z.object({
	place_id: zod.z.union([zod.z.number(), zod.z.string()]),
	notes: zod.z.string().nullable().optional()
});
const assignmentReorderRequestSchema = zod.z.object({ orderedIds: zod.z.array(zod.z.number()) });
const assignmentMoveRequestSchema = zod.z.object({
	new_day_id: zod.z.union([zod.z.number(), zod.z.string()]),
	order_index: zod.z.number().optional()
});
const assignmentTimeRequestSchema = zod.z.object({
	place_time: zod.z.string().nullable().optional(),
	end_time: zod.z.string().nullable().optional()
});
const assignmentParticipantsRequestSchema = zod.z.object({ user_ids: zod.z.array(zod.z.number()) });
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
const dayNoteSchema = zod.z.object({
	id: zod.z.number(),
	day_id: zod.z.number(),
	trip_id: zod.z.number().optional(),
	text: zod.z.string(),
	time: zod.z.string().nullable().optional(),
	icon: zod.z.string().nullable().optional(),
	sort_order: zod.z.number().optional(),
	created_at: zod.z.string().optional()
});
/**
* Day entity as returned by the day list/get endpoints
* (server/src/services/dayService.ts -> listDays). Columns of the `days` table
* plus the embedded `assignments` and `notes_items` arrays.
*/
const daySchema = zod.z.object({
	id: zod.z.number(),
	trip_id: zod.z.number(),
	day_number: zod.z.number().optional(),
	date: zod.z.string().nullable().optional(),
	title: zod.z.string().nullable().optional(),
	notes: zod.z.string().nullable().optional(),
	assignments: zod.z.array(assignmentSchema).optional(),
	notes_items: zod.z.array(dayNoteSchema).optional()
});
const dayCreateRequestSchema = zod.z.object({
	date: zod.z.string().optional(),
	notes: zod.z.string().optional(),
	position: zod.z.number().int().positive().optional()
});
/** Reorder whole days: the desired full sequence of this trip's day ids. */
const dayReorderRequestSchema = zod.z.object({ orderedIds: zod.z.array(zod.z.number()) });
const dayUpdateRequestSchema = zod.z.object({
	notes: zod.z.string().optional(),
	title: zod.z.string().nullable().optional()
});
const dayNoteCreateRequestSchema = zod.z.object({
	text: zod.z.string().min(1).max(500),
	time: zod.z.string().max(250).optional(),
	icon: zod.z.string().optional(),
	sort_order: zod.z.number().optional()
});
const dayNoteUpdateRequestSchema = zod.z.object({
	text: zod.z.string().max(500).optional(),
	time: zod.z.string().max(250).optional(),
	icon: zod.z.string().optional(),
	sort_order: zod.z.number().optional()
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
const tripSchema = zod.z.object({
	id: zod.z.number(),
	user_id: zod.z.number(),
	title: zod.z.string(),
	description: zod.z.string().nullable().optional(),
	start_date: zod.z.string().nullable().optional(),
	end_date: zod.z.string().nullable().optional(),
	currency: zod.z.string(),
	cover_image: zod.z.string().nullable().optional(),
	is_archived: zod.z.number(),
	reminder_days: zod.z.number(),
	created_at: zod.z.string().optional(),
	updated_at: zod.z.string().optional(),
	day_count: zod.z.number().optional(),
	place_count: zod.z.number().optional(),
	is_owner: zod.z.number().optional(),
	owner_username: zod.z.string().optional(),
	shared_count: zod.z.number().optional()
});
/**
* Trip member as returned by the members endpoint
* (server/src/services/tripService.ts -> listMembers). Owner + collaborators
* share this shape; `avatar_url` is resolved from the stored avatar.
*/
const tripMemberSchema = zod.z.object({
	id: zod.z.number(),
	username: zod.z.string(),
	email: zod.z.string().optional(),
	avatar: zod.z.string().nullable().optional(),
	avatar_url: zod.z.string().nullable().optional(),
	role: zod.z.string().optional(),
	added_at: zod.z.string().nullable().optional(),
	invited_by_username: zod.z.string().nullable().optional()
});
const tripCreateRequestSchema = zod.z.object({
	title: zod.z.string().min(1),
	description: zod.z.string().nullable().optional(),
	start_date: zod.z.string().nullable().optional(),
	end_date: zod.z.string().nullable().optional(),
	currency: zod.z.string().optional(),
	reminder_days: zod.z.number().optional(),
	day_count: zod.z.number().optional()
});
/** Update is partial; the route runs per-field permission checks on what's present. */
const tripUpdateRequestSchema = zod.z.object({
	title: zod.z.string().optional(),
	description: zod.z.string().nullable().optional(),
	start_date: zod.z.string().nullable().optional(),
	end_date: zod.z.string().nullable().optional(),
	currency: zod.z.string().optional(),
	reminder_days: zod.z.number().optional(),
	day_count: zod.z.number().optional(),
	is_archived: zod.z.union([zod.z.boolean(), zod.z.number()]).optional(),
	cover_image: zod.z.string().nullable().optional()
});
const tripCopyRequestSchema = zod.z.object({ title: zod.z.string().optional() });
const tripAddMemberRequestSchema = zod.z.object({ identifier: zod.z.string() });
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
const collabNoteCreateRequestSchema = zod.z.object({
	title: zod.z.string().min(1),
	content: zod.z.string().optional(),
	category: zod.z.string().optional(),
	color: zod.z.string().optional(),
	website: zod.z.string().optional()
});
const collabNoteUpdateRequestSchema = zod.z.object({
	title: zod.z.string().optional(),
	content: zod.z.string().optional(),
	category: zod.z.string().optional(),
	color: zod.z.string().optional(),
	pinned: zod.z.union([zod.z.boolean(), zod.z.number()]).optional(),
	website: zod.z.string().optional()
});
const collabPollCreateRequestSchema = zod.z.object({
	question: zod.z.string().min(1),
	options: zod.z.array(zod.z.unknown()).min(2),
	multiple: zod.z.boolean().optional(),
	multiple_choice: zod.z.boolean().optional(),
	deadline: zod.z.string().optional()
});
const collabPollVoteRequestSchema = zod.z.object({ option_index: zod.z.number() });
const collabMessageCreateRequestSchema = zod.z.object({
	text: zod.z.string().min(1).max(5e3),
	reply_to: zod.z.number().nullable().optional()
});
const collabReactionRequestSchema = zod.z.object({ emoji: zod.z.string().min(1) });
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
const nullableIdField = zod.z.union([zod.z.string(), zod.z.number()]).nullable().optional();
const fileUpdateRequestSchema = zod.z.object({
	description: zod.z.string().optional(),
	place_id: nullableIdField,
	reservation_id: nullableIdField
});
const fileLinkRequestSchema = zod.z.object({
	reservation_id: nullableIdField,
	assignment_id: nullableIdField,
	place_id: nullableIdField
});
/** Variants the photo streaming endpoints accept. */
const photoVariantSchema = zod.z.enum(["thumbnail", "original"]);
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
const journeyCreateRequestSchema = zod.z.object({
	title: zod.z.string().min(1),
	subtitle: zod.z.string().optional(),
	trip_ids: zod.z.array(zod.z.union([zod.z.string(), zod.z.number()])).optional()
});
const journeyAddTripRequestSchema = zod.z.object({ trip_id: zod.z.union([zod.z.string(), zod.z.number()]) });
const journeyReorderEntriesRequestSchema = zod.z.object({ orderedIds: zod.z.array(zod.z.union([zod.z.string(), zod.z.number()])).min(1) });
const journeyContributorRequestSchema = zod.z.object({
	user_id: zod.z.union([zod.z.string(), zod.z.number()]),
	role: zod.z.enum(["editor", "viewer"]).optional()
});
const journeyProviderPhotosRequestSchema = zod.z.object({
	provider: zod.z.string().min(1),
	asset_id: zod.z.string().optional(),
	asset_ids: zod.z.array(zod.z.union([zod.z.string(), zod.z.number()])).optional(),
	caption: zod.z.string().optional(),
	passphrase: zod.z.string().optional()
});
const journeyShareLinkRequestSchema = zod.z.object({
	share_timeline: zod.z.boolean().optional(),
	share_gallery: zod.z.boolean().optional(),
	share_map: zod.z.boolean().optional()
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
const shareLinkRequestSchema = zod.z.object({
	share_map: zod.z.boolean().optional(),
	share_bookings: zod.z.boolean().optional(),
	share_packing: zod.z.boolean().optional(),
	share_budget: zod.z.boolean().optional(),
	share_collab: zod.z.boolean().optional()
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
const settingUpsertRequestSchema = zod.z.object({
	key: zod.z.string().min(1),
	value: zod.z.unknown().optional()
});
const settingsBulkRequestSchema = zod.z.object({ settings: zod.z.record(zod.z.string(), zod.z.unknown()) });
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
const autoBackupSettingsRequestSchema = zod.z.object({
	enabled: zod.z.boolean().optional(),
	interval: zod.z.string().optional(),
	keep_days: zod.z.union([zod.z.string(), zod.z.number()]).optional(),
	time: zod.z.string().optional()
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
const registerRequestSchema = zod.z.object({
	email: zod.z.string(),
	password: zod.z.string(),
	username: zod.z.string().optional(),
	invite_token: zod.z.string().optional()
});
const loginRequestSchema = zod.z.object({
	email: zod.z.string(),
	password: zod.z.string(),
	remember_me: zod.z.boolean().optional()
});
const forgotPasswordRequestSchema = zod.z.object({ email: zod.z.string() });
const resetPasswordRequestSchema = zod.z.object({
	token: zod.z.string(),
	new_password: zod.z.string(),
	mfa_code: zod.z.string().optional()
});
const changePasswordRequestSchema = zod.z.object({
	current_password: zod.z.string(),
	new_password: zod.z.string()
});
const mfaVerifyLoginRequestSchema = zod.z.object({
	mfa_token: zod.z.string(),
	code: zod.z.string(),
	remember_me: zod.z.boolean().optional()
});
const mfaEnableRequestSchema = zod.z.object({ code: zod.z.string() });
const mcpTokenCreateRequestSchema = zod.z.object({ name: zod.z.string().optional() });
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
const oidcCallbackQuerySchema = zod.z.object({
	code: zod.z.string().optional(),
	state: zod.z.string().optional(),
	error: zod.z.string().optional()
});
const oidcExchangeQuerySchema = zod.z.object({ code: zod.z.string() });
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
const oauthTokenRequestSchema = zod.z.object({
	grant_type: zod.z.string().optional(),
	client_id: zod.z.string().optional(),
	client_secret: zod.z.string().optional(),
	code: zod.z.string().optional(),
	redirect_uri: zod.z.string().optional(),
	code_verifier: zod.z.string().optional(),
	refresh_token: zod.z.string().optional(),
	scope: zod.z.string().optional(),
	resource: zod.z.string().optional()
}).passthrough();
const oauthConsentRequestSchema = zod.z.object({
	client_id: zod.z.string(),
	redirect_uri: zod.z.string(),
	scope: zod.z.string(),
	state: zod.z.string().optional(),
	code_challenge: zod.z.string(),
	code_challenge_method: zod.z.string(),
	approved: zod.z.boolean(),
	resource: zod.z.string().optional()
});
const oauthClientCreateRequestSchema = zod.z.object({
	name: zod.z.string().min(1),
	redirect_uris: zod.z.array(zod.z.string()).optional(),
	allowed_scopes: zod.z.array(zod.z.string()),
	allows_client_credentials: zod.z.boolean().optional()
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
const adminUserCreateRequestSchema = zod.z.object({
	email: zod.z.string(),
	password: zod.z.string().optional(),
	username: zod.z.string().optional(),
	role: zod.z.enum(["user", "admin"]).optional()
});
const adminPermissionsRequestSchema = zod.z.object({ permissions: zod.z.record(zod.z.string(), zod.z.unknown()) });
const adminInviteCreateRequestSchema = zod.z.object({
	max_uses: zod.z.number().optional(),
	expires_in_days: zod.z.number().optional(),
	role: zod.z.enum(["user", "admin"]).optional()
});
const adminFeatureToggleRequestSchema = zod.z.object({ enabled: zod.z.boolean() });
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
const provenanceRefSchema = zod.z.object({
	source: zod.z.string(),
	pulledAt: zod.z.string(),
	license: zod.z.string(),
	url: zod.z.string()
});
const costSummarySchema = zod.z.object({
	costOfLivingIndex: zod.z.number(),
	medianHomeValue: zod.z.number(),
	medianRent: zod.z.number(),
	stateIncomeTaxRate: zod.z.number(),
	propertyTaxRate: zod.z.number()
});
const climateDataSchema = zod.z.object({
	daysMaxGt90FAnnual: zod.z.number(),
	daysMinLt32FAnnual: zod.z.number(),
	sunshineHoursAnnual: zod.z.number(),
	annualPrecipitationInches: zod.z.number(),
	tornadoRiskScore: zod.z.number(),
	hurricaneRiskScore: zod.z.number(),
	floodRiskScore: zod.z.number(),
	earthquakeRiskScore: zod.z.number(),
	wildfireRiskScore: zod.z.number()
});
const crimeDataSchema = zod.z.object({
	violentCrimeRatePer100k: zod.z.number(),
	propertyCrimeRatePer100k: zod.z.number(),
	yearOverYearTrend: zod.z.number()
});
const healthcareDataSchema = zod.z.object({
	healthcareAccessScore: zod.z.number(),
	hospitalCountWithin10mi: zod.z.number()
});
const broadbandDataSchema = zod.z.object({
	pctHouseholdsWith100MbpsPlus: zod.z.number(),
	medianDownloadMbps: zod.z.number()
});
const educationDataSchema = zod.z.object({
	publicSchoolRatingAvg: zod.z.number().optional(),
	studentTeacherRatio: zod.z.number().optional()
});
const fiscalTierSchema = zod.z.enum([
	"Resilient",
	"Fragile",
	"Distressed",
	"Unknown"
]);
const fiscalProfileSchema = zod.z.object({
	statePensionFundedRatio: zod.z.number(),
	fiscalTier: fiscalTierSchema,
	taxCompetitivenessScore: zod.z.number()
});
const amenityProfileSchema = zod.z.object({
	groceryStoreDensityPerCapita: zod.z.number(),
	bigBoxStoreCount: zod.z.number(),
	recreationAreaCount: zod.z.number(),
	natureAreaCount: zod.z.number()
});
const blendedScoreSchema = zod.z.object({
	costScore0to50: zod.z.number(),
	lifeScore0to50: zod.z.number(),
	totalScore0to100: zod.z.number()
});
const transportationDataSchema = zod.z.object({
	avgCommuteMinutes: zod.z.number(),
	pctTransitCommute: zod.z.number(),
	pctRemoteWork: zod.z.number(),
	longCommutePct: zod.z.number()
});
const mobilityDataSchema = zod.z.object({
	upwardMobilityScore: zod.z.number(),
	mobilityPercentile: zod.z.number()
});
const healthOutcomesDataSchema = zod.z.object({
	lifeExpectancy: zod.z.number(),
	adultObesityPct: zod.z.number(),
	adultSmokingPct: zod.z.number(),
	poorMentalHealthDays: zod.z.number(),
	primaryCarePhysiciansPer100k: zod.z.number()
});
const walkabilityDataSchema = zod.z.object({
	walkabilityScore: zod.z.number(),
	walkabilityUnweighted: zod.z.number(),
	blockGroupCount: zod.z.number(),
	totPop: zod.z.number()
});
const locationSchema = zod.z.object({
	id: zod.z.string(),
	name: zod.z.string(),
	state: zod.z.string(),
	lat: zod.z.number(),
	lng: zod.z.number(),
	population: zod.z.number(),
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
	metricsProvenance: zod.z.record(zod.z.string(), provenanceRefSchema)
});
const statedPrioritySchema = zod.z.object({
	metric: zod.z.string(),
	rank: zod.z.number(),
	weight: zod.z.number().optional()
});
const hardFilterSchema = zod.z.object({
	field: zod.z.string(),
	operator: zod.z.enum([
		"lt",
		"lte",
		"gt",
		"gte",
		"eq",
		"in",
		"notIn"
	]),
	value: zod.z.union([
		zod.z.number(),
		zod.z.string(),
		zod.z.array(zod.z.string())
	]),
	source: zod.z.enum(["stated", "revealed"]),
	confidence: zod.z.number(),
	discoveredAt: zod.z.string()
});
const moveContextSchema = zod.z.object({
	isFirstMove: zod.z.boolean().optional(),
	demographic: zod.z.enum([
		"young_professional",
		"family_with_kids",
		"retiree",
		"remote_worker",
		"low_income_mover",
		"student"
	]).optional(),
	moveDate: zod.z.string().optional(),
	destinationState: zod.z.string().optional(),
	originState: zod.z.string().optional(),
	hasPets: zod.z.boolean().optional(),
	householdSize: zod.z.number().optional(),
	timelineUrgency: zod.z.enum([
		"exploring",
		"planning",
		"urgent"
	]).optional()
});
const userProfileSchema = zod.z.object({
	userId: zod.z.string(),
	statedPriorities: zod.z.array(statedPrioritySchema),
	revealedEmbeddingRef: zod.z.string(),
	hardFilters: zod.z.array(hardFilterSchema),
	softWeights: zod.z.record(zod.z.string(), zod.z.number()),
	nonNegotiablesDiscovered: zod.z.array(zod.z.string()),
	moveContext: moveContextSchema.optional(),
	createdAt: zod.z.string(),
	updatedAt: zod.z.string(),
	elicitationRoundsCompleted: zod.z.number(),
	implicitSignalCount: zod.z.number(),
	dismissCounts: zod.z.record(zod.z.string(), zod.z.number()).optional()
});
const hardFilterProposalSchema = zod.z.object({
	locationId: zod.z.string(),
	locationName: zod.z.string(),
	dismissCount: zod.z.number().int().nonnegative()
});
const implicitSignalSchema = zod.z.discriminatedUnion("kind", [
	zod.z.object({
		kind: zod.z.literal("map_pan"),
		center: zod.z.object({
			lat: zod.z.number(),
			lng: zod.z.number()
		}),
		zoom: zod.z.number(),
		ts: zod.z.string()
	}),
	zod.z.object({
		kind: zod.z.literal("candidate_view"),
		locationId: zod.z.string(),
		dwellMs: zod.z.number(),
		ts: zod.z.string()
	}),
	zod.z.object({
		kind: zod.z.literal("candidate_dismiss"),
		locationId: zod.z.string(),
		dwellMs: zod.z.number(),
		reason: zod.z.string().optional(),
		ts: zod.z.string()
	}),
	zod.z.object({
		kind: zod.z.literal("candidate_save"),
		locationId: zod.z.string(),
		ts: zod.z.string()
	}),
	zod.z.object({
		kind: zod.z.literal("candidate_compare"),
		locationIds: zod.z.array(zod.z.string()),
		ts: zod.z.string()
	}),
	zod.z.object({
		kind: zod.z.literal("search_query"),
		query: zod.z.string(),
		ts: zod.z.string()
	}),
	zod.z.object({
		kind: zod.z.literal("filter_apply"),
		filter: zod.z.record(zod.z.string(), zod.z.unknown()),
		ts: zod.z.string()
	})
]);
const scoreRangeSchema = zod.z.object({
	min: zod.z.number().optional(),
	max: zod.z.number().optional()
});
const scoreRequestSchema = zod.z.object({
	topK: zod.z.number().int().positive().optional(),
	filters: zod.z.record(zod.z.string(), scoreRangeSchema).optional()
});
const topMatchSchema = zod.z.object({
	rank: zod.z.number().int().positive(),
	id: zod.z.string(),
	name: zod.z.string(),
	state: zod.z.string(),
	matchScore: zod.z.number(),
	subscores: zod.z.record(zod.z.string(), zod.z.number()),
	trace: zod.z.array(zod.z.string()),
	dataGaps: zod.z.array(zod.z.string()),
	keyMetrics: zod.z.record(zod.z.string(), zod.z.number())
});
const scoreResponseSchema = zod.z.object({
	totalScored: zod.z.number(),
	passedFilters: zod.z.number(),
	returned: zod.z.number(),
	weights: zod.z.record(zod.z.string(), zod.z.number()),
	topMatches: zod.z.array(topMatchSchema)
});
const viewportBoundsSchema = zod.z.object({
	north: zod.z.number().min(-90).max(90),
	south: zod.z.number().min(-90).max(90),
	east: zod.z.number().min(-180).max(180),
	west: zod.z.number().min(-180).max(180)
});
const viewportStatsResponseSchema = zod.z.object({
	count: zod.z.number().int().nonnegative(),
	bounds: viewportBoundsSchema,
	averages: zod.z.record(zod.z.string(), zod.z.number())
});
const elicitationQuestionSchema = zod.z.object({
	id: zod.z.string(),
	prompt: zod.z.string(),
	options: zod.z.array(zod.z.object({
		value: zod.z.string(),
		label: zod.z.string()
	})).optional(),
	skippable: zod.z.boolean().default(true)
});
const elicitationSessionSchema = zod.z.object({
	sessionId: zod.z.string(),
	userId: zod.z.string(),
	currentQuestion: elicitationQuestionSchema.nullable(),
	roundsCompleted: zod.z.number(),
	status: zod.z.enum([
		"active",
		"complete",
		"abandoned"
	]),
	createdAt: zod.z.string(),
	updatedAt: zod.z.string()
});
const JOURNEY_PHASES = [
	"discovery",
	"housing",
	"logistics",
	"settlement"
];
const journeyPreferencesSchema = zod.z.object({
	maxBudget: zod.z.number().optional(),
	householdSize: zod.z.number().optional(),
	employment: zod.z.enum([
		"remote",
		"hybrid",
		"onsite",
		"retired",
		"student",
		"looking"
	]).optional(),
	demographics: zod.z.object({
		ageRange: zod.z.string().optional(),
		hasChildren: zod.z.boolean().optional(),
		schoolAgeChildren: zod.z.number().optional()
	}).optional(),
	climatePreference: zod.z.enum([
		"warm",
		"mild",
		"four_seasons",
		"cold_tolerant"
	]).optional(),
	priorities: zod.z.record(zod.z.string(), zod.z.number()).optional()
});
const journeyTimelineTaskSchema = zod.z.object({
	id: zod.z.string(),
	phase: zod.z.string(),
	title: zod.z.string(),
	description: zod.z.string(),
	dueOffsetDays: zod.z.number(),
	category: zod.z.enum([
		"research",
		"logistics",
		"admin",
		"housing",
		"financial"
	]),
	completed: zod.z.boolean()
});
const journeyTimelineSchema = zod.z.object({
	moveDate: zod.z.string().optional(),
	tasks: zod.z.array(journeyTimelineTaskSchema)
});
const journeyDecisionSchema = zod.z.object({
	timestamp: zod.z.string(),
	type: zod.z.enum([
		"shortlist",
		"eliminate",
		"compare",
		"preference_update",
		"phase_change"
	]),
	description: zod.z.string(),
	data: zod.z.record(zod.z.string(), zod.z.unknown()).optional()
});
const relocationJourneySchema = zod.z.object({
	userId: zod.z.number(),
	shortlistedLocations: zod.z.array(zod.z.string()),
	savedComparisons: zod.z.array(zod.z.unknown()),
	moveTimeline: journeyTimelineSchema.nullable(),
	preferences: journeyPreferencesSchema,
	decisionLog: zod.z.array(journeyDecisionSchema),
	completedTasks: zod.z.array(zod.z.string()),
	currentPhase: zod.z.string(),
	createdAt: zod.z.string(),
	updatedAt: zod.z.string()
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
	return isomorphic_dompurify.default.sanitize(html, {
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
	return isomorphic_dompurify.default.sanitize(html, {
		ALLOWED_TAGS: [...FULL_TAGS],
		ALLOWED_ATTR: [...SAFE_ATTRIBUTES],
		ALLOW_DATA_ATTR: false
	});
}
//#endregion
exports.AIRTRAIL_KEY_MASK = AIRTRAIL_KEY_MASK;
exports.CONTINENT_MAP = CONTINENT_MAP;
exports.COST_CATEGORIES = COST_CATEGORIES;
exports.JOURNEY_PHASES = JOURNEY_PHASES;
exports.MASKED_SETTING_VALUE = MASKED_SETTING_VALUE;
exports.SUPPORTED_LANGUAGES = require_languages.SUPPORTED_LANGUAGES;
exports.SUPPORTED_LANGUAGE_CODES = require_languages.SUPPORTED_LANGUAGE_CODES;
exports.accommodationCreateRequestSchema = accommodationCreateRequestSchema;
exports.accommodationSchema = accommodationSchema;
exports.accommodationUpdateRequestSchema = accommodationUpdateRequestSchema;
exports.adminFeatureToggleRequestSchema = adminFeatureToggleRequestSchema;
exports.adminInviteCreateRequestSchema = adminInviteCreateRequestSchema;
exports.adminPermissionsRequestSchema = adminPermissionsRequestSchema;
exports.adminUserCreateRequestSchema = adminUserCreateRequestSchema;
exports.airportSchema = airportSchema;
exports.airportSearchQuerySchema = airportSearchQuerySchema;
exports.airtrailConnectionSchema = airtrailConnectionSchema;
exports.airtrailFlightSchema = airtrailFlightSchema;
exports.airtrailImportResultSchema = airtrailImportResultSchema;
exports.airtrailImportSchema = airtrailImportSchema;
exports.airtrailSettingsSchema = airtrailSettingsSchema;
exports.airtrailStatusSchema = airtrailStatusSchema;
exports.amenityProfileSchema = amenityProfileSchema;
exports.assignmentCreateRequestSchema = assignmentCreateRequestSchema;
exports.assignmentMoveRequestSchema = assignmentMoveRequestSchema;
exports.assignmentParticipantSchema = assignmentParticipantSchema;
exports.assignmentParticipantsRequestSchema = assignmentParticipantsRequestSchema;
exports.assignmentPlaceSchema = assignmentPlaceSchema;
exports.assignmentReorderRequestSchema = assignmentReorderRequestSchema;
exports.assignmentSchema = assignmentSchema;
exports.assignmentTimeRequestSchema = assignmentTimeRequestSchema;
exports.autoBackupSettingsRequestSchema = autoBackupSettingsRequestSchema;
exports.blendedScoreSchema = blendedScoreSchema;
exports.bookingImportConfirmRequestSchema = bookingImportConfirmRequestSchema;
exports.bookingImportConfirmResponseSchema = bookingImportConfirmResponseSchema;
exports.bookingImportPreviewItemSchema = bookingImportPreviewItemSchema;
exports.bookingImportPreviewResponseSchema = bookingImportPreviewResponseSchema;
exports.broadbandDataSchema = broadbandDataSchema;
exports.bucketItemSchema = bucketItemSchema;
exports.bucketListResponseSchema = bucketListResponseSchema;
exports.budgetCreateItemRequestSchema = budgetCreateItemRequestSchema;
exports.budgetCreateSettlementRequestSchema = budgetCreateSettlementRequestSchema;
exports.budgetItemMemberSchema = budgetItemMemberSchema;
exports.budgetItemPayerSchema = budgetItemPayerSchema;
exports.budgetItemSchema = budgetItemSchema;
exports.budgetReorderCategoriesRequestSchema = budgetReorderCategoriesRequestSchema;
exports.budgetReorderItemsRequestSchema = budgetReorderItemsRequestSchema;
exports.budgetSettlementSchema = budgetSettlementSchema;
exports.budgetToggleMemberPaidRequestSchema = budgetToggleMemberPaidRequestSchema;
exports.budgetUpdateItemRequestSchema = budgetUpdateItemRequestSchema;
exports.budgetUpdateMembersRequestSchema = budgetUpdateMembersRequestSchema;
exports.budgetUpdatePayersRequestSchema = budgetUpdatePayersRequestSchema;
exports.budgetUpdateSettlementRequestSchema = budgetUpdateSettlementRequestSchema;
exports.categoryListResponseSchema = categoryListResponseSchema;
exports.categorySchema = categorySchema;
exports.changePasswordRequestSchema = changePasswordRequestSchema;
exports.channelTestResultSchema = channelTestResultSchema;
exports.climateDataSchema = climateDataSchema;
exports.collabMessageCreateRequestSchema = collabMessageCreateRequestSchema;
exports.collabNoteCreateRequestSchema = collabNoteCreateRequestSchema;
exports.collabNoteUpdateRequestSchema = collabNoteUpdateRequestSchema;
exports.collabPollCreateRequestSchema = collabPollCreateRequestSchema;
exports.collabPollVoteRequestSchema = collabPollVoteRequestSchema;
exports.collabReactionRequestSchema = collabReactionRequestSchema;
exports.continentForCountry = continentForCountry;
exports.costSummarySchema = costSummarySchema;
exports.createBucketItemRequestSchema = createBucketItemRequestSchema;
exports.createCategoryRequestSchema = createCategoryRequestSchema;
exports.createTagRequestSchema = createTagRequestSchema;
exports.crimeDataSchema = crimeDataSchema;
exports.dayCreateRequestSchema = dayCreateRequestSchema;
exports.dayNoteCreateRequestSchema = dayNoteCreateRequestSchema;
exports.dayNoteSchema = dayNoteSchema;
exports.dayNoteUpdateRequestSchema = dayNoteUpdateRequestSchema;
exports.dayReorderRequestSchema = dayReorderRequestSchema;
exports.daySchema = daySchema;
exports.dayUpdateRequestSchema = dayUpdateRequestSchema;
exports.detailedWeatherQuerySchema = detailedWeatherQuerySchema;
exports.educationDataSchema = educationDataSchema;
exports.elicitationQuestionSchema = elicitationQuestionSchema;
exports.elicitationSessionSchema = elicitationSessionSchema;
exports.escapeHtml = escapeHtml;
exports.fileLinkRequestSchema = fileLinkRequestSchema;
exports.fileUpdateRequestSchema = fileUpdateRequestSchema;
exports.fiscalProfileSchema = fiscalProfileSchema;
exports.fiscalTierSchema = fiscalTierSchema;
exports.forgotPasswordRequestSchema = forgotPasswordRequestSchema;
exports.getIntlLanguage = require_languages.getIntlLanguage;
exports.getLocaleForLanguage = require_languages.getLocaleForLanguage;
exports.hardFilterProposalSchema = hardFilterProposalSchema;
exports.hardFilterSchema = hardFilterSchema;
exports.healthOutcomesDataSchema = healthOutcomesDataSchema;
exports.healthcareDataSchema = healthcareDataSchema;
exports.hourlyEntrySchema = hourlyEntrySchema;
exports.idParamSchema = idParamSchema;
exports.idSchema = idSchema;
exports.implicitSignalSchema = implicitSignalSchema;
exports.inAppListResultSchema = inAppListResultSchema;
exports.isRtlLanguage = require_languages.isRtlLanguage;
exports.isoDateTime = isoDateTime;
exports.journeyAddTripRequestSchema = journeyAddTripRequestSchema;
exports.journeyContributorRequestSchema = journeyContributorRequestSchema;
exports.journeyCreateRequestSchema = journeyCreateRequestSchema;
exports.journeyDecisionSchema = journeyDecisionSchema;
exports.journeyPreferencesSchema = journeyPreferencesSchema;
exports.journeyProviderPhotosRequestSchema = journeyProviderPhotosRequestSchema;
exports.journeyReorderEntriesRequestSchema = journeyReorderEntriesRequestSchema;
exports.journeyShareLinkRequestSchema = journeyShareLinkRequestSchema;
exports.journeyTimelineSchema = journeyTimelineSchema;
exports.journeyTimelineTaskSchema = journeyTimelineTaskSchema;
exports.locationSchema = locationSchema;
exports.loginRequestSchema = loginRequestSchema;
exports.mapsAutocompleteRequestSchema = mapsAutocompleteRequestSchema;
exports.mapsAutocompleteResultSchema = mapsAutocompleteResultSchema;
exports.mapsAutocompleteSuggestionSchema = mapsAutocompleteSuggestionSchema;
exports.mapsPlaceDetailsResultSchema = mapsPlaceDetailsResultSchema;
exports.mapsPlacePhotoResultSchema = mapsPlacePhotoResultSchema;
exports.mapsResolveUrlRequestSchema = mapsResolveUrlRequestSchema;
exports.mapsResolveUrlResultSchema = mapsResolveUrlResultSchema;
exports.mapsReverseQuerySchema = mapsReverseQuerySchema;
exports.mapsReverseResultSchema = mapsReverseResultSchema;
exports.mapsSearchRequestSchema = mapsSearchRequestSchema;
exports.mapsSearchResultSchema = mapsSearchResultSchema;
exports.markRegionRequestSchema = markRegionRequestSchema;
exports.mcpTokenCreateRequestSchema = mcpTokenCreateRequestSchema;
exports.mfaEnableRequestSchema = mfaEnableRequestSchema;
exports.mfaVerifyLoginRequestSchema = mfaVerifyLoginRequestSchema;
exports.mobilityDataSchema = mobilityDataSchema;
exports.moveContextSchema = moveContextSchema;
exports.nonEmptyString = nonEmptyString;
exports.noticeDisplaySchema = noticeDisplaySchema;
exports.noticeSeveritySchema = noticeSeveritySchema;
exports.notificationRespondRequestSchema = notificationRespondRequestSchema;
exports.notificationRowSchema = notificationRowSchema;
exports.oauthClientCreateRequestSchema = oauthClientCreateRequestSchema;
exports.oauthConsentRequestSchema = oauthConsentRequestSchema;
exports.oauthTokenRequestSchema = oauthTokenRequestSchema;
exports.oidcCallbackQuerySchema = oidcCallbackQuerySchema;
exports.oidcExchangeQuerySchema = oidcExchangeQuerySchema;
exports.packingBagMemberSchema = packingBagMemberSchema;
exports.packingBagMembersRequestSchema = packingBagMembersRequestSchema;
exports.packingBagSchema = packingBagSchema;
exports.packingCategoryAssigneesRequestSchema = packingCategoryAssigneesRequestSchema;
exports.packingCreateBagRequestSchema = packingCreateBagRequestSchema;
exports.packingCreateItemRequestSchema = packingCreateItemRequestSchema;
exports.packingImportRequestSchema = packingImportRequestSchema;
exports.packingItemSchema = packingItemSchema;
exports.packingReorderRequestSchema = packingReorderRequestSchema;
exports.packingSaveTemplateRequestSchema = packingSaveTemplateRequestSchema;
exports.packingTemplateSummarySchema = packingTemplateSummarySchema;
exports.packingTemplatesResponseSchema = packingTemplatesResponseSchema;
exports.packingUpdateBagRequestSchema = packingUpdateBagRequestSchema;
exports.packingUpdateItemRequestSchema = packingUpdateItemRequestSchema;
exports.paginationQuerySchema = paginationQuerySchema;
exports.photoVariantSchema = photoVariantSchema;
exports.placeBulkDeleteRequestSchema = placeBulkDeleteRequestSchema;
exports.placeCategorySchema = placeCategorySchema;
exports.placeCreateRequestSchema = placeCreateRequestSchema;
exports.placeImportListRequestSchema = placeImportListRequestSchema;
exports.placeListQuerySchema = placeListQuerySchema;
exports.placeSchema = placeSchema;
exports.placeUpdateRequestSchema = placeUpdateRequestSchema;
exports.preferencesUpdateRequestSchema = preferencesUpdateRequestSchema;
exports.provenanceRefSchema = provenanceRefSchema;
exports.publicConfigSchema = publicConfigSchema;
exports.regionGeoSchema = regionGeoSchema;
exports.registerRequestSchema = registerRequestSchema;
exports.relocationJourneySchema = relocationJourneySchema;
exports.reservationCreateRequestSchema = reservationCreateRequestSchema;
exports.reservationEndpointSchema = reservationEndpointSchema;
exports.reservationPositionsRequestSchema = reservationPositionsRequestSchema;
exports.reservationSchema = reservationSchema;
exports.reservationUpdateRequestSchema = reservationUpdateRequestSchema;
exports.resetPasswordRequestSchema = resetPasswordRequestSchema;
exports.sanitizeInlineHtml = sanitizeInlineHtml;
exports.sanitizeRichTextHtml = sanitizeRichTextHtml;
exports.scoreRangeSchema = scoreRangeSchema;
exports.scoreRequestSchema = scoreRequestSchema;
exports.scoreResponseSchema = scoreResponseSchema;
exports.settingUpsertRequestSchema = settingUpsertRequestSchema;
exports.settingsBulkRequestSchema = settingsBulkRequestSchema;
exports.shareLinkRequestSchema = shareLinkRequestSchema;
exports.statedPrioritySchema = statedPrioritySchema;
exports.systemNoticeDtoSchema = systemNoticeDtoSchema;
exports.tagListResponseSchema = tagListResponseSchema;
exports.tagSchema = tagSchema;
exports.testNtfyRequestSchema = testNtfyRequestSchema;
exports.testSmtpRequestSchema = testSmtpRequestSchema;
exports.testWebhookRequestSchema = testWebhookRequestSchema;
exports.todoCategoryAssigneesRequestSchema = todoCategoryAssigneesRequestSchema;
exports.todoCreateItemRequestSchema = todoCreateItemRequestSchema;
exports.todoReorderRequestSchema = todoReorderRequestSchema;
exports.todoUpdateItemRequestSchema = todoUpdateItemRequestSchema;
exports.topMatchSchema = topMatchSchema;
exports.transportationDataSchema = transportationDataSchema;
exports.tripAddMemberRequestSchema = tripAddMemberRequestSchema;
exports.tripCopyRequestSchema = tripCopyRequestSchema;
exports.tripCreateRequestSchema = tripCreateRequestSchema;
exports.tripMemberSchema = tripMemberSchema;
exports.tripSchema = tripSchema;
exports.tripUpdateRequestSchema = tripUpdateRequestSchema;
exports.typeToCostCategory = typeToCostCategory;
exports.unreadCountResultSchema = unreadCountResultSchema;
exports.updateBucketItemRequestSchema = updateBucketItemRequestSchema;
exports.updateCategoryRequestSchema = updateCategoryRequestSchema;
exports.updateTagRequestSchema = updateTagRequestSchema;
exports.userProfileSchema = userProfileSchema;
exports.vacayAddHolidayCalendarRequestSchema = vacayAddHolidayCalendarRequestSchema;
exports.vacayAddYearRequestSchema = vacayAddYearRequestSchema;
exports.vacayCompanyHolidayRequestSchema = vacayCompanyHolidayRequestSchema;
exports.vacayInviteActionRequestSchema = vacayInviteActionRequestSchema;
exports.vacayInviteRequestSchema = vacayInviteRequestSchema;
exports.vacayPlanDataSchema = vacayPlanDataSchema;
exports.vacaySetColorRequestSchema = vacaySetColorRequestSchema;
exports.vacayToggleEntryRequestSchema = vacayToggleEntryRequestSchema;
exports.vacayUpdateStatsRequestSchema = vacayUpdateStatsRequestSchema;
exports.viewportBoundsSchema = viewportBoundsSchema;
exports.viewportStatsResponseSchema = viewportStatsResponseSchema;
exports.walkabilityDataSchema = walkabilityDataSchema;
exports.weatherQuerySchema = weatherQuerySchema;
exports.weatherResultSchema = weatherResultSchema;
