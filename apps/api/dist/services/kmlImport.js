"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeUtf8WithWarning = decodeUtf8WithWarning;
exports.sanitizeKmlDescription = sanitizeKmlDescription;
exports.parseKmlLineStringCoordinates = parseKmlLineStringCoordinates;
exports.parseKmlPointCoordinates = parseKmlPointCoordinates;
exports.createKmlImportSummary = createKmlImportSummary;
exports.buildCategoryNameLookup = buildCategoryNameLookup;
exports.resolveCategoryIdForFolder = resolveCategoryIdForFolder;
exports.extractKmlPlacemarkNodes = extractKmlPlacemarkNodes;
exports.parsePlacemarkNode = parsePlacemarkNode;
const util_1 = require("util");
const UTF8_DECODER_FATAL = new util_1.TextDecoder('utf-8', { fatal: true });
const UTF8_DECODER_LOOSE = new util_1.TextDecoder('utf-8');
const ENTITY_MAP = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
};
function asArray(value) {
    if (value == null)
        return [];
    return Array.isArray(value) ? value : [value];
}
function asTrimmedString(value) {
    if (value == null)
        return null;
    // Parsed objects (mixed-content XML parsed without stopNodes) must not
    // produce "[object Object]" — extract #text if present, else return null.
    if (typeof value === 'object') {
        const candidate = value['#text'];
        if (typeof candidate === 'string')
            return candidate.trim() || null;
        return null;
    }
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}
function decodeHtmlEntities(value) {
    const withNamedEntities = value.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITY_MAP[m] || m);
    return withNamedEntities
        .replace(/&#(\d+);/g, (_, dec) => {
        const code = Number(dec);
        return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _;
    })
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _;
    });
}
function decodeUtf8WithWarning(fileBuffer) {
    try {
        return { text: UTF8_DECODER_FATAL.decode(fileBuffer), warning: null };
    }
    catch {
        return {
            text: UTF8_DECODER_LOOSE.decode(fileBuffer),
            warning: 'The uploaded file is not valid UTF-8. Some characters may be shown incorrectly.',
        };
    }
}
function sanitizeKmlDescription(value) {
    const raw = asTrimmedString(value);
    if (!raw)
        return null;
    // Unwrap CDATA sections — present when fast-xml-parser returns raw node text
    // via stopNodes. Must happen before tag-stripping so the CDATA markers are
    // not mis-parsed by the <[^>]+> regex.
    const withoutCdata = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    const withLineBreaks = withoutCdata.replace(/<br\s*\/?>/gi, '\n');
    const stripped = withLineBreaks.replace(/<[^>]+>/g, '');
    const decoded = decodeHtmlEntities(stripped)
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[\t\f\v]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return decoded || null;
}
function parseKmlLineStringCoordinates(value) {
    const coordinates = asTrimmedString(value);
    if (!coordinates)
        return null;
    const points = coordinates
        .trim()
        .split(/\s+/)
        .map(coord => {
        const parts = coord.split(',');
        const lng = Number.parseFloat(parts[0] ?? '');
        const lat = Number.parseFloat(parts[1] ?? '');
        const eleRaw = parts[2] != null ? Number.parseFloat(parts[2]) : NaN;
        if (!Number.isFinite(lat) || !Number.isFinite(lng))
            return null;
        return { lat, lng, ele: Number.isFinite(eleRaw) ? eleRaw : null };
    })
        .filter((p) => p !== null);
    return points.length >= 2 ? points : null;
}
function parseKmlPointCoordinates(value) {
    const coordinates = asTrimmedString(value);
    if (!coordinates)
        return null;
    const firstCoordinate = coordinates.split(/\s+/)[0];
    const [lngRaw, latRaw] = firstCoordinate.split(',');
    if (lngRaw == null || latRaw == null)
        return null;
    const lng = Number.parseFloat(lngRaw);
    const lat = Number.parseFloat(latRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
        return null;
    return { lat, lng };
}
function createKmlImportSummary(totalPlacemarks) {
    return {
        totalPlacemarks,
        createdCount: 0,
        skippedCount: 0,
        warnings: [],
        errors: [],
    };
}
function buildCategoryNameLookup(categories) {
    const lookup = new Map();
    for (const category of categories) {
        const normalizedName = category.name.trim().toLowerCase();
        if (!normalizedName)
            continue;
        if (!lookup.has(normalizedName)) {
            lookup.set(normalizedName, category.id);
        }
    }
    return lookup;
}
function resolveCategoryIdForFolder(folderName, lookup) {
    if (!folderName)
        return null;
    const normalizedFolder = folderName.trim().toLowerCase();
    if (!normalizedFolder)
        return null;
    return lookup.get(normalizedFolder) ?? null;
}
function extractKmlPlacemarkNodes(kmlRoot) {
    const nodes = [];
    const visitNode = (node, currentFolderName) => {
        if (!node || typeof node !== 'object')
            return;
        for (const placemark of asArray(node.Placemark)) {
            nodes.push({ placemark, folderName: currentFolderName });
        }
        for (const folder of asArray(node.Folder)) {
            // Nested folders inherit/override folder context used for category matching.
            const folderName = asTrimmedString(folder?.name) || currentFolderName;
            visitNode(folder, folderName);
        }
        for (const childDocument of asArray(node.Document)) {
            visitNode(childDocument, currentFolderName);
        }
    };
    visitNode(kmlRoot, null);
    return nodes;
}
function parsePlacemarkNode(node) {
    const pointCoords = parseKmlPointCoordinates(node.placemark?.Point?.coordinates);
    let routeGeometry = null;
    let pathFirstPt = null;
    if (!pointCoords) {
        const linePts = parseKmlLineStringCoordinates(node.placemark?.LineString?.coordinates);
        if (linePts) {
            pathFirstPt = { lat: linePts[0].lat, lng: linePts[0].lng };
            const hasAllEle = linePts.every(p => p.ele !== null);
            routeGeometry = JSON.stringify(linePts.map(p => hasAllEle ? [p.lat, p.lng, p.ele] : [p.lat, p.lng]));
        }
    }
    return {
        name: asTrimmedString(node.placemark?.name),
        description: sanitizeKmlDescription(node.placemark?.description),
        lat: pointCoords?.lat ?? pathFirstPt?.lat ?? null,
        lng: pointCoords?.lng ?? pathFirstPt?.lng ?? null,
        folderName: node.folderName,
        routeGeometry,
    };
}
