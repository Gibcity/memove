"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerMapsWeatherTools = registerMapsWeatherTools;
const zod_1 = require("zod");
const airportService_1 = require("../../services/airportService");
const mapsService_1 = require("../../services/mapsService");
const weatherService_1 = require("../../services/weatherService");
const _shared_1 = require("./_shared");
const scopes_1 = require("../scopes");
function registerMapsWeatherTools(server, userId, scopes) {
    const canGeo = (0, scopes_1.canRead)(scopes, 'geo');
    const canWeather = (0, scopes_1.canRead)(scopes, 'weather');
    // --- MAPS EXTRAS ---
    if (canGeo)
        server.registerTool('get_place_details', {
            description: 'Fetch detailed information about a place by its Google Place ID.',
            inputSchema: {
                placeId: zod_1.z.string().describe('Google Place ID'),
                lang: zod_1.z.string().optional().default('en'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ placeId, lang }) => {
            const details = await (0, mapsService_1.getPlaceDetails)(userId, placeId, lang ?? 'en');
            if (!details)
                return { content: [{ type: 'text', text: 'Place not found or maps service not configured.' }], isError: true };
            return (0, _shared_1.ok)({ details });
        });
    if (canGeo)
        server.registerTool('reverse_geocode', {
            description: 'Get a human-readable address for given coordinates.',
            inputSchema: {
                lat: zod_1.z.number(),
                lng: zod_1.z.number(),
                lang: zod_1.z.string().optional().default('en'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ lat, lng, lang }) => {
            const result = await (0, mapsService_1.reverseGeocode)(String(lat), String(lng), lang ?? 'en');
            if (!result)
                return { content: [{ type: 'text', text: 'Reverse geocode failed or maps service not configured.' }], isError: true };
            return (0, _shared_1.ok)(result);
        });
    if (canGeo)
        server.registerTool('resolve_maps_url', {
            description: 'Resolve a Google Maps share URL to coordinates and place name.',
            inputSchema: {
                url: zod_1.z.string().describe('Google Maps share URL'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ url }) => {
            const result = await (0, mapsService_1.resolveGoogleMapsUrl)(url);
            if (!result)
                return { content: [{ type: 'text', text: 'Could not resolve URL or maps service not configured.' }], isError: true };
            return (0, _shared_1.ok)(result);
        });
    // --- WEATHER ---
    if (canWeather)
        server.registerTool('get_weather', {
            description: 'Get weather forecast for a location and date.',
            inputSchema: {
                lat: zod_1.z.number(),
                lng: zod_1.z.number(),
                date: zod_1.z.string().describe('ISO date YYYY-MM-DD'),
                lang: zod_1.z.string().optional().default('en'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ lat, lng, date, lang }) => {
            try {
                const weather = await (0, weatherService_1.getWeather)(String(lat), String(lng), date, lang ?? 'en');
                return (0, _shared_1.ok)({ weather });
            }
            catch (err) {
                return { content: [{ type: 'text', text: err?.message ?? 'Weather service not available.' }], isError: true };
            }
        });
    if (canWeather)
        server.registerTool('get_detailed_weather', {
            description: 'Get hourly/detailed weather forecast for a location and date.',
            inputSchema: {
                lat: zod_1.z.number(),
                lng: zod_1.z.number(),
                date: zod_1.z.string().describe('ISO date YYYY-MM-DD'),
                lang: zod_1.z.string().optional().default('en'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ lat, lng, date, lang }) => {
            try {
                const weather = await (0, weatherService_1.getDetailedWeather)(String(lat), String(lng), date, lang ?? 'en');
                return (0, _shared_1.ok)({ weather });
            }
            catch (err) {
                return { content: [{ type: 'text', text: err?.message ?? 'Weather service not available.' }], isError: true };
            }
        });
    // --- AIRPORTS ---
    if (canGeo)
        server.registerTool('search_airports', {
            description: 'Search for airports by name, city, or IATA code. Returns matching airports with IATA code, name, city, country, coordinates, and timezone. Use before create_transport (flight) to get the correct IATA code and timezone for endpoints.',
            inputSchema: {
                query: zod_1.z.string().min(1).max(200).describe('Airport name, city, or IATA code (e.g. "zurich", "ZRH", "charles de gaulle")'),
                limit: zod_1.z.number().int().min(1).max(50).optional().default(10),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ query, limit }) => {
            const airports = (0, airportService_1.searchAirports)(query, limit ?? 10);
            return (0, _shared_1.ok)({ airports });
        });
    if (canGeo)
        server.registerTool('get_airport', {
            description: 'Get a single airport by its IATA code. Returns name, city, country, coordinates, and timezone.',
            inputSchema: {
                iata: zod_1.z.string().length(3).toUpperCase().describe('IATA airport code (e.g. "ZRH", "AMS", "CDG")'),
            },
            annotations: _shared_1.TOOL_ANNOTATIONS_READONLY,
        }, async ({ iata }) => {
            const airport = (0, airportService_1.findByIata)(iata);
            if (!airport)
                return { content: [{ type: 'text', text: 'Airport not found.' }], isError: true };
            return (0, _shared_1.ok)({ airport });
        });
}
