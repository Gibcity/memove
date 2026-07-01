"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canAccessJourney = canAccessJourney;
exports.isOwner = isOwner;
exports.canEdit = canEdit;
exports.listJourneys = listJourneys;
exports.createJourney = createJourney;
exports.getJourneyFull = getJourneyFull;
exports.updateJourney = updateJourney;
exports.updateJourneyPreferences = updateJourneyPreferences;
exports.deleteJourney = deleteJourney;
exports.addTripToJourney = addTripToJourney;
exports.removeTripFromJourney = removeTripFromJourney;
exports.syncTripPlaces = syncTripPlaces;
exports.onPlaceCreated = onPlaceCreated;
exports.onPlaceUpdated = onPlaceUpdated;
exports.onPlaceDeleted = onPlaceDeleted;
exports.listEntries = listEntries;
exports.createEntry = createEntry;
exports.updateEntry = updateEntry;
exports.reorderEntries = reorderEntries;
exports.deleteEntry = deleteEntry;
exports.addPhoto = addPhoto;
exports.addProviderPhoto = addProviderPhoto;
exports.linkPhotoToEntry = linkPhotoToEntry;
exports.uploadGalleryPhotos = uploadGalleryPhotos;
exports.addProviderPhotoToGallery = addProviderPhotoToGallery;
exports.unlinkPhotoFromEntry = unlinkPhotoFromEntry;
exports.deleteGalleryPhoto = deleteGalleryPhoto;
exports.setPhotoProvider = setPhotoProvider;
exports.updatePhoto = updatePhoto;
exports.deletePhoto = deletePhoto;
exports.addContributor = addContributor;
exports.updateContributorRole = updateContributorRole;
exports.removeContributor = removeContributor;
exports.getSuggestions = getSuggestions;
exports.listUserTrips = listUserTrips;
const database_1 = require("../db/database");
const websocket_1 = require("../websocket");
const photoResolverService_1 = require("./memories/photoResolverService");
function ts() {
    return Date.now();
}
// Per-entry photo view: join journey_entry_photos → journey_photos (gallery) → memove_photos.
// id = gp.id (gallery photo id) — used by clients for linkPhoto/updatePhoto/unlink/delete.
const JP_SELECT = `
  gp.id, jep.entry_id, gp.photo_id, gp.caption, jep.sort_order, gp.shared, gp.created_at,
  tp.provider, tp.asset_id, tp.owner_id, tp.file_path, tp.thumbnail_path, tp.width, tp.height
`;
const JP_JOIN = `journey_entry_photos jep
  JOIN journey_photos gp ON gp.id  = jep.journey_photo_id
  JOIN memove_photos    tp ON tp.id  = gp.photo_id`;
