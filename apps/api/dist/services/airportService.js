"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findByIata = findByIata;
exports.searchAirports = searchAirports;
exports.backfillFlightEndpoints = backfillFlightEndpoints;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const database_1 = require("../db/database");
let cache = null;
let byIata = null;
function load() {
    if (cache)
        return cache;
    const file = node_path_1.default.join(__dirname, '..', '..', 'assets', 'airports.json');
    if (!node_fs_1.default.existsSync(file)) {
        console.warn('[airports] airports.json missing — run `node scripts/build-airports.mjs`');
        cache = [];
        byIata = new Map();
        return cache;
    }
    const raw = node_fs_1.default.readFileSync(file, 'utf8');
    cache = JSON.parse(raw);
    byIata = new Map(cache.map(a => [a.iata, a]));
    return cache;
}
function findByIata(code) {
    load();
    return byIata.get(code.toUpperCase()) ?? null;
}
function searchAirports(query, limit = 12) {
    const all = load();
    const q = query.trim().toLowerCase();
    if (!q)
        return [];
    const upper = q.toUpperCase();
    if (q.length === 3) {
        const exact = byIata.get(upper);
        if (exact)
            return [exact];
    }
    const matches = [];
    for (const a of all) {
        let score = 0;
        if (a.iata === upper)
            score = 100;
        else if (a.icao === upper)
            score = 90;
        else if (a.iata.startsWith(upper))
            score = 70;
        else if (a.city.toLowerCase().startsWith(q))
            score = 60;
        else if (a.name.toLowerCase().startsWith(q))
            score = 50;
        else if (a.city.toLowerCase().includes(q))
            score = 30;
        else if (a.name.toLowerCase().includes(q))
            score = 20;
        if (score > 0)
            matches.push({ a, score });
    }
    matches.sort((x, y) => y.score - x.score || x.a.iata.localeCompare(y.a.iata));
    return matches.slice(0, limit).map(m => m.a);
}
function backfillFlightEndpoints() {
    const pending = database_1.db.prepare(`
    SELECT r.id, r.metadata, r.reservation_time, r.reservation_end_time
    FROM reservations r
    WHERE r.type = 'flight'
      AND NOT EXISTS (SELECT 1 FROM reservation_endpoints e WHERE e.reservation_id = r.id)
  `).all();
    if (pending.length === 0)
        return;
    load();
    const insert = database_1.db.prepare(`
    INSERT INTO reservation_endpoints (reservation_id, role, sequence, name, code, lat, lng, timezone, local_time, local_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const markReview = database_1.db.prepare('UPDATE reservations SET needs_review = 1 WHERE id = ?');
    let filled = 0;
    let flagged = 0;
    for (const r of pending) {
        if (!r.metadata) {
            markReview.run(r.id);
            flagged++;
            continue;
        }
        let meta;
        try {
            meta = JSON.parse(r.metadata);
        }
        catch {
            markReview.run(r.id);
            flagged++;
            continue;
        }
        const dep = meta.departure_airport ? findByIata(String(meta.departure_airport).slice(0, 3)) : null;
        const arr = meta.arrival_airport ? findByIata(String(meta.arrival_airport).slice(0, 3)) : null;
        if (!dep || !arr) {
            markReview.run(r.id);
            flagged++;
            continue;
        }
        const split = (iso) => {
            if (!iso)
                return { date: null, time: null };
            const [date, time] = iso.split('T');
            return { date: date || null, time: time ? time.slice(0, 5) : null };
        };
        const depParts = split(r.reservation_time);
        const arrParts = split(r.reservation_end_time);
        insert.run(r.id, 'from', 0, dep.city ? `${dep.city} (${dep.iata})` : dep.name, dep.iata, dep.lat, dep.lng, dep.tz, depParts.time, depParts.date);
        insert.run(r.id, 'to', 1, arr.city ? `${arr.city} (${arr.iata})` : arr.name, arr.iata, arr.lat, arr.lng, arr.tz, arrParts.time, arrParts.date);
        filled++;
    }
    console.log(`[airports] Backfill: ${filled} filled, ${flagged} flagged for review`);
}
