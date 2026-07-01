"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSynologySettings = getSynologySettings;
exports.updateSynologySettings = updateSynologySettings;
exports.getSynologyStatus = getSynologyStatus;
exports.testSynologyConnection = testSynologyConnection;
exports.listSynologyAlbums = listSynologyAlbums;
exports.getSynologyAlbumPhotos = getSynologyAlbumPhotos;
exports.syncSynologyAlbumLink = syncSynologyAlbumLink;
exports.searchSynologyPhotos = searchSynologyPhotos;
exports.getSynologyAssetInfo = getSynologyAssetInfo;
exports.fetchSynologyThumbnailBytes = fetchSynologyThumbnailBytes;
exports.streamSynologyAsset = streamSynologyAsset;
const database_1 = require("../../db/database");
const apiKeyCrypto_1 = require("../apiKeyCrypto");
const ssrfGuard_1 = require("../../utils/ssrfGuard");
const unifiedService_1 = require("./unifiedService");
const helpersService_1 = require("./helpersService");
const notificationService_1 = require("../notificationService");
const SYNOLOGY_PROVIDER = 'synologyphotos';
// Users provide the full base URL including the Photos app path (e.g. https://nas:5001/photo).
// The API endpoint is always at {base_url}/webapi/entry.cgi.
const SYNOLOGY_ENDPOINT_PATH = '/webapi/entry.cgi';
const SYNOLOGY_ERROR_MESSAGES = {
    101: 'Missing API, method, or version parameter.',
    102: 'Requested API does not exist.',
    103: 'Requested method does not exist.',
    104: 'Requested API version is not supported.',
    105: 'Insufficient privilege.',
    106: 'Connection timeout.',
    107: 'Multiple logins blocked from this IP.',
    117: 'Manager privilege required.',
    119: 'Session is invalid or expired.',
    400: 'Invalid credentials.',
    401: 'Session expired or account disabled.',
    402: 'No permission to use this account.',
    403: 'Two-factor authentication code required.',
    404: 'Two-factor authentication failed.',
    406: 'Two-factor authentication is enforced for this account.',
    407: 'Maximum login attempts reached.',
    408: 'Password expired.',
    409: 'Remote password expired.',
    410: 'Password must be changed before login.',
    412: 'Guest account cannot log in.',
    413: 'OTP system files are corrupted.',
    414: 'Unable to log in.',
    416: 'Unable to log in.',
    417: 'OTP system is full.',
    498: 'System is upgrading.',
    499: 'System is not ready.',
};
;
function _readSynologyUser(userId, columns) {
    try {
        const row = database_1.db.prepare(`SELECT synology_url, synology_username, synology_password, synology_sid, synology_did, synology_skip_ssl FROM users WHERE id = ?`).get(userId);
        if (!row) {
            return (0, helpersService_1.fail)('User not found', 404);
        }
        const filtered = {};
        for (const column of columns) {
            filtered[column] = row[column];
        }
        return (0, helpersService_1.success)(filtered);
    }
    catch {
        return (0, helpersService_1.fail)('Failed to read Synology user data', 500);
    }
}
function _getSynologyCredentials(userId) {
    const user = _readSynologyUser(userId, ['synology_url', 'synology_username', 'synology_password', 'synology_skip_ssl']);
    if (!user.success)
        return user;
    if (!user?.data.synology_url || !user.data.synology_username || !user.data.synology_password)
        return (0, helpersService_1.fail)('Synology not configured', 400);
    const password = (0, apiKeyCrypto_1.decrypt_api_key)(user.data.synology_password);
    if (!password)
        return (0, helpersService_1.fail)('Synology credentials corrupted', 500);
    return (0, helpersService_1.success)({
        synology_url: user.data.synology_url,
        synology_username: user.data.synology_username,
        synology_password: password,
        synology_skip_ssl: user.data.synology_skip_ssl !== 0,
    });
}
function _buildSynologyEndpoint(url, params) {
    const normalized = url.replace(/\/$/, '').match(/^https?:\/\//) ? url.replace(/\/$/, '') : `https://${url.replace(/\/$/, '')}`;
    return `${normalized}${SYNOLOGY_ENDPOINT_PATH}?${params}`;
}
function _buildSynologyFormBody(params) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null)
            continue;
        body.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    return body;
}
async function _fetchSynologyJson(url, body, skipSsl = true) {
    const endpoint = _buildSynologyEndpoint(url, `api=${body.get('api')}`);
    try {
        const resp = await (0, ssrfGuard_1.safeFetch)(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            },
            body,
            signal: AbortSignal.timeout(30000),
        }, { rejectUnauthorized: !skipSsl });
        if (!resp.ok) {
            return (0, helpersService_1.fail)('Synology API request failed with status ' + resp.status, resp.status);
        }
        const response = await resp.json();
        if (!response.success) {
            const code = response.error.code;
            const message = SYNOLOGY_ERROR_MESSAGES[code] ?? 'Synology API request failed (code ' + code + ')';
            // Preserve session error codes (106, 107, 119) for internal retry logic in _requestSynologyApi.
            // All other Synology app-level codes are mapped to HTTP 400 — they are not HTTP status codes.
            const httpStatus = [106, 107, 119].includes(code) ? code : 400;
            return (0, helpersService_1.fail)(message, httpStatus);
        }
        return (0, helpersService_1.success)(response.data);
    }
    catch (error) {
        if (error instanceof ssrfGuard_1.SsrfBlockedError) {
            return (0, helpersService_1.fail)(error.message, 400);
        }
        return (0, helpersService_1.fail)('Failed to connect to Synology API', 500);
    }
}
const SYNOLOGY_DEVICE_NAME = 'memove';
async function _loginToSynology(url, username, password, opts = {}) {
    const { otp, deviceId, skipSsl = false } = opts;
    const body = new URLSearchParams({
        api: 'SYNO.API.Auth',
        method: 'login',
        version: '6',
        account: username,
        passwd: password,
        format: 'sid',
        client: 'browser',
        device_name: SYNOLOGY_DEVICE_NAME,
    });
    if (otp && otp.trim()) {
        body.append('otp_code', otp.trim());
        body.append('enable_device_token', 'yes');
    }
    if (deviceId) {
        body.append('device_id', deviceId);
    }
    const result = await _fetchSynologyJson(url, body, skipSsl);
    if (!result.success) {
        return result;
    }
    if (!result.data.sid) {
        return (0, helpersService_1.fail)('Failed to get session ID from Synology', 500);
    }
    return (0, helpersService_1.success)({ sid: result.data.sid, did: result.data.did });
}
async function _requestSynologyApi(userId, params) {
    const creds = _getSynologyCredentials(userId);
    if (!creds.success) {
        return creds;
    }
    const session = await _getSynologySession(userId);
    if (!session.success || !session.data) {
        return session;
    }
    const skipSsl = creds.data.synology_skip_ssl;
    const body = _buildSynologyFormBody({ ...params, _sid: session.data });
    const result = await _fetchSynologyJson(creds.data.synology_url, body, skipSsl);
    // 106 = session timeout, 107 = duplicate login kicked us out, 119 = SID not found/invalid
    if ('error' in result && [106, 107, 119].includes(result.error.status)) {
        _clearSynologySID(userId);
        const retrySession = await _getSynologySession(userId);
        if (!retrySession.success || !retrySession.data) {
            return retrySession;
        }
        return _fetchSynologyJson(creds.data.synology_url, _buildSynologyFormBody({ ...params, _sid: retrySession.data }), skipSsl);
    }
    return result;
}
function _normalizeSynologyPhotoInfo(item) {
    const address = item.additional?.address || {};
    const exif = item.additional?.exif || {};
    const gps = item.additional?.gps || {};
    return {
        id: String(item.additional?.thumbnail?.cache_key || ''),
        takenAt: item.time ? new Date(item.time * 1000).toISOString() : null,
        city: address.city || null,
        country: address.country || null,
        state: address.state || null,
        camera: exif.camera || null,
        lens: exif.lens || null,
        focalLength: exif.focal_length || null,
        aperture: exif.aperture || null,
        shutter: exif.exposure_time || null,
        iso: exif.iso || null,
        lat: gps.latitude || null,
        lng: gps.longitude || null,
        orientation: item.additional?.orientation || null,
        description: item.additional?.description || null,
        width: item.additional?.resolution?.width || null,
        height: item.additional?.resolution?.height || null,
        fileSize: item.filesize || null,
        fileName: item.filename || null,
    };
}
function _clearSynologySID(userId) {
    database_1.db.prepare('UPDATE users SET synology_sid = NULL WHERE id = ?').run(userId);
}
function _clearSynologySession(userId) {
    database_1.db.prepare('UPDATE users SET synology_sid = NULL, synology_did = NULL WHERE id = ?').run(userId);
}
function _splitPackedSynologyId(rawId) {
    // cache_key format from Synology is "{unit_id}_{timestamp}", e.g. "40808_1633659236".
    // The first segment must be a non-empty integer (the unit ID used for API calls).
    if (!/^\d+_.+$/.test(rawId))
        return null;
    const id = rawId.split('_')[0];
    return { id, cacheKey: rawId, assetId: rawId };
}
async function _getSynologySession(userId) {
    const cached = _readSynologyUser(userId, ['synology_sid', 'synology_did']);
    if (cached.success && cached.data?.synology_sid) {
        const decryptedSid = (0, apiKeyCrypto_1.decrypt_api_key)(cached.data.synology_sid);
        if (decryptedSid)
            return (0, helpersService_1.success)(decryptedSid);
        // Decryption failed (e.g. key rotation) — clear the stale SID and re-login
        _clearSynologySID(userId);
    }
    const creds = _getSynologyCredentials(userId);
    if (!creds.success) {
        return creds;
    }
    // Use stored device ID to skip OTP on re-login (trusted device flow)
    const storedDid = cached.success && cached.data?.synology_did
        ? ((0, apiKeyCrypto_1.decrypt_api_key)(cached.data.synology_did) || undefined)
        : undefined;
    const resp = await _loginToSynology(creds.data.synology_url, creds.data.synology_username, creds.data.synology_password, {
        deviceId: storedDid,
        skipSsl: creds.data.synology_skip_ssl,
    });
    if (!resp.success) {
        return resp;
    }
    database_1.db.prepare('UPDATE users SET synology_sid = ? WHERE id = ?').run((0, apiKeyCrypto_1.encrypt_api_key)(resp.data.sid), userId);
    return (0, helpersService_1.success)(resp.data.sid);
}
async function getSynologySettings(userId) {
    const creds = _getSynologyCredentials(userId);
    if (!creds.success)
        return creds;
    const session = await _getSynologySession(userId);
    return (0, helpersService_1.success)({
        synology_url: creds.data.synology_url || '',
        synology_username: creds.data.synology_username || '',
        synology_skip_ssl: creds.data.synology_skip_ssl,
        connected: session.success,
    });
}
async function updateSynologySettings(userId, synologyUrl, synologyUsername, synologyPassword, synologySkipSsl = false) {
    const ssrf = await (0, ssrfGuard_1.checkSsrf)(synologyUrl);
    if (!ssrf.allowed) {
        return (0, helpersService_1.fail)(ssrf.error, 400);
    }
    const result = _readSynologyUser(userId, ['synology_password']);
    if (!result.success)
        return result;
    const existingEncryptedPassword = result.data?.synology_password || null;
    if (!synologyPassword && !existingEncryptedPassword) {
        return (0, helpersService_1.fail)('No stored password found. Please provide a password to save settings.', 400);
    }
    // Only invalidate the session when the account itself changes (different URL or username).
    // If the user just tested the connection, testSynologyConnection already stored a fresh
    // sid + did — clearing them here would force an unnecessary re-login that may fail (MFA).
    const existing = _readSynologyUser(userId, ['synology_url', 'synology_username']);
    const urlChanged = existing.success && existing.data.synology_url !== synologyUrl;
    const userChanged = existing.success && existing.data.synology_username !== synologyUsername;
    const sessionCleared = urlChanged || userChanged;
    if (sessionCleared) {
        _clearSynologySession(userId);
        (0, notificationService_1.send)({
            event: 'synology_session_cleared',
            actorId: null,
            params: {},
            scope: 'user',
            targetId: userId,
        });
    }
    try {
        database_1.db.prepare('UPDATE users SET synology_url = ?, synology_username = ?, synology_password = ?, synology_skip_ssl = ? WHERE id = ?').run(synologyUrl, synologyUsername, synologyPassword ? (0, apiKeyCrypto_1.maybe_encrypt_api_key)(synologyPassword) : existingEncryptedPassword, synologySkipSsl ? 1 : 0, userId);
    }
    catch {
        return (0, helpersService_1.fail)('Failed to update Synology settings', 500);
    }
    return (0, helpersService_1.success)('settings updated');
}
async function getSynologyStatus(userId) {
    const sid = await _getSynologySession(userId);
    if ('error' in sid)
        return (0, helpersService_1.success)({ connected: false, error: sid.error.message });
    if (!sid.data)
        return (0, helpersService_1.success)({ connected: false, error: 'Not connected to Synology' });
    try {
        const user = database_1.db.prepare('SELECT synology_username FROM users WHERE id = ?').get(userId);
        return (0, helpersService_1.success)({ connected: true, user: { name: user?.synology_username || 'unknown user' } });
    }
    catch (err) {
        return (0, helpersService_1.success)({ connected: true, user: { name: 'unknown user' } });
    }
}
async function testSynologyConnection(userId, synologyUrl, synologyUsername, synologyPassword, synologyOtp, synologySkipSsl = false) {
    const ssrf = await (0, ssrfGuard_1.checkSsrf)(synologyUrl);
    if (!ssrf.allowed) {
        return (0, helpersService_1.fail)(ssrf.error, 400);
    }
    const resp = await _loginToSynology(synologyUrl, synologyUsername, synologyPassword, { otp: synologyOtp, skipSsl: synologySkipSsl });
    if ('error' in resp) {
        return (0, helpersService_1.success)({ connected: false, error: resp.error.message });
    }
    // Persist the session so the OTP code is not required again on save.
    // The did (device token) allows future re-logins without OTP.
    database_1.db.prepare('UPDATE users SET synology_sid = ? WHERE id = ?').run((0, apiKeyCrypto_1.encrypt_api_key)(resp.data.sid), userId);
    if (resp.data.did) {
        database_1.db.prepare('UPDATE users SET synology_did = ? WHERE id = ?').run((0, apiKeyCrypto_1.encrypt_api_key)(resp.data.did), userId);
    }
    return (0, helpersService_1.success)({ connected: true, user: { name: synologyUsername } });
}
async function _fetchAllSynologyAlbums(userId, baseParams) {
    const pageSize = 100;
    const all = [];
    let offset = 0;
    while (true) {
        const result = await _requestSynologyApi(userId, { ...baseParams, offset, limit: pageSize });
        if (!result.success)
            return result;
        const items = result.data.list || [];
        all.push(...items);
        if (items.length < pageSize)
            break;
        offset += pageSize;
    }
    return (0, helpersService_1.success)(all);
}
async function listSynologyAlbums(userId) {
    const [personal, shared, sharedWithMe] = await Promise.allSettled([
        _fetchAllSynologyAlbums(userId, { api: 'SYNO.Foto.Browse.Album', method: 'list', version: 4 }),
        _fetchAllSynologyAlbums(userId, { api: 'SYNO.Foto.Browse.Album', method: 'list', version: 4, category: 'shared' }),
        _fetchAllSynologyAlbums(userId, { api: 'SYNO.Foto.Sharing.Misc', method: 'list_shared_with_me_album', version: 1, additional: ['thumbnail', 'sharing_info'] }),
    ]);
    const map = new Map();
    const addAlbums = (result, extractPassphrase) => {
        if (result.status === 'rejected')
            return;
        const value = result.value;
        if ('error' in value) {
            console.warn('[Synology] album list partial failure:', value.error.message);
            return;
        }
        for (const album of value.data ?? []) {
            const id = String(album.id);
            const passphrase = extractPassphrase(album);
            map.set(id, { id, albumName: album.name || '', assetCount: album.item_count || 0, passphrase });
        }
    };
    addAlbums(personal, () => undefined);
    addAlbums(shared, (a) => a.passphrase || undefined);
    addAlbums(sharedWithMe, (a) => a.passphrase || a.sharing_info?.passphrase || undefined);
    if (map.size === 0 && personal.status === 'fulfilled' && !personal.value.success) {
        return personal.value;
    }
    const albums = [...map.values()].sort((a, b) => a.albumName.localeCompare(b.albumName));
    return (0, helpersService_1.success)({ albums });
}
async function getSynologyAlbumPhotos(userId, albumId, passphrase) {
    const allItems = [];
    const pageSize = 50;
    let offset = 0;
    while (true) {
        const params = passphrase
            ? { api: 'SYNO.Foto.Browse.Item', method: 'list', version: 1, passphrase, offset, limit: pageSize, additional: ['thumbnail'] }
            : { api: 'SYNO.Foto.Browse.Item', method: 'list', version: 1, album_id: Number(albumId), offset, limit: pageSize, additional: ['thumbnail'] };
        const result = await _requestSynologyApi(userId, params);
        if (!result.success)
            return result;
        const items = result.data.list || [];
        allItems.push(...items);
        if (items.length < pageSize)
            break;
        offset += pageSize;
    }
    const assets = allItems.map(item => ({
        id: String(item.additional?.thumbnail?.cache_key || item.id || ''),
        takenAt: item.time ? new Date(item.time * 1000).toISOString() : '',
    })).filter(a => a.id);
    return (0, helpersService_1.success)({ assets, total: assets.length, hasMore: false });
}
async function syncSynologyAlbumLink(userId, tripId, linkId, sid) {
    const response = (0, helpersService_1.getAlbumLinkForSync)(tripId, linkId, userId);
    if (!response.success)
        return response;
    const { albumId, passphrase } = response.data;
    const allItems = [];
    const pageSize = 50;
    let offset = 0;
    while (true) {
        const itemParams = passphrase
            ? { api: 'SYNO.Foto.Browse.Item', method: 'list', version: 1, passphrase, offset, limit: pageSize, additional: ['thumbnail'] }
            : { api: 'SYNO.Foto.Browse.Item', method: 'list', version: 1, album_id: Number(albumId), offset, limit: pageSize, additional: ['thumbnail'] };
        const result = await _requestSynologyApi(userId, itemParams);
        if (!result.success)
            return result;
        const items = result.data.list || [];
        allItems.push(...items);
        if (items.length < pageSize)
            break;
        offset += pageSize;
    }
    const selection = {
        provider: SYNOLOGY_PROVIDER,
        asset_ids: allItems.map(item => String(item.additional?.thumbnail?.cache_key || '')).filter(id => id),
        passphrase,
    };
    const result = await (0, unifiedService_1.addTripPhotos)(tripId, userId, true, [selection], sid, linkId);
    if (!result.success)
        return result;
    (0, helpersService_1.updateSyncTimeForAlbumLink)(linkId);
    return (0, helpersService_1.success)({ added: result.data.added, total: allItems.length });
}
async function searchSynologyPhotos(userId, from, to, offset = 0, limit = 300) {
    const params = {
        api: 'SYNO.Foto.Search.Search',
        method: 'list_item',
        version: 1,
        offset,
        limit,
        keyword: '.',
        additional: ['thumbnail', 'address'],
    };
    if (from || to) {
        if (from) {
            params.start_time = Math.floor(new Date(from).getTime() / 1000);
        }
        if (to) {
            params.end_time = Math.floor(new Date(to).getTime() / 1000) + 86400; //adding it as the next day 86400 seconds in day
        }
    }
    // SYNO.Foto.Search.Search list_item does not return a total count — only data.list.
    // hasMore is inferred: if we got a full page, there may be more.
    const result = await _requestSynologyApi(userId, params);
    if (!result.success)
        return result;
    const allItems = result.data.list || [];
    const assets = allItems.map(item => _normalizeSynologyPhotoInfo(item));
    return (0, helpersService_1.success)({
        assets,
        total: allItems.length,
        hasMore: allItems.length === limit,
    });
}
async function getSynologyAssetInfo(userId, photoId, targetUserId, passphrase) {
    const parsedId = _splitPackedSynologyId(photoId);
    if (!parsedId)
        return (0, helpersService_1.fail)('Invalid photo ID format', 400);
    const infoParams = {
        api: 'SYNO.Foto.Browse.Item',
        method: 'get',
        version: 5,
        id: `[${Number(parsedId.id) + 1}]`, //for some reason synology wants id moved by one to get image info
        additional: ['resolution', 'exif', 'gps', 'address', 'orientation', 'description'],
    };
    if (passphrase)
        infoParams.passphrase = passphrase;
    const result = await _requestSynologyApi(targetUserId, infoParams);
    if (!result.success)
        return result;
    const metadata = result.data.list?.[0];
    if (!metadata)
        return (0, helpersService_1.fail)('Photo not found', 404);
    const normalized = _normalizeSynologyPhotoInfo(metadata);
    normalized.id = photoId;
    return (0, helpersService_1.success)(normalized);
}
async function fetchSynologyThumbnailBytes(userId, targetUserId, photoId, passphrase) {
    const parsedId = _splitPackedSynologyId(photoId);
    if (!parsedId)
        return { error: 'Invalid photo ID format', status: 400 };
    const synology_credentials = _getSynologyCredentials(targetUserId);
    if (!synology_credentials.success)
        return { error: 'Credentials error', status: 500 };
    const sid = await _getSynologySession(targetUserId);
    if (!sid.success)
        return { error: 'Session error', status: 500 };
    if (!sid.data)
        return { error: 'Session ID missing', status: 500 };
    const params = new URLSearchParams({
        api: 'SYNO.Foto.Thumbnail',
        method: 'get',
        version: '2',
        mode: 'download',
        id: parsedId.id,
        type: 'unit',
        // Match the uncached streamSynologyAsset default — 'sm' (240px) looked
        // pixelated on retina.
        size: 'm',
        cache_key: parsedId.cacheKey,
        _sid: sid.data,
    });
    if (passphrase)
        params.append('passphrase', passphrase);
    const url = _buildSynologyEndpoint(synology_credentials.data.synology_url, params.toString());
    try {
        const resp = await (0, ssrfGuard_1.safeFetch)(url);
        if (!resp.ok)
            return { error: 'Upstream error', status: resp.status };
        const contentType = resp.headers.get('content-type') || 'image/jpeg';
        const bytes = Buffer.from(await resp.arrayBuffer());
        return { bytes, contentType };
    }
    catch {
        return { error: 'Proxy error', status: 502 };
    }
}
async function streamSynologyAsset(response, userId, targetUserId, photoId, kind, size, passphrase) {
    const parsedId = _splitPackedSynologyId(photoId);
    if (!parsedId) {
        (0, helpersService_1.handleServiceResult)(response, (0, helpersService_1.fail)('Invalid photo ID format', 400));
        return;
    }
    const synology_credentials = _getSynologyCredentials(targetUserId);
    if (!synology_credentials.success) {
        (0, helpersService_1.handleServiceResult)(response, synology_credentials);
        return;
    }
    const sid = await _getSynologySession(targetUserId);
    if (!sid.success) {
        (0, helpersService_1.handleServiceResult)(response, sid);
        return;
    }
    if (!sid.data) {
        (0, helpersService_1.handleServiceResult)(response, (0, helpersService_1.fail)('Failed to retrieve session ID', 500));
        return;
    }
    //size: 'sm' 240px| 'm' 320px| 'xl' 1280px| 'preview' ?
    // Use Thumbnail API for both thumbnail and original — avoids serving raw HEIC files
    // (original uses xl size to get a full-resolution JPEG-compatible render).
    // Thumbnail default is 'm' (~320px) — 'sm' (240px) looked pixelated on
    // the journey grid on retina screens.
    const resolvedSize = kind === 'original' ? 'xl' : (size || 'm');
    const params = new URLSearchParams({
        api: 'SYNO.Foto.Thumbnail',
        method: 'get',
        version: '2',
        mode: 'download',
        id: parsedId.id,
        type: 'unit',
        size: resolvedSize,
        cache_key: parsedId.cacheKey,
        _sid: sid.data,
    });
    if (passphrase)
        params.append('passphrase', passphrase);
    const url = _buildSynologyEndpoint(synology_credentials.data.synology_url, params.toString());
    await (0, helpersService_1.pipeAsset)(url, response, undefined, undefined, 'public, max-age=86400');
}
