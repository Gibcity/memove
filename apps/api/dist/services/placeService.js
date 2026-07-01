"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KMZ_DECOMPRESSED_SIZE_LIMIT = void 0;
exports.listPlaces = listPlaces;
exports.createPlace = createPlace;
exports.getPlace = getPlace;
exports.updatePlace = updatePlace;
exports.deletePlace = deletePlace;
exports.deletePlacesMany = deletePlacesMany;
exports.importGpx = importGpx;
exports.importKmlPlaces = importKmlPlaces;
exports.unpackKmzToKml = unpackKmzToKml;
exports.importKmzPlaces = importKmzPlaces;
exports.importMapFile = importMapFile;
exports.importGoogleList = importGoogleList;
exports.importNaverList = importNaverList;
exports.searchPlaceImage = searchPlaceImage;
const fast_xml_parser_1 = require("fast-xml-parser");
const unzipper_1 = __importDefault(require("unzipper"));
const database_1 = require("../db/database");
const queryHelpers_1 = require("./queryHelpers");
const ssrfGuard_1 = require("../utils/ssrfGuard");
const kmlImport_1 = require("./kmlImport");
const placeEnrichment_1 = require("./placeEnrichment");
const placePhotoCache = __importStar(require("./placePhotoCache"));
// Reclaim a deleted place's cached marker photo if nothing else references it.
// The cache key is the Google place_id, or — for coordinate-only places — the
// pseudo-id embedded in the stored proxy URL (/api/maps/place-photo/{id}/bytes).
function reclaimPhotoCache(googlePlaceId, imageUrl) {
    const candidates = new Set();
    if (googlePlaceId)
        candidates.add(googlePlaceId);
    const m = imageUrl?.match(/^\/api\/maps\/place-photo\/(.+)\/bytes$/);
    if (m) {
        try {
            candidates.add(decodeURIComponent(m[1]));
        }
        catch { /* malformed url */ }
    }
    for (const id of candidates) {
        try {
            placePhotoCache.removeIfUnreferenced(id);
        }
        catch { /* best-effort */ }
    }
}
// ---------------------------------------------------------------------------
// List places
// ---------------------------------------------------------------------------
function listPlaces(tripId, filters) {
    let query = `
    SELECT DISTINCT p.*, c.name as category_name, c.color as category_color, c.icon as category_icon
    FROM places p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.trip_id = ?
  `;
    const params = [tripId];
    if (filters.search) {
        query += ' AND (p.name LIKE ? OR p.address LIKE ? OR p.description LIKE ?)';
        const searchParam = `%${filters.search}%`;
        params.push(searchParam, searchParam, searchParam);
    }
    if (filters.category) {
        query += ' AND p.category_id = ?';
        params.push(filters.category);
    }
    if (filters.tag) {
        query += ' AND p.id IN (SELECT place_id FROM place_tags WHERE tag_id = ?)';
        params.push(filters.tag);
    }
    if (filters.assignment === 'unassigned') {
        query += ` AND p.id NOT IN (SELECT da.place_id FROM day_assignments da JOIN days d ON da.day_id = d.id WHERE d.trip_id = ?)`;
        params.push(tripId);
    }
    else if (filters.assignment === 'assigned') {
        query += ` AND p.id IN (SELECT da.place_id FROM day_assignments da JOIN days d ON da.day_id = d.id WHERE d.trip_id = ?)`;
        params.push(tripId);
    }
    query += ' ORDER BY p.created_at DESC';
    const places = database_1.db.prepare(query).all(...params);
    const placeIds = places.map(p => p.id);
    const tagsByPlaceId = (0, queryHelpers_1.loadTagsByPlaceIds)(placeIds);
    return places.map(p => ({
        ...p,
        category: p.category_id ? {
            id: p.category_id,
            name: p.category_name,
            color: p.category_color,
            icon: p.category_icon,
        } : null,
        tags: tagsByPlaceId[p.id] || [],
    }));
}
// ---------------------------------------------------------------------------
// Create place
// ---------------------------------------------------------------------------
function createPlace(tripId, body) {
    const { name, description, lat, lng, address, category_id, price, currency, place_time, end_time, duration_minutes, notes, image_url, google_place_id, osm_id, website, phone, transport_mode, tags = [], } = body;
    const result = database_1.db.prepare(`
    INSERT INTO places (trip_id, name, description, lat, lng, address, category_id, price, currency,
      place_time, end_time,
      duration_minutes, notes, image_url, google_place_id, osm_id, website, phone, transport_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tripId, name, description || null, lat || null, lng || null, address || null, category_id || null, price || null, currency || null, place_time || null, end_time || null, duration_minutes || 60, notes || null, image_url || null, google_place_id || null, osm_id || null, website || null, phone || null, transport_mode || 'walking');
    const placeId = result.lastInsertRowid;
    if (tags && tags.length > 0) {
        const insertTag = database_1.db.prepare('INSERT OR IGNORE INTO place_tags (place_id, tag_id) VALUES (?, ?)');
        for (const tagId of tags) {
            insertTag.run(placeId, tagId);
        }
    }
    return (0, database_1.getPlaceWithTags)(Number(placeId));
}
// ---------------------------------------------------------------------------
// Get single place
// ---------------------------------------------------------------------------
function getPlace(tripId, placeId) {
    const placeCheck = database_1.db.prepare('SELECT id FROM places WHERE id = ? AND trip_id = ?').get(placeId, tripId);
    if (!placeCheck)
        return null;
    return (0, database_1.getPlaceWithTags)(placeId);
}
// ---------------------------------------------------------------------------
// Update place
// ---------------------------------------------------------------------------
function updatePlace(tripId, placeId, body) {
    const existingPlace = database_1.db.prepare('SELECT * FROM places WHERE id = ? AND trip_id = ?').get(placeId, tripId);
    if (!existingPlace)
        return null;
    const { name, description, lat, lng, address, category_id, price, currency, place_time, end_time, duration_minutes, notes, image_url, google_place_id, osm_id, website, phone, transport_mode, tags, } = body;
    database_1.db.prepare(`
    UPDATE places SET
      name = COALESCE(?, name),
      description = ?,
      lat = ?,
      lng = ?,
      address = ?,
      category_id = ?,
      price = ?,
      currency = COALESCE(?, currency),
      place_time = ?,
      end_time = ?,
      duration_minutes = COALESCE(?, duration_minutes),
      notes = ?,
      image_url = ?,
      google_place_id = ?,
      osm_id = ?,
      website = ?,
      phone = ?,
      transport_mode = COALESCE(?, transport_mode),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name || null, description !== undefined ? description : existingPlace.description, lat !== undefined ? lat : existingPlace.lat, lng !== undefined ? lng : existingPlace.lng, address !== undefined ? address : existingPlace.address, category_id !== undefined ? category_id : existingPlace.category_id, price !== undefined ? price : existingPlace.price, currency || null, place_time !== undefined ? place_time : existingPlace.place_time, end_time !== undefined ? end_time : existingPlace.end_time, duration_minutes || null, notes !== undefined ? notes : existingPlace.notes, image_url !== undefined ? image_url : existingPlace.image_url, google_place_id !== undefined ? google_place_id : existingPlace.google_place_id, osm_id !== undefined ? osm_id : existingPlace.osm_id, website !== undefined ? website : existingPlace.website, phone !== undefined ? phone : existingPlace.phone, transport_mode || null, placeId);
    if (tags !== undefined) {
        database_1.db.prepare('DELETE FROM place_tags WHERE place_id = ?').run(placeId);
        if (tags.length > 0) {
            const insertTag = database_1.db.prepare('INSERT OR IGNORE INTO place_tags (place_id, tag_id) VALUES (?, ?)');
            for (const tagId of tags) {
                insertTag.run(placeId, tagId);
            }
        }
    }
    return (0, database_1.getPlaceWithTags)(placeId);
}
// ---------------------------------------------------------------------------
// Delete place
// ---------------------------------------------------------------------------
function deletePlace(tripId, placeId) {
    const place = database_1.db.prepare('SELECT google_place_id, image_url FROM places WHERE id = ? AND trip_id = ?').get(placeId, tripId);
    if (!place)
        return false;
    database_1.db.prepare('DELETE FROM places WHERE id = ?').run(placeId);
    reclaimPhotoCache(place.google_place_id, place.image_url);
    return true;
}
function deletePlacesMany(tripId, ids) {
    if (ids.length === 0)
        return [];
    const selectStmt = database_1.db.prepare('SELECT google_place_id, image_url FROM places WHERE id = ? AND trip_id = ?');
    const deleteStmt = database_1.db.prepare('DELETE FROM places WHERE id = ?');
    const deleted = [];
    const reclaimable = [];
    const run = database_1.db.transaction((list) => {
        for (const id of list) {
            const row = selectStmt.get(id, tripId);
            if (!row)
                continue;
            deleteStmt.run(id);
            deleted.push(id);
            reclaimable.push(row);
        }
    });
    run(ids);
    // Reclaim after the transaction commits so isReferenced() sees the final place set.
    for (const row of reclaimable)
        reclaimPhotoCache(row.google_place_id, row.image_url);
    return deleted;
}
// ---------------------------------------------------------------------------
// Import GPX
// ---------------------------------------------------------------------------
const gpxParser = new fast_xml_parser_1.XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['wpt', 'trkpt', 'rtept', 'trk', 'trkseg', 'rte'].includes(name),
});
const kmlParser = new fast_xml_parser_1.XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    isArray: (name) => ['Placemark', 'Folder', 'Document'].includes(name),
    // Treat <description> as raw text so mixed-content HTML (e.g. <br/>, <i>)
    // is returned as a string instead of a parsed object.
    stopNodes: ['*.description'],
});
exports.KMZ_DECOMPRESSED_SIZE_LIMIT = 50 * 1024 * 1024; // 50 MB
// ---------------------------------------------------------------------------
// Import deduplication helpers
// ---------------------------------------------------------------------------
const COORD_DEDUP_TOLERANCE = 0.0001; // ≈ 11 m
/** Build a lookup of names/coords for places already in a trip. */
function buildDedupSet(tripId) {
    const rows = database_1.db.prepare('SELECT name, lat, lng FROM places WHERE trip_id = ?').all(tripId);
    const names = new Set();
    const coords = [];
    for (const row of rows) {
        if (row.name) {
            names.add(row.name.trim().toLowerCase());
        }
        else if (row.lat != null && row.lng != null) {
            coords.push({ lat: row.lat, lng: row.lng });
        }
    }
    return { names, coords };
}
/**
 * Returns true if a candidate place is already represented in the dedup set.
 * Named places match by case-insensitive name; unnamed places fall back to
 * coordinate proximity.
 */
