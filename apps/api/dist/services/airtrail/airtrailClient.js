"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirtrailRequestError = exports.AirtrailAuthError = void 0;
exports.listFlights = listFlights;
exports.getFlight = getFlight;
exports.saveFlight = saveFlight;
const ssrfGuard_1 = require("../../utils/ssrfGuard");
/**
 * Thin HTTP client for the AirTrail REST API (github.com/johanohly/AirTrail).
 * This is the ONLY place that talks to a user's AirTrail instance.
 *
 * Verified against AirTrail source:
 *  - Auth: `Authorization: Bearer <key>`; a key maps to exactly one user.
 *  - GET  /api/flight/list   — defaults to scope=mine. We NEVER send a scope
 *    param so the key only ever returns its owner's own flights (isolation
 *    holds even if an admin key is pasted).
 *  - GET  /api/flight/get/{id}
 *  - POST /api/flight/save   — `id` present => update, else create. seats[] is
 *    required (>=1). A seat with userId '<USER_ID>' is attributed to the key
 *    owner server-side, so we never need the caller's AirTrail user id.
 *  - There is no webhook and no updated_at on a flight, so change detection is
 *    snapshot-hash based (see airtrailSync).
 */
const TIMEOUT_MS = 12000;
class AirtrailAuthError extends Error {
    constructor(message = 'AirTrail rejected the API key') {
        super(message);
        this.name = 'AirtrailAuthError';
    }
}
exports.AirtrailAuthError = AirtrailAuthError;
class AirtrailRequestError extends Error {
    status;
    constructor(message, status) {
        super(message);
        this.name = 'AirtrailRequestError';
        this.status = status;
    }
}
exports.AirtrailRequestError = AirtrailRequestError;
function apiBase(baseUrl) {
    // Tolerate a pasted trailing slash or '/api' suffix so we never build '/api/api'.
    const origin = baseUrl.trim().replace(/\/+$/, '').replace(/\/api$/i, '');
    return origin + '/api';
}
/**
 * Parse a response as JSON, but turn the cryptic "Unexpected token '<'" that a
 * misconfigured URL produces (AirTrail serving its SPA / an auth-proxy login
 * page) into an actionable message.
 */
async function parseJson(resp) {
    const text = await resp.text();
    try {
        return JSON.parse(text);
    }
    catch {
        throw new AirtrailRequestError('AirTrail returned a non-JSON response. Check the URL is your AirTrail base URL (e.g. https://airtrail.example.com, without /api) and that the instance is reachable without a separate login.');
    }
}
async function request(creds, path, init) {
    const url = apiBase(creds.baseUrl) + path;
    let resp;
    try {
        resp = await (0, ssrfGuard_1.safeFetch)(url, {
            ...init,
            headers: {
                Authorization: `Bearer ${creds.apiKey}`,
                Accept: 'application/json',
                ...(init.headers || {}),
            },
            signal: AbortSignal.timeout(TIMEOUT_MS),
        }, { rejectUnauthorized: !creds.allowInsecureTls });
    }
    catch (err) {
        throw new AirtrailRequestError(err instanceof Error ? err.message : 'Could not reach AirTrail');
    }
    if (resp.status === 401 || resp.status === 403) {
        throw new AirtrailAuthError();
    }
    return resp;
}
async function listFlights(creds) {
    const resp = await request(creds, '/flight/list', { method: 'GET' });
    if (!resp.ok)
        throw new AirtrailRequestError(`AirTrail list failed (HTTP ${resp.status})`, resp.status);
    const data = await parseJson(resp);
    return data.flights ?? [];
}
async function getFlight(creds, id) {
    const resp = await request(creds, `/flight/get/${id}`, { method: 'GET' });
    if (resp.status === 404)
        return null;
    if (!resp.ok)
        throw new AirtrailRequestError(`AirTrail get failed (HTTP ${resp.status})`, resp.status);
    const data = await parseJson(resp);
    return data.flight ?? null;
}
async function saveFlight(creds, payload) {
    const resp = await request(creds, '/flight/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!resp.ok) {
        let msg = `AirTrail save failed (HTTP ${resp.status})`;
        try {
            const body = (await resp.json());
            if (body?.message)
                msg = body.message;
            else if (body?.errors)
                msg = JSON.stringify(body.errors);
        }
        catch {
            /* keep the generic message */
        }
        throw new AirtrailRequestError(msg, resp.status);
    }
    const data = await parseJson(resp);
    return { id: data.id };
}