// Per-journey gallery view: journey_photos → memove_photos (no entry context).
const GALLERY_SELECT = `
  gp.id, gp.journey_id, gp.photo_id, gp.caption, gp.shared, gp.sort_order, gp.created_at,
  tp.provider, tp.asset_id, tp.owner_id, tp.file_path, tp.thumbnail_path, tp.width, tp.height
`;
const GALLERY_JOIN = 'journey_photos gp JOIN memove_photos tp ON tp.id = gp.photo_id';
function broadcastJourneyEvent(journeyId, event, data, excludeSocketId) {
    const contributors = database_1.db.prepare('SELECT user_id FROM journey_contributors WHERE journey_id = ?').all(journeyId);
    const owner = database_1.db.prepare('SELECT user_id FROM journeys WHERE id = ?').get(journeyId);
    const userIds = new Set(contributors.map((c) => c.user_id));
    if (owner)
        userIds.add(owner.user_id);
    for (const uid of userIds) {
        (0, websocket_1.broadcastToUser)(uid, { type: event, journeyId, ...data }, excludeSocketId);
    }
}
// ── Access control ───────────────────────────────────────────────────────
function canAccessJourney(journeyId, userId) {
    const own = database_1.db.prepare('SELECT * FROM journeys WHERE id = ? AND user_id = ?').get(journeyId, userId);
    if (own)
        return own;
    const contrib = database_1.db
        .prepare('SELECT 1 FROM journey_contributors WHERE journey_id = ? AND user_id = ?')
        .get(journeyId, userId);
    if (contrib)
        return database_1.db.prepare('SELECT * FROM journeys WHERE id = ?').get(journeyId) || null;
    return null;
}
function isOwner(journeyId, userId) {
    return !!database_1.db.prepare('SELECT 1 FROM journeys WHERE id = ? AND user_id = ?').get(journeyId, userId);
}
function canEdit(journeyId, userId) {
    if (isOwner(journeyId, userId))
        return true;
    const c = database_1.db
        .prepare('SELECT role FROM journey_contributors WHERE journey_id = ? AND user_id = ?')
        .get(journeyId, userId);
    return c?.role === 'editor' || c?.role === 'owner';
}
// ── Journey CRUD ─────────────────────────────────────────────────────────
function listJourneys(userId) {
    return database_1.db
        .prepare(`
    SELECT DISTINCT j.*,
      (SELECT COUNT(*) FROM journey_entries je WHERE je.journey_id = j.id AND je.type != 'skeleton') as entry_count,
      (SELECT COUNT(*) FROM journey_photos jp WHERE jp.journey_id = j.id) as photo_count,
      (SELECT COUNT(DISTINCT je3.location_name) FROM journey_entries je3 WHERE je3.journey_id = j.id AND je3.location_name IS NOT NULL AND je3.location_name != '') as place_count,
      (SELECT MIN(t.start_date) FROM journey_trips jt JOIN trips t ON jt.trip_id = t.id WHERE jt.journey_id = j.id) as trip_date_min,
      (SELECT MAX(t.end_date) FROM journey_trips jt JOIN trips t ON jt.trip_id = t.id WHERE jt.journey_id = j.id) as trip_date_max
    FROM journeys j
    LEFT JOIN journey_contributors jc ON j.id = jc.journey_id AND jc.user_id = ?
    WHERE j.user_id = ? OR jc.user_id = ?
    ORDER BY j.updated_at DESC
  `)
        .all(userId, userId, userId);
}
function createJourney(userId, data) {
    const now = ts();
    const res = database_1.db
        .prepare(`
    INSERT INTO journeys (user_id, title, subtitle, status, created_at, updated_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `)
        .run(userId, data.title, data.subtitle || null, now, now);
    const journeyId = Number(res.lastInsertRowid);
    // add owner as contributor
    database_1.db.prepare('INSERT INTO journey_contributors (journey_id, user_id, role, added_at) VALUES (?, ?, ?, ?)').run(journeyId, userId, 'owner', now);
    // link trips and sync skeleton entries
    if (data.trip_ids?.length) {
        for (const tripId of data.trip_ids) {
            addTripToJourney(journeyId, tripId, userId);
        }
        // inherit cover image from first selected trip
        const firstTrip = database_1.db.prepare('SELECT cover_image FROM trips WHERE id = ?').get(data.trip_ids[0]);
        if (firstTrip?.cover_image) {
            // trip stores full path (/uploads/covers/x.jpg), journey stores relative (covers/x.jpg)
            const relativePath = firstTrip.cover_image.replace(/^\/uploads\//, '');
            database_1.db.prepare('UPDATE journeys SET cover_image = ? WHERE id = ?').run(relativePath, journeyId);
        }
    }
    return database_1.db.prepare('SELECT * FROM journeys WHERE id = ?').get(journeyId);
}
function getJourneyFull(journeyId, userId) {
    const journey = canAccessJourney(journeyId, userId);
    if (!journey)
        return null;
    const entries = database_1.db
        .prepare('SELECT * FROM journey_entries WHERE journey_id = ? ORDER BY entry_date ASC, sort_order ASC, id ASC')
        .all(journeyId);
    const photos = database_1.db
        .prepare(`SELECT ${JP_SELECT} FROM ${JP_JOIN} WHERE jep.entry_id IN (SELECT id FROM journey_entries WHERE journey_id = ?) ORDER BY jep.sort_order ASC`)
        .all(journeyId);
    // group photos by entry
    const photosByEntry = {};
    for (const p of photos) {
        (photosByEntry[p.entry_id] ||= []).push(p);
    }
    const gallery = database_1.db
        .prepare(`SELECT ${GALLERY_SELECT} FROM ${GALLERY_JOIN} WHERE gp.journey_id = ? ORDER BY gp.sort_order ASC, gp.id ASC`)
        .all(journeyId);
    const enrichedEntries = entries.map((e) => ({
        ...e,
        tags: e.tags ? JSON.parse(e.tags) : [],
        pros_cons: e.pros_cons ? JSON.parse(e.pros_cons) : null,
        photos: photosByEntry[e.id] || [],
        source_trip_name: e.source_trip_id
            ? database_1.db.prepare('SELECT title FROM trips WHERE id = ?').get(e.source_trip_id)
                ?.title || null
            : null,
    }));
    // linked trips
    const trips = database_1.db
        .prepare(`
    SELECT jt.trip_id, jt.added_at, t.title, t.start_date, t.end_date, t.cover_image, t.currency,
      (SELECT COUNT(*) FROM places WHERE trip_id = t.id) as place_count
    FROM journey_trips jt JOIN trips t ON jt.trip_id = t.id
    WHERE jt.journey_id = ? ORDER BY t.start_date ASC
  `)
        .all(journeyId);
    // contributors
    const contributorsRaw = database_1.db
        .prepare(`
    SELECT jc.journey_id, jc.user_id, jc.role, jc.added_at, u.username, u.avatar
    FROM journey_contributors jc JOIN users u ON jc.user_id = u.id
    WHERE jc.journey_id = ? ORDER BY jc.added_at
  `)
        .all(journeyId);
    const contributors = contributorsRaw.map((c) => ({
        ...c,
        avatar_url: c.avatar ? `/uploads/avatars/${c.avatar}` : null,
    }));
    // stats
    const entryCount = entries.filter((e) => e.type === 'entry').length;
    const photoCount = gallery.length;
    const places = [...new Set(entries.map((e) => e.location_name).filter(Boolean))];
    const userPrefs = database_1.db
        .prepare('SELECT hide_skeletons FROM journey_contributors WHERE journey_id = ? AND user_id = ?')
        .get(journeyId, userId);
    // Determine the viewer's role on this journey so the UI can gate edit/settings
    // actions. 'owner' = creator, 'editor' | 'viewer' = from journey_contributors.
    const journeyRow = journey;
    let myRole;
    if (journeyRow.user_id === userId) {
        myRole = 'owner';
    }
    else {
        const contribRow = database_1.db
            .prepare('SELECT role FROM journey_contributors WHERE journey_id = ? AND user_id = ?')
            .get(journeyId, userId);
        myRole = contribRow?.role ?? null;
    }
    return {
        ...journey,
        entries: enrichedEntries,
        gallery,
        trips,
        contributors,
        stats: { entries: entryCount, photos: photoCount, places: places.length },
        hide_skeletons: !!userPrefs?.hide_skeletons,
        my_role: myRole,
    };
}
function updateJourney(journeyId, userId, data) {
    // Journey-level settings (title, cover, status) are owner-only — editors
    // may only edit entries and photos, not reshape the journey itself.
    if (!isOwner(journeyId, userId))
        return null;
    const ALLOWED_STATUSES = ['draft', 'active', 'completed', 'archived'];
    const allowed = ['title', 'subtitle', 'cover_gradient', 'cover_image', 'status'];
    const fields = [];
    const values = [];
    for (const [key, val] of Object.entries(data)) {
        if (val !== undefined && allowed.includes(key)) {
            if (key === 'status' && !ALLOWED_STATUSES.includes(val))
                continue;
            fields.push(`${key} = ?`);
            values.push(val);
        }
    }
    if (fields.length === 0)
        return database_1.db.prepare('SELECT * FROM journeys WHERE id = ?').get(journeyId);
    fields.push('updated_at = ?');
    values.push(ts());
    values.push(journeyId);
    database_1.db.prepare(`UPDATE journeys SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return database_1.db.prepare('SELECT * FROM journeys WHERE id = ?').get(journeyId);
}
function updateJourneyPreferences(journeyId, userId, data) {
    if (!canAccessJourney(journeyId, userId))
        return null;
    if (data.hide_skeletons !== undefined) {
        database_1.db.prepare('UPDATE journey_contributors SET hide_skeletons = ? WHERE journey_id = ? AND user_id = ?').run(data.hide_skeletons ? 1 : 0, journeyId, userId);
    }
    const row = database_1.db
        .prepare('SELECT hide_skeletons FROM journey_contributors WHERE journey_id = ? AND user_id = ?')
        .get(journeyId, userId);
    return { hide_skeletons: !!row.hide_skeletons };
}
function deleteJourney(journeyId, userId) {
    if (!isOwner(journeyId, userId))
        return false;
    database_1.db.prepare('DELETE FROM journeys WHERE id = ?').run(journeyId);
    return true;
}
// ── Trip management ──────────────────────────────────────────────────────
function addTripToJourney(journeyId, tripId, userId) {
    // Only attach a trip the caller can actually access — otherwise a journey
    // owner could pull an arbitrary trip's places + photos into their journey
    // (cross-tenant leak). Mirrors the trip-access gate every other trip-scoped
    // path enforces.
    if (!(0, database_1.canAccessTrip)(tripId, userId))
        return false;
    const now = ts();
    try {
        database_1.db.prepare('INSERT OR IGNORE INTO journey_trips (journey_id, trip_id, added_at) VALUES (?, ?, ?)').run(journeyId, tripId, now);
    }
    catch {
        return false;
    }
    // sync skeleton entries for all places in this trip
    syncTripPlaces(journeyId, tripId, userId);
    // import existing trip photos (Immich/Synology) with sharing settings
    syncTripPhotos(journeyId, tripId);
    broadcastJourneyEvent(journeyId, 'journey:trip:synced', { tripId });
    return true;
}
function removeTripFromJourney(journeyId, tripId, userId) {
    if (!isOwner(journeyId, userId))
        return false;
    // remove skeleton entries that haven't been filled in
    database_1.db.prepare(`
    DELETE FROM journey_entries
    WHERE journey_id = ? AND source_trip_id = ? AND type = 'skeleton'
  `).run(journeyId, tripId);
    // detach filled entries from this trip
    database_1.db.prepare(`
    UPDATE journey_entries SET source_trip_id = NULL, source_place_id = NULL
    WHERE journey_id = ? AND source_trip_id = ? AND type != 'skeleton'
  `).run(journeyId, tripId);
    database_1.db.prepare('DELETE FROM journey_trips WHERE journey_id = ? AND trip_id = ?').run(journeyId, tripId);
    return true;
}
// ── Sync engine ──────────────────────────────────────────────────────────
function syncTripPlaces(journeyId, tripId, authorId) {
    const places = database_1.db
        .prepare(`
    SELECT p.*, da.day_id, d.date as day_date, da.assignment_time, da.assignment_end_time, d.day_number
    FROM places p
    INNER JOIN day_assignments da ON da.place_id = p.id
    INNER JOIN days d ON da.day_id = d.id
    WHERE p.trip_id = ?
    ORDER BY d.day_number ASC, da.order_index ASC
  `)
        .all(tripId);
    const now = ts();
    const existing = database_1.db
        .prepare('SELECT source_place_id FROM journey_entries WHERE journey_id = ? AND source_trip_id = ?')
        .all(journeyId, tripId);
    const existingPlaceIds = new Set(existing.map((e) => e.source_place_id));
    // Track next sort_order per date so synced skeletons get unique, sequential positions.
    const dateMaxOrder = new Map();
    const maxRows = database_1.db
        .prepare('SELECT entry_date, COALESCE(MAX(sort_order), -1) AS m FROM journey_entries WHERE journey_id = ? GROUP BY entry_date')
        .all(journeyId);
    for (const row of maxRows)
        dateMaxOrder.set(row.entry_date, row.m);
    for (const place of places) {
        if (existingPlaceIds.has(place.id))
            continue;
        existingPlaceIds.add(place.id);
        const entryDate = place.day_date || new Date().toISOString().split('T')[0];
        const entryTime = place.assignment_time || place.place_time || null;
        const nextOrder = (dateMaxOrder.get(entryDate) ?? -1) + 1;
        dateMaxOrder.set(entryDate, nextOrder);
        database_1.db.prepare(`
      INSERT INTO journey_entries (journey_id, source_trip_id, source_place_id, author_id, type, title, entry_date, entry_time, location_name, location_lat, location_lng, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'skeleton', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(journeyId, tripId, place.id, authorId, place.name, entryDate, entryTime, place.address || place.name, place.lat || null, place.lng || null, nextOrder, now, now);
    }
}
// import trip_photos into journey gallery when a trip is linked
function syncTripPhotos(journeyId, tripId) {
    const tripPhotos = database_1.db
        .prepare('SELECT tp.photo_id, tp.shared FROM trip_photos tp WHERE tp.trip_id = ?')
        .all(tripId);
    if (!tripPhotos.length)
        return;
    const now = ts();
    const maxOrderRow = database_1.db
        .prepare('SELECT MAX(sort_order) as m FROM journey_photos WHERE journey_id = ?')
        .get(journeyId);
    let nextOrder = (maxOrderRow?.m ?? -1) + 1;
    for (const tp of tripPhotos) {
        database_1.db.prepare(`
      INSERT OR IGNORE INTO journey_photos (journey_id, photo_id, shared, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(journeyId, tp.photo_id, tp.shared, nextOrder++, now);
    }
}
// called when a trip place is created
function onPlaceCreated(tripId, placeId) {
    const links = database_1.db.prepare('SELECT journey_id FROM journey_trips WHERE trip_id = ?').all(tripId);
    if (!links.length)
        return;
    const place = database_1.db
        .prepare(`
    SELECT p.*, da.day_id, d.date as day_date, da.assignment_time, d.day_number
    FROM places p
    INNER JOIN day_assignments da ON da.place_id = p.id
    INNER JOIN days d ON da.day_id = d.id
    WHERE p.id = ?
  `)
        .get(placeId);
    if (!place)
        return; // not assigned to a day yet — skip
    const now = ts();
    for (const link of links) {
        const already = database_1.db
            .prepare('SELECT 1 FROM journey_entries WHERE journey_id = ? AND source_place_id = ?')
            .get(link.journey_id, placeId);
        if (already)
            continue;
        const journey = database_1.db.prepare('SELECT user_id FROM journeys WHERE id = ?').get(link.journey_id);
        const entryDate = place.day_date;
        const maxOrder = database_1.db
            .prepare('SELECT MAX(sort_order) AS m FROM journey_entries WHERE journey_id = ? AND entry_date = ?')
            .get(link.journey_id, entryDate);
        const nextOrder = (maxOrder?.m ?? -1) + 1;
        database_1.db.prepare(`
      INSERT INTO journey_entries (journey_id, source_trip_id, source_place_id, author_id, type, title, entry_date, entry_time, location_name, location_lat, location_lng, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'skeleton', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(link.journey_id, tripId, placeId, journey.user_id, place.name, entryDate, place.assignment_time || place.place_time || null, place.address || place.name, place.lat || null, place.lng || null, nextOrder, now, now);
    }
}
// called when a trip place is updated
function onPlaceUpdated(placeId) {
    const entries = database_1.db.prepare('SELECT * FROM journey_entries WHERE source_place_id = ?').all(placeId);
    if (!entries.length)
        return;
    const place = database_1.db
        .prepare(`
    SELECT p.*, da.day_id, d.date as day_date, da.assignment_time, d.day_number
    FROM places p
    LEFT JOIN day_assignments da ON da.place_id = p.id
    LEFT JOIN days d ON da.day_id = d.id
    WHERE p.id = ?
  `)
        .get(placeId);
    if (!place)
        return;
    const now = ts();
    for (const entry of entries) {
        if (entry.type === 'skeleton') {
            // update everything on skeletons
            database_1.db.prepare(`
        UPDATE journey_entries SET title = ?, entry_date = ?, entry_time = ?, location_name = ?, location_lat = ?, location_lng = ?, updated_at = ?
        WHERE id = ?
      `).run(place.name, place.day_date || entry.entry_date, place.assignment_time || place.place_time || entry.entry_time, place.address || place.name, place.lat || null, place.lng || null, now, entry.id);
        }
        else {
            // for filled entries, only update location silently
            database_1.db.prepare(`
        UPDATE journey_entries SET location_name = ?, location_lat = ?, location_lng = ?, updated_at = ?
        WHERE id = ?
      `).run(place.address || place.name, place.lat || null, place.lng || null, now, entry.id);
        }
    }
}
// called when a trip place is deleted
function onPlaceDeleted(placeId) {
    const entries = database_1.db.prepare('SELECT * FROM journey_entries WHERE source_place_id = ?').all(placeId);
    for (const entry of entries) {
        if (entry.type === 'skeleton') {
            // no content: just delete
            const hasPhotos = database_1.db.prepare('SELECT 1 FROM journey_entry_photos WHERE entry_id = ?').get(entry.id);
            if (!hasPhotos && !entry.story) {
                database_1.db.prepare('DELETE FROM journey_entries WHERE id = ?').run(entry.id);
                continue;
            }
        }
        // entry has content: keep it, detach, add note
        const note = '\n\n> _Note: the original trip place was removed from the trip plan_';
        const newStory = (entry.story || '') + note;
        database_1.db.prepare('UPDATE journey_entries SET source_place_id = NULL, source_trip_id = NULL, type = ?, story = ?, updated_at = ? WHERE id = ?').run(entry.type === 'skeleton' ? 'entry' : entry.type, newStory, ts(), entry.id);
    }
}
// ── Entries ──────────────────────────────────────────────────────────────
function listEntries(journeyId, userId) {
    if (!canAccessJourney(journeyId, userId))
        return null;
    const entries = database_1.db
        .prepare('SELECT * FROM journey_entries WHERE journey_id = ? ORDER BY entry_date ASC, sort_order ASC, id ASC')
        .all(journeyId);
    const photos = database_1.db
        .prepare(`SELECT ${JP_SELECT} FROM ${JP_JOIN} WHERE jep.entry_id IN (SELECT id FROM journey_entries WHERE journey_id = ?) ORDER BY jep.sort_order ASC`)
        .all(journeyId);
    const photosByEntry = {};
    for (const p of photos) {
        (photosByEntry[p.entry_id] ||= []).push(p);
    }
    return entries.map((e) => ({
        ...e,
        tags: e.tags ? JSON.parse(e.tags) : [],
        pros_cons: e.pros_cons ? JSON.parse(e.pros_cons) : null,
        photos: photosByEntry[e.id] || [],
        source_trip_name: e.source_trip_id
            ? database_1.db.prepare('SELECT title FROM trips WHERE id = ?').get(e.source_trip_id)
                ?.title || null
            : null,
    }));
}
function createEntry(journeyId, userId, data, sid) {
    if (!canEdit(journeyId, userId))
        return null;
    const now = ts();
    const maxOrder = database_1.db
        .prepare('SELECT MAX(sort_order) as m FROM journey_entries WHERE journey_id = ? AND entry_date = ?')
        .get(journeyId, data.entry_date);
    const prosConsJson = data.pros_cons && (data.pros_cons.pros.length || data.pros_cons.cons.length)
        ? JSON.stringify(data.pros_cons)
        : null;
    const res = database_1.db
        .prepare(`
    INSERT INTO journey_entries (journey_id, author_id, type, title, story, entry_date, entry_time, location_name, location_lat, location_lng, mood, weather, tags, pros_cons, visibility, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
        .run(journeyId, userId, data.type || 'entry', data.title || null, data.story || null, data.entry_date, data.entry_time || null, data.location_name || null, data.location_lat ?? null, data.location_lng ?? null, data.mood || null, data.weather || null, data.tags?.length ? JSON.stringify(data.tags) : null, prosConsJson, data.visibility || 'private', (maxOrder?.m ?? -1) + 1, now, now);
    const created = database_1.db
        .prepare('SELECT * FROM journey_entries WHERE id = ?')
        .get(Number(res.lastInsertRowid));
    broadcastJourneyEvent(journeyId, 'journey:entry:created', { entry: created }, sid);
    return created;
}
function updateEntry(entryId, userId, data, sid) {
    const entry = database_1.db.prepare('SELECT * FROM journey_entries WHERE id = ?').get(entryId);
    if (!entry)
        return null;
    if (!canEdit(entry.journey_id, userId))
        return null;
    const fields = [];
    const values = [];
    // Allow-list the columns a client may set: keys come from the request body
    // and are interpolated as SQL column names, so restrict them to the known
    // entry fields. Keep this in sync with the data type above.
    const allowed = new Set([
        'type',
        'title',
        'story',
        'entry_date',
        'entry_time',
        'location_name',
        'location_lat',
        'location_lng',
        'mood',
        'weather',
        'tags',
        'pros_cons',
        'visibility',
        'sort_order',
    ]);
    for (const [key, val] of Object.entries(data)) {
        if (val === undefined)
            continue;
        if (!allowed.has(key))
            continue;
        if (key === 'tags') {
            fields.push('tags = ?');
            values.push(Array.isArray(val) ? JSON.stringify(val) : val);
        }
        else if (key === 'pros_cons') {
            fields.push('pros_cons = ?');
            values.push(val && typeof val === 'object' ? JSON.stringify(val) : val);
        }
        else {
            fields.push(`${key} = ?`);
            values.push(val);
        }
    }
    // if adding story to a skeleton, promote to entry
    if (entry.type === 'skeleton' && data.story && data.story.trim()) {
        fields.push('type = ?');
        values.push('entry');
    }
    if (fields.length === 0)
        return entry;
    fields.push('updated_at = ?');
    values.push(ts());
    values.push(entryId);
    database_1.db.prepare(`UPDATE journey_entries SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    // touch the journey
    database_1.db.prepare('UPDATE journeys SET updated_at = ? WHERE id = ?').run(ts(), entry.journey_id);
    const updated = database_1.db.prepare('SELECT * FROM journey_entries WHERE id = ?').get(entryId);
    broadcastJourneyEvent(entry.journey_id, 'journey:entry:updated', { entry: updated }, sid);
    return updated;
}
// Reorder entries (typically within a single day). Caller passes the new
// desired order of ids; each entry's sort_order is set to its index in the
// array. Only entries owned by this journey are accepted.
function reorderEntries(journeyId, userId, orderedIds, sid) {
    if (!canEdit(journeyId, userId))
        return false;
    if (!orderedIds.length)
        return true;
    const placeholders = orderedIds.map(() => '?').join(',');
    const rows = database_1.db
        .prepare(`SELECT id FROM journey_entries WHERE id IN (${placeholders}) AND journey_id = ?`)
        .all(...orderedIds, journeyId);
    if (rows.length !== orderedIds.length)
        return false;
    const now = ts();
    const update = database_1.db.prepare('UPDATE journey_entries SET sort_order = ?, updated_at = ? WHERE id = ?');
    const tx = database_1.db.transaction(() => {
        orderedIds.forEach((id, index) => update.run(index, now, id));
        database_1.db.prepare('UPDATE journeys SET updated_at = ? WHERE id = ?').run(now, journeyId);
    });
    tx();
    broadcastJourneyEvent(journeyId, 'journey:entries:reordered', { orderedIds }, sid);
    return true;
}
function deleteEntry(entryId, userId, sid) {
    const entry = database_1.db.prepare('SELECT * FROM journey_entries WHERE id = ?').get(entryId);
    if (!entry)
        return false;
    if (!canEdit(entry.journey_id, userId))
        return false;
    if (entry.source_trip_id && entry.source_place_id && entry.type !== 'skeleton') {
        // Revert filled entry back to skeleton instead of deleting
        database_1.db.prepare(`
      UPDATE journey_entries
      SET type = 'skeleton', story = NULL, mood = NULL, weather = NULL, pros_cons = NULL,
          visibility = 'private', updated_at = ?
      WHERE id = ?
    `).run(ts(), entryId);
        broadcastJourneyEvent(entry.journey_id, 'journey:entry:updated', { entryId }, sid);
    }
    else {
        database_1.db.prepare('DELETE FROM journey_entries WHERE id = ?').run(entryId);
        broadcastJourneyEvent(entry.journey_id, 'journey:entry:deleted', { entryId }, sid);
    }
    return true;
}
// ── Photos ───────────────────────────────────────────────────────────────
// Promote a skeleton suggestion to a concrete entry. Called whenever the user
// adds content (photo upload, provider photo, gallery link) — a suggestion
// with photos is no longer just a suggestion.
function promoteSkeletonIfNeeded(entry) {
    if (entry.type !== 'skeleton')
        return;
    database_1.db.prepare('UPDATE journey_entries SET type = ?, updated_at = ? WHERE id = ?').run('entry', ts(), entry.id);
}
// Ensure a memove_photo_id is in the journey gallery; return its gallery row id.
function ensureInGallery(journeyId, memovePhotoId, caption, shared) {
    const now = ts();
    const maxOrderRow = database_1.db
        .prepare('SELECT MAX(sort_order) as m FROM journey_photos WHERE journey_id = ?')
        .get(journeyId);
    database_1.db.prepare(`
    INSERT OR IGNORE INTO journey_photos (journey_id, photo_id, caption, shared, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(journeyId, memovePhotoId, caption || null, shared ?? 0, (maxOrderRow?.m ?? -1) + 1, now);
    const row = database_1.db
        .prepare('SELECT id FROM journey_photos WHERE journey_id = ? AND photo_id = ?')
        .get(journeyId, memovePhotoId);
    return row.id;
}
// Link a gallery photo to an entry (idempotent). Returns the junction JP_SELECT row.
function linkGalleryPhotoToEntry(galleryId, entryId) {
    const now = ts();
    const maxOrderRow = database_1.db
        .prepare('SELECT MAX(sort_order) as m FROM journey_entry_photos WHERE entry_id = ?')
        .get(entryId);
    database_1.db.prepare(`
    INSERT OR IGNORE INTO journey_entry_photos (entry_id, journey_photo_id, sort_order, created_at)
    VALUES (?, ?, ?, ?)
  `).run(entryId, galleryId, (maxOrderRow?.m ?? -1) + 1, now);
    return database_1.db
        .prepare(`SELECT ${JP_SELECT} FROM ${JP_JOIN} WHERE jep.entry_id = ? AND jep.journey_photo_id = ?`)
        .get(entryId, galleryId);
}
function addPhoto(entryId, userId, filePath, thumbnailPath, caption) {
    const entry = database_1.db.prepare('SELECT * FROM journey_entries WHERE id = ?').get(entryId);
    if (!entry)
        return null;
    if (!canEdit(entry.journey_id, userId))
        return null;
    const memovePhotoId = (0, photoResolverService_1.getOrCreateLocalMemovePhoto)(filePath, thumbnailPath);
    const galleryId = database_1.db.transaction(() => ensureInGallery(entry.journey_id, memovePhotoId, caption))();
    const result = linkGalleryPhotoToEntry(galleryId, entryId);
    promoteSkeletonIfNeeded(entry);
    return result;
}
function addProviderPhoto(entryId, userId, provider, assetId, caption, passphrase) {
    const entry = database_1.db.prepare('SELECT * FROM journey_entries WHERE id = ?').get(entryId);
    if (!entry)
        return null;
    if (!canEdit(entry.journey_id, userId))
        return null;
    const memovePhotoId = (0, photoResolverService_1.getOrCreateMemovePhoto)(provider, assetId, userId, passphrase);
    // skip if this photo is already linked to this entry
    const alreadyLinked = database_1.db
        .prepare(`
    SELECT 1 FROM journey_entry_photos jep
    JOIN journey_photos gp ON gp.id = jep.journey_photo_id
    WHERE jep.entry_id = ? AND gp.photo_id = ?
  `)
        .get(entryId, memovePhotoId);
    if (alreadyLinked)
        return null;
    const galleryId = database_1.db.transaction(() => ensureInGallery(entry.journey_id, memovePhotoId, caption))();
    const result = linkGalleryPhotoToEntry(galleryId, entryId);
    promoteSkeletonIfNeeded(entry);
    return result;
}
// Link a gallery photo (by its journey_photos.id) to an entry — idempotent.
function linkPhotoToEntry(entryId, journeyPhotoId, userId) {
    const entry = database_1.db.prepare('SELECT * FROM journey_entries WHERE id = ?').get(entryId);
    if (!entry)
        return null;
    if (!canEdit(entry.journey_id, userId))
        return null;
    // Verify the gallery photo belongs to this journey
    const galleryRow = database_1.db.prepare('SELECT id, journey_id FROM journey_photos WHERE id = ?').get(journeyPhotoId);
    if (!galleryRow || galleryRow.journey_id !== entry.journey_id)
        return null;
    const result = linkGalleryPhotoToEntry(galleryRow.id, entryId);
    promoteSkeletonIfNeeded(entry);
    return result;
}
// Upload photos to the journey gallery only (no entry association).
function uploadGalleryPhotos(journeyId, userId, filePaths) {
    if (!canEdit(journeyId, userId))
        return [];
    const results = [];
    const now = ts();
    const maxOrderRow = database_1.db
        .prepare('SELECT MAX(sort_order) as m FROM journey_photos WHERE journey_id = ?')
        .get(journeyId);
    let nextOrder = (maxOrderRow?.m ?? -1) + 1;
    for (const f of filePaths) {
        const memovePhotoId = (0, photoResolverService_1.getOrCreateLocalMemovePhoto)(f.path, f.thumbnail);
        database_1.db.prepare(`
      INSERT OR IGNORE INTO journey_photos (journey_id, photo_id, shared, sort_order, created_at)
      VALUES (?, ?, 0, ?, ?)
    `).run(journeyId, memovePhotoId, nextOrder++, now);
        const row = database_1.db
            .prepare(`SELECT ${GALLERY_SELECT} FROM ${GALLERY_JOIN} WHERE gp.journey_id = ? AND gp.photo_id = ?`)
            .get(journeyId, memovePhotoId);
        if (row)
            results.push(row);
    }
    return results;
}
// Add a provider photo to the gallery only (no entry link).
function addProviderPhotoToGallery(journeyId, userId, provider, assetId, caption, passphrase) {
    if (!canEdit(journeyId, userId))
        return null;
    const memovePhotoId = (0, photoResolverService_1.getOrCreateMemovePhoto)(provider, assetId, userId, passphrase);
    const galleryId = database_1.db.transaction(() => ensureInGallery(journeyId, memovePhotoId, caption))();
    return database_1.db.prepare(`SELECT ${GALLERY_SELECT} FROM ${GALLERY_JOIN} WHERE gp.id = ?`).get(galleryId) ?? null;
}
// Unlink a photo from a specific entry; gallery row is preserved.
function unlinkPhotoFromEntry(entryId, journeyPhotoId, userId) {
    const entry = database_1.db.prepare('SELECT * FROM journey_entries WHERE id = ?').get(entryId);
    if (!entry)
        return false;
    if (!canEdit(entry.journey_id, userId))
        return false;
    const result = database_1.db
        .prepare('DELETE FROM journey_entry_photos WHERE entry_id = ? AND journey_photo_id = ?')
        .run(entryId, journeyPhotoId);
    return result.changes > 0;
}
// Hard-delete a gallery photo (removes from all entries and the gallery).
function deleteGalleryPhoto(journeyPhotoId, userId) {
    const row = database_1.db.prepare('SELECT * FROM journey_photos WHERE id = ?').get(journeyPhotoId);
    if (!row)
        return null;
    if (!canEdit(row.journey_id, userId))
        return null;
    const memoveRow = database_1.db.prepare('SELECT file_path, provider FROM memove_photos WHERE id = ?').get(row.photo_id);
    // cascade on journey_entry_photos.journey_photo_id handles junction cleanup
    database_1.db.prepare('DELETE FROM journey_photos WHERE id = ?').run(journeyPhotoId);
    (0, photoResolverService_1.deleteMemovePhotoIfOrphan)(row.photo_id);
    return { photo_id: row.photo_id, file_path: memoveRow?.file_path ?? null };
}
function setPhotoProvider(photoId, provider, assetId, ownerId) {
    // photoId = journey_photos.id (gallery row); look up the memove_photo_id
    const jp = database_1.db.prepare('SELECT photo_id FROM journey_photos WHERE id = ?').get(photoId);
    if (!jp)
        return;
    (0, photoResolverService_1.setMemovePhotoProvider)(jp.photo_id, provider, assetId, ownerId);
    // also denorm on gallery row for fast reads
    database_1.db.prepare('UPDATE journey_photos SET provider = ?, asset_id = ?, owner_id = ? WHERE id = ?').run(provider, assetId, ownerId, photoId);
}
function updatePhoto(photoId, userId, data) {
    // photoId = journey_photos.id (gallery row)
    const row = database_1.db.prepare('SELECT id, journey_id FROM journey_photos WHERE id = ?').get(photoId);
    if (!row)
        return null;
    if (!canEdit(row.journey_id, userId))
        return null;
    // caption lives on the gallery row; sort_order lives on the junction table
    // (JP_SELECT reads jep.sort_order, so updating journey_photos.sort_order
    // would not be reflected in the returned row).
    if (data.caption !== undefined) {
        database_1.db.prepare('UPDATE journey_photos SET caption = ? WHERE id = ?').run(data.caption, photoId);
    }
    if (data.sort_order !== undefined) {
        database_1.db.prepare('UPDATE journey_entry_photos SET sort_order = ? WHERE journey_photo_id = ?').run(data.sort_order, photoId);
    }
    return database_1.db.prepare(`SELECT ${JP_SELECT} FROM ${JP_JOIN} WHERE gp.id = ? LIMIT 1`).get(photoId);
}
// deletePhoto: hard-delete (backwards compat name used by old route).
function deletePhoto(photoId, userId) {
    const row = database_1.db.prepare('SELECT id, journey_id, photo_id FROM journey_photos WHERE id = ?').get(photoId);
    if (!row)
        return null;
    if (!canEdit(row.journey_id, userId))
        return null;
    const memoveRow = database_1.db.prepare('SELECT file_path, provider FROM memove_photos WHERE id = ?').get(row.photo_id);
    database_1.db.prepare('DELETE FROM journey_photos WHERE id = ?').run(photoId);
    (0, photoResolverService_1.deleteMemovePhotoIfOrphan)(row.photo_id);
    return { id: row.id, photo_id: row.photo_id, file_path: memoveRow?.file_path ?? null, journey_id: row.journey_id };
}
// ── Contributors ─────────────────────────────────────────────────────────
function addContributor(journeyId, userId, targetUserId, role) {
    if (!isOwner(journeyId, userId))
        return false;
    if (targetUserId === userId)
        return false;
    try {
        database_1.db.prepare('INSERT OR REPLACE INTO journey_contributors (journey_id, user_id, role, added_at) VALUES (?, ?, ?, ?)').run(journeyId, targetUserId, role, ts());
        broadcastJourneyEvent(journeyId, 'journey:contributor:changed', { targetUserId, role });
        return true;
    }
    catch {
        return false;
    }
}
function updateContributorRole(journeyId, userId, targetUserId, role) {
    if (!isOwner(journeyId, userId))
        return false;
    database_1.db.prepare('UPDATE journey_contributors SET role = ? WHERE journey_id = ? AND user_id = ?').run(role, journeyId, targetUserId);
    broadcastJourneyEvent(journeyId, 'journey:contributor:changed', { targetUserId, role });
    return true;
}
function removeContributor(journeyId, userId, targetUserId) {
    if (!isOwner(journeyId, userId))
        return false;
    database_1.db.prepare("DELETE FROM journey_contributors WHERE journey_id = ? AND user_id = ? AND role != 'owner'").run(journeyId, targetUserId);
    return true;
}
// ── Suggestions ──────────────────────────────────────────────────────────
function getSuggestions(userId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return database_1.db
        .prepare(`
    SELECT t.id, t.title, t.start_date, t.end_date, t.cover_image,
      (SELECT COUNT(*) FROM places p INNER JOIN day_assignments da ON da.place_id = p.id WHERE p.trip_id = t.id) as place_count
    FROM trips t
    LEFT JOIN trip_members tm ON t.id = tm.trip_id AND tm.user_id = ?
    WHERE (t.user_id = ? OR tm.user_id = ?)
      AND t.end_date IS NOT NULL
      AND t.end_date >= ?
      AND t.end_date <= date('now')
      AND t.id NOT IN (SELECT trip_id FROM journey_trips)
    ORDER BY t.end_date DESC
  `)
        .all(userId, userId, userId, thirtyDaysAgo);
}
// ── User trips (for trip picker) ─────────────────────────────────────────
function listUserTrips(userId) {
    return database_1.db
        .prepare(`
    SELECT t.id, t.title, t.start_date, t.end_date, t.cover_image,
      (SELECT COUNT(*) FROM places p INNER JOIN day_assignments da ON da.place_id = p.id WHERE p.trip_id = t.id) as place_count
    FROM trips t
    LEFT JOIN trip_members tm ON t.id = tm.trip_id AND tm.user_id = ?
    WHERE t.user_id = ? OR tm.user_id = ?
    ORDER BY t.start_date DESC
  `)
        .all(userId, userId, userId);
}