function isPlaceDuplicate(candidate, dedup) {
    const normalizedName = candidate.name?.trim().toLowerCase();
    if (normalizedName)
        return dedup.names.has(normalizedName);
    if (candidate.lat != null && candidate.lng != null) {
        return dedup.coords.some((c) => Math.abs(c.lat - candidate.lat) <= COORD_DEDUP_TOLERANCE &&
            Math.abs(c.lng - candidate.lng) <= COORD_DEDUP_TOLERANCE);
    }
    return false;
}
/** Record a newly inserted place so subsequent candidates in the same batch are checked against it. */
function trackInsertedInDedupSet(place, dedup) {
    const normalizedName = place.name?.trim().toLowerCase();
    if (normalizedName) {
        dedup.names.add(normalizedName);
    }
    else if (place.lat != null && place.lng != null) {
        dedup.coords.push({ lat: place.lat, lng: place.lng });
    }
}
function importGpx(tripId, fileBuffer, opts = {}) {
    const { importWaypoints = true, importRoutes = true, importTracks = true, defaultName } = opts;
    const parsed = gpxParser.parse(fileBuffer.toString('utf-8'));
    const gpx = parsed?.gpx;
    if (!gpx)
        return null;
    const str = (v) => (v != null ? String(v).trim() : null);
    const num = (v) => { const n = parseFloat(String(v)); return isNaN(n) ? null : n; };
    // Routes and tracks rarely carry their own <name>. Without one they all fall back to the
    // same generic label, so name-based dedup drops every import after the first. Derive a
    // base from the source filename (the requested behaviour) and suffix an index so multiple
    // geometries from one file stay distinct.
    const rawName = str(defaultName);
    const baseName = rawName ? rawName.replace(/\.[^.]+$/, '').trim() || rawName : null;
    let geoSeq = 0;
    const geoName = (explicit, fallback) => {
        if (explicit)
            return explicit;
        geoSeq++;
        const base = baseName || fallback;
        return geoSeq === 1 ? base : `${base} ${geoSeq}`;
    };
    const waypoints = [];
    // 1) Parse <wpt> elements (named waypoints / POIs)
    if (importWaypoints) {
        for (const wpt of gpx.wpt ?? []) {
            const lat = num(wpt['@_lat']);
            const lng = num(wpt['@_lon']);
            if (lat === null || lng === null)
                continue;
            waypoints.push({ lat, lng, name: str(wpt.name) || `Waypoint ${waypoints.length + 1}`, description: str(wpt.desc) });
        }
    }
    // 2) Parse <rte> routes as polyline-places (one place per route with route_geometry)
    if (importRoutes) {
        for (const rte of gpx.rte ?? []) {
            const pts = (rte.rtept ?? [])
                .map((pt) => ({ lat: num(pt['@_lat']), lng: num(pt['@_lon']), ele: num(pt['ele']) }))
                .filter((p) => p.lat !== null && p.lng !== null);
            if (pts.length === 0)
                continue;
            const hasAllEle = pts.every(p => p.ele !== null);
            const routeGeometry = pts.map(p => hasAllEle ? [p.lat, p.lng, p.ele] : [p.lat, p.lng]);
            waypoints.push({ lat: pts[0].lat, lng: pts[0].lng, name: geoName(str(rte.name), 'GPX Route'), description: str(rte.desc), routeGeometry: JSON.stringify(routeGeometry) });
        }
    }
    // 3) Extract full track geometry from <trk>
    if (importTracks) {
        for (const trk of gpx.trk ?? []) {
            const trackPoints = [];
            for (const seg of trk.trkseg ?? []) {
                for (const pt of seg.trkpt ?? []) {
                    const lat = num(pt['@_lat']);
                    const lng = num(pt['@_lon']);
                    if (lat === null || lng === null)
                        continue;
                    trackPoints.push({ lat, lng, ele: num(pt.ele) });
                }
            }
            if (trackPoints.length === 0)
                continue;
            const start = trackPoints[0];
            const hasAllEle = trackPoints.every(p => p.ele !== null);
            const routeGeometry = trackPoints.map(p => hasAllEle ? [p.lat, p.lng, p.ele] : [p.lat, p.lng]);
            waypoints.push({ lat: start.lat, lng: start.lng, name: geoName(str(trk.name), 'GPX Track'), description: str(trk.desc), routeGeometry: JSON.stringify(routeGeometry) });
        }
    }
    if (waypoints.length === 0)
        return null;
    const dedup = buildDedupSet(tripId);
    const insertStmt = database_1.db.prepare(`
    INSERT INTO places (trip_id, name, description, lat, lng, transport_mode, route_geometry)
    VALUES (?, ?, ?, ?, ?, 'walking', ?)
  `);
    const created = [];
    let skipped = 0;
    const insertAll = database_1.db.transaction(() => {
        for (const wp of waypoints) {
            if (isPlaceDuplicate({ name: wp.name, lat: wp.lat, lng: wp.lng }, dedup)) {
                skipped++;
                continue;
            }
            const result = insertStmt.run(tripId, wp.name, wp.description, wp.lat, wp.lng, wp.routeGeometry || null);
            const place = (0, database_1.getPlaceWithTags)(Number(result.lastInsertRowid));
            created.push(place);
            trackInsertedInDedupSet({ name: wp.name, lat: wp.lat, lng: wp.lng }, dedup);
        }
    });
    insertAll();
    return { places: created, count: created.length, skipped };
}
function importKmlPlaces(tripId, fileBuffer, opts = {}) {
    const { importPoints = true, importPaths = true } = opts;
    const decoded = (0, kmlImport_1.decodeUtf8WithWarning)(fileBuffer);
    const validationResult = fast_xml_parser_1.XMLValidator.validate(decoded.text);
    if (validationResult !== true) {
        throw new Error('Malformed KML: invalid XML structure');
    }
    const parsed = kmlParser.parse(decoded.text);
    const kmlRoot = parsed?.kml ?? parsed;
    if (!kmlRoot || typeof kmlRoot !== 'object') {
        throw new Error('Malformed KML: could not parse XML');
    }
    const placemarkNodes = (0, kmlImport_1.extractKmlPlacemarkNodes)(kmlRoot);
    const summary = (0, kmlImport_1.createKmlImportSummary)(placemarkNodes.length);
    if (decoded.warning) {
        summary.warnings.push(decoded.warning);
    }
    const categories = database_1.db.prepare('SELECT id, name FROM categories').all();
    const categoryLookup = (0, kmlImport_1.buildCategoryNameLookup)(categories);
    const dedup = buildDedupSet(tripId);
    const created = [];
    let dupCount = 0;
    const insertStmt = database_1.db.prepare(`
    INSERT INTO places (trip_id, name, description, lat, lng, category_id, transport_mode, route_geometry)
    VALUES (?, ?, ?, ?, ?, ?, 'walking', ?)
  `);
    const insertAll = database_1.db.transaction(() => {
        let fallbackIndex = 1;
        for (const node of placemarkNodes) {
            const parsedPlacemark = (0, kmlImport_1.parsePlacemarkNode)(node);
            const isPath = parsedPlacemark.routeGeometry !== null;
            // Unsupported geometry type (polygon, multi-geometry, no geometry, etc.)
            if (parsedPlacemark.lat === null || parsedPlacemark.lng === null) {
                summary.skippedCount += 1;
                summary.errors.push(`Skipped Placemark ${fallbackIndex}: unsupported geometry type.`);
                fallbackIndex += 1;
                continue;
            }
            // Type filtering: respect importPoints / importPaths opts
            if (isPath && !importPaths) {
                summary.skippedCount += 1;
                fallbackIndex += 1;
                continue;
            }
            if (!isPath && !importPoints) {
                summary.skippedCount += 1;
                fallbackIndex += 1;
                continue;
            }
            const fallbackName = `Placemark ${fallbackIndex}`;
            const name = parsedPlacemark.name || fallbackName;
            if (isPlaceDuplicate({ name, lat: parsedPlacemark.lat, lng: parsedPlacemark.lng }, dedup)) {
                summary.skippedCount += 1;
                dupCount++;
                fallbackIndex += 1;
                continue;
            }
            const categoryId = (0, kmlImport_1.resolveCategoryIdForFolder)(parsedPlacemark.folderName, categoryLookup);
            const result = insertStmt.run(tripId, name, parsedPlacemark.description, parsedPlacemark.lat, parsedPlacemark.lng, categoryId, parsedPlacemark.routeGeometry);
            const place = (0, database_1.getPlaceWithTags)(Number(result.lastInsertRowid));
            created.push(place);
            trackInsertedInDedupSet({ name, lat: parsedPlacemark.lat, lng: parsedPlacemark.lng }, dedup);
            summary.createdCount += 1;
            fallbackIndex += 1;
        }
    });
    insertAll();
    if (dupCount > 0) {
        summary.warnings.push(`${dupCount} place${dupCount > 1 ? 's' : ''} skipped (already in trip).`);
    }
    if (summary.totalPlacemarks === 0) {
        summary.errors.push('No Placemarks found in KML file.');
    }
    return { places: created, count: created.length, summary };
}
async function unpackKmzToKml(kmzBuffer, decompressedSizeLimit = exports.KMZ_DECOMPRESSED_SIZE_LIMIT) {
    let zip;
    try {
        zip = await unzipper_1.default.Open.buffer(kmzBuffer);
    }
    catch {
        throw new Error('Invalid KMZ archive.');
    }
    const kmlEntries = zip.files.filter((entry) => !entry.path.endsWith('/') && entry.path.toLowerCase().endsWith('.kml'));
    if (kmlEntries.length === 0) {
        throw new Error('KMZ archive does not contain a KML file.');
    }
    const preferredEntry = kmlEntries.find((entry) => entry.path.toLowerCase().endsWith('doc.kml')) || kmlEntries[0];
    if (preferredEntry.uncompressedSize > decompressedSizeLimit) {
        throw new Error('KMZ archive exceeds the maximum allowed decompressed size.');
    }
    return preferredEntry.buffer();
}
async function importKmzPlaces(tripId, kmzBuffer, opts = {}) {
    const kmlBuffer = await unpackKmzToKml(kmzBuffer);
    return importKmlPlaces(tripId, kmlBuffer, opts);
}
async function importMapFile(tripId, fileBuffer, filename, opts = {}) {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'kmz')
        return importKmzPlaces(tripId, fileBuffer, opts);
    if (ext === 'kml')
        return importKmlPlaces(tripId, fileBuffer, opts);
    throw new Error(`Unsupported map file format: .${ext}. Please upload a .kml or .kmz file.`);
}
// ---------------------------------------------------------------------------
// Import Google Maps list
// ---------------------------------------------------------------------------
async function importGoogleList(tripId, url, opts) {
    let listId = null;
    let resolvedUrl = url;
    // SSRF guard: validate user-supplied URL before fetching
    const ssrf = await (0, ssrfGuard_1.checkSsrf)(url);
    if (!ssrf.allowed)
        return { error: 'URL is not allowed', status: 400 };
    // Follow redirects for short URLs (maps.app.goo.gl, goo.gl). Redirects are
    // followed manually so every hop is re-checked against the SSRF guard — a
    // short link that 302s to an internal IP is blocked even though the initial
    // host is public.
    if (url.includes('goo.gl') || url.includes('maps.app')) {
        try {
            const redirectRes = await (0, ssrfGuard_1.safeFetchFollow)(url, { signal: AbortSignal.timeout(10000) });
            resolvedUrl = redirectRes.url;
        }
        catch (err) {
            if (err instanceof ssrfGuard_1.SsrfBlockedError)
                return { error: 'URL is not allowed', status: 400 };
            throw err;
        }
    }
    // Pattern: /placelists/list/{ID}
    const plMatch = resolvedUrl.match(/placelists\/list\/([A-Za-z0-9_-]+)/);
    if (plMatch)
        listId = plMatch[1];
    // Pattern: !2s{ID} in data URL params
    if (!listId) {
        const dataMatch = resolvedUrl.match(/!2s([A-Za-z0-9_-]{15,})/);
        if (dataMatch)
            listId = dataMatch[1];
    }
    if (!listId) {
        return { error: 'Could not extract list ID from URL. Please use a shared Google Maps list link.', status: 400 };
    }
    // Fetch list data from Google Maps internal API
    const apiUrl = `https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=en&gl=us&pb=!1m1!1s${encodeURIComponent(listId)}!2e2!3e2!4i500!16b1`;
    const apiRes = await fetch(apiUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(15000),
    });
    if (!apiRes.ok) {
        return { error: 'Failed to fetch list from Google Maps', status: 502 };
    }
    const rawText = await apiRes.text();
    const jsonStr = rawText.substring(rawText.indexOf('\n') + 1);
    const listData = JSON.parse(jsonStr);
    const meta = listData[0];
    if (!meta) {
        return { error: 'Invalid list data received from Google Maps', status: 400 };
    }
    const listName = meta[4] || 'Google Maps List';
    const items = meta[8];
    if (!Array.isArray(items) || items.length === 0) {
        return { error: 'List is empty or could not be read', status: 400 };
    }
    // Parse place data from items
    const places = [];
    for (const item of items) {
        const coords = item?.[1]?.[5];
        const lat = coords?.[2];
        const lng = coords?.[3];
        const name = item?.[2];
        const note = item?.[3] || null;
        if (name && typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
            places.push({ name, lat, lng, notes: note || null });
        }
    }
    if (places.length === 0) {
        return { error: 'No places with coordinates found in list', status: 400 };
    }
    const dedup = buildDedupSet(tripId);
    const insertStmt = database_1.db.prepare(`
    INSERT INTO places (trip_id, name, lat, lng, notes, transport_mode)
    VALUES (?, ?, ?, ?, ?, 'walking')
  `);
    const created = [];
    let skipped = 0;
    const insertAll = database_1.db.transaction(() => {
        for (const p of places) {
            if (isPlaceDuplicate({ name: p.name, lat: p.lat, lng: p.lng }, dedup)) {
                skipped++;
                continue;
            }
            const result = insertStmt.run(tripId, p.name, p.lat, p.lng, p.notes);
            const place = (0, database_1.getPlaceWithTags)(Number(result.lastInsertRowid));
            created.push(place);
            trackInsertedInDedupSet({ name: p.name, lat: p.lat, lng: p.lng }, dedup);
        }
    });
    insertAll();
    if (opts?.enrich && opts.userId && created.length) {
        void (0, placeEnrichment_1.enrichImportedPlaces)(tripId, opts.userId, created, opts.lang);
    }
    return { places: created, listName, skipped };
}
// ---------------------------------------------------------------------------
// Import Naver Maps list
// ---------------------------------------------------------------------------
async function importNaverList(tripId, url, opts) {
    let resolvedUrl = url;
    const limit = 20;
    // SSRF guard: validate user-supplied URL before fetching
    const ssrf = await (0, ssrfGuard_1.checkSsrf)(url);
    if (!ssrf.allowed)
        return { error: 'URL is not allowed', status: 400 };
    // Resolve naver.me short links to the canonical map.naver.com folder URL.
    // Redirects are followed manually so each hop is re-validated against the
    // SSRF guard (a short link could otherwise 302 to an internal address).
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    }
    catch {
        return { error: 'Invalid URL', status: 400 };
    }
    if (parsedUrl.hostname === 'naver.me') {
        try {
            const redirectRes = await (0, ssrfGuard_1.safeFetchFollow)(url, { signal: AbortSignal.timeout(10000) });
            resolvedUrl = redirectRes.url;
        }
        catch (err) {
            if (err instanceof ssrfGuard_1.SsrfBlockedError)
                return { error: 'URL is not allowed', status: 400 };
            throw err;
        }
    }
    const folderMatch = resolvedUrl.match(/favorite\/myPlace\/folder\/([A-Za-z0-9_-]+)/i);
    const folderId = folderMatch?.[1] || null;
    if (!folderId) {
        return { error: 'Could not extract folder ID from URL. Please use a shared Naver Maps list link.', status: 400 };
    }
    const fetchPage = async (start) => {
        const apiUrl = `https://pages.map.naver.com/save-pages/api/maps-bookmark/v3/shares/${encodeURIComponent(folderId)}/bookmarks?placeInfo=true&start=${start}&limit=${limit}&sort=lastUseTime&mcids=ALL&createIdNo=true`;
        const apiRes = await fetch(apiUrl, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
            signal: AbortSignal.timeout(15000),
        });
        if (!apiRes.ok) {
            return { error: 'Failed to fetch list from Naver Maps', status: 502 };
        }
        try {
            const data = await apiRes.json();
            return { data };
        }
        catch {
            return { error: 'Invalid list data received from Naver Maps', status: 400 };
        }
    };
    const firstPage = await fetchPage(0);
    if ('error' in firstPage) {
        return { error: firstPage.error, status: firstPage.status };
    }
    const listName = firstPage.data.folder?.name || 'Naver Maps List';
    const totalCount = typeof firstPage.data.folder?.bookmarkCount === 'number'
        ? firstPage.data.folder.bookmarkCount
        : (firstPage.data.bookmarkList?.length || 0);
    const allItems = [...(firstPage.data.bookmarkList || [])];
    for (let start = limit; start < totalCount; start += limit) {
        const page = await fetchPage(start);
        if ('error' in page) {
            return { error: page.error, status: page.status };
        }
        const pageItems = page.data.bookmarkList || [];
        if (!Array.isArray(pageItems) || pageItems.length === 0)
            break;
        allItems.push(...pageItems);
    }
    if (allItems.length === 0) {
        return { error: 'List is empty or could not be read', status: 400 };
    }
    const places = [];
    for (const item of allItems) {
        const lat = Number(item?.py);
        const lng = Number(item?.px);
        const name = typeof item?.name === 'string' && item.name.trim()
            ? item.name.trim()
            : (typeof item?.displayName === 'string' ? item.displayName.trim() : '');
        const note = typeof item?.memo === 'string' && item.memo.trim() ? item.memo.trim() : null;
        const address = typeof item?.address === 'string' && item.address.trim() ? item.address.trim() : null;
        if (name && Number.isFinite(lat) && Number.isFinite(lng)) {
            places.push({ name, lat, lng, notes: note, address });
        }
    }
    if (places.length === 0) {
        return { error: 'No places with coordinates found in list', status: 400 };
    }
    const dedup = buildDedupSet(tripId);
    const insertStmt = database_1.db.prepare(`
    INSERT INTO places (trip_id, name, lat, lng, address, notes, transport_mode)
    VALUES (?, ?, ?, ?, ?, ?, 'walking')
  `);
    const created = [];
    let skipped = 0;
    const insertAll = database_1.db.transaction(() => {
        for (const p of places) {
            if (isPlaceDuplicate({ name: p.name, lat: p.lat, lng: p.lng }, dedup)) {
                skipped++;
                continue;
            }
            const result = insertStmt.run(tripId, p.name, p.lat, p.lng, p.address, p.notes);
            const place = (0, database_1.getPlaceWithTags)(Number(result.lastInsertRowid));
            created.push(place);
            trackInsertedInDedupSet({ name: p.name, lat: p.lat, lng: p.lng }, dedup);
        }
    });
    insertAll();
    if (opts?.enrich && opts.userId && created.length) {
        void (0, placeEnrichment_1.enrichImportedPlaces)(tripId, opts.userId, created, opts.lang);
    }
    return { places: created, listName, skipped };
}
// ---------------------------------------------------------------------------
// Search place image (Unsplash)
// ---------------------------------------------------------------------------
async function searchPlaceImage(tripId, placeId, userId) {
    const place = database_1.db.prepare('SELECT * FROM places WHERE id = ? AND trip_id = ?').get(placeId, tripId);
    if (!place)
        return { error: 'Place not found', status: 404 };
    const user = database_1.db.prepare('SELECT unsplash_api_key FROM users WHERE id = ?').get(userId);
    if (!user || !user.unsplash_api_key) {
        return { error: 'No Unsplash API key configured', status: 400 };
    }
    const query = encodeURIComponent(place.name + (place.address ? ' ' + place.address : ''));
    const response = await fetch(`https://api.unsplash.com/search/photos?query=${query}&per_page=5&client_id=${user.unsplash_api_key}`);
    const data = await response.json();
    if (!response.ok) {
        return { error: data.errors?.[0] || 'Unsplash API error', status: response.status };
    }
    const photos = (data.results || []).map((p) => ({
        id: p.id,
        url: p.urls?.regular,
        thumb: p.urls?.thumb,
        description: p.description || p.alt_description,
        photographer: p.user?.name,
        link: p.links?.html,
    }));
    return { photos };
}
