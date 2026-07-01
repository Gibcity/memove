"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDocker = void 0;
exports.compareVersions = compareVersions;
exports.listUsers = listUsers;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
exports.getStats = getStats;
exports.getPermissions = getPermissions;
exports.savePermissions = savePermissions;
exports.getAuditLog = getAuditLog;
exports.getOidcSettings = getOidcSettings;
exports.updateOidcSettings = updateOidcSettings;
exports.saveDemoBaseline = saveDemoBaseline;
exports.getGithubReleases = getGithubReleases;
exports.__clearVersionCacheForTests = __clearVersionCacheForTests;
exports.checkVersion = checkVersion;
exports.checkAndNotifyVersion = checkAndNotifyVersion;
exports.listInvites = listInvites;
exports.createInvite = createInvite;
exports.deleteInvite = deleteInvite;
exports.getBagTracking = getBagTracking;
exports.updateBagTracking = updateBagTracking;
exports.getPlacesPhotos = getPlacesPhotos;
exports.updatePlacesPhotos = updatePlacesPhotos;
exports.getPlacesAutocomplete = getPlacesAutocomplete;
exports.updatePlacesAutocomplete = updatePlacesAutocomplete;
exports.getPlacesDetails = getPlacesDetails;
exports.updatePlacesDetails = updatePlacesDetails;
exports.getCollabFeatures = getCollabFeatures;
exports.updateCollabFeatures = updateCollabFeatures;
exports.listPackingTemplates = listPackingTemplates;
exports.getPackingTemplate = getPackingTemplate;
exports.createPackingTemplate = createPackingTemplate;
exports.updatePackingTemplate = updatePackingTemplate;
exports.deletePackingTemplate = deletePackingTemplate;
exports.createTemplateCategory = createTemplateCategory;
exports.updateTemplateCategory = updateTemplateCategory;
exports.deleteTemplateCategory = deleteTemplateCategory;
exports.createTemplateItem = createTemplateItem;
exports.updateTemplateItem = updateTemplateItem;
exports.deleteTemplateItem = deleteTemplateItem;
exports.isAddonEnabled = isAddonEnabled;
exports.listAddons = listAddons;
exports.updateAddon = updateAddon;
exports.listMcpTokens = listMcpTokens;
exports.deleteMcpToken = deleteMcpToken;
exports.listOAuthSessions = listOAuthSessions;
exports.revokeOAuthSession = revokeOAuthSession;
exports.rotateJwtSecret = rotateJwtSecret;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const database_1 = require("../db/database");
const config_1 = require("../config");
const apiKeyCrypto_1 = require("./apiKeyCrypto");
const permissions_1 = require("./permissions");
const mcp_1 = require("../mcp");
const userCleanupService_1 = require("./userCleanupService");
const passwordPolicy_1 = require("./passwordPolicy");
const helpersService_1 = require("./memories/helpersService");
const notificationService_1 = require("./notificationService");
const authService_1 = require("./authService");
// ── Helpers ────────────────────────────────────────────────────────────────
// bcrypt cost factor for user passwords — kept in sync with authService.
const BCRYPT_COST = 12;
function utcSuffix(ts) {
    if (!ts)
        return null;
    return ts.endsWith('Z') ? ts : ts.replace(' ', 'T') + 'Z';
}
function compareVersions(a, b) {
    const parse = (v) => {
        const [base, pre] = v.split('-pre.');
        const parts = base.split('.').map(Number);
        const n = pre !== undefined ? parseInt(pre, 10) : null;
        const preN = n !== null && Number.isFinite(n) ? n : null;
        return { parts, preN };
    };
    const pa = parse(a), pb = parse(b);
    for (let i = 0; i < Math.max(pa.parts.length, pb.parts.length); i++) {
        const na = pa.parts[i] || 0, nb = pb.parts[i] || 0;
        if (na > nb)
            return 1;
        if (na < nb)
            return -1;
    }
    // Equal base: stable > prerelease; higher preN wins among prereleases
    if (pa.preN === null && pb.preN !== null)
        return 1;
    if (pa.preN !== null && pb.preN === null)
        return -1;
    if (pa.preN !== null && pb.preN !== null) {
        if (pa.preN > pb.preN)
            return 1;
        if (pa.preN < pb.preN)
            return -1;
    }
    return 0;
}
exports.isDocker = (() => {
    try {
        return fs_1.default.existsSync('/.dockerenv') || (fs_1.default.existsSync('/proc/1/cgroup') && fs_1.default.readFileSync('/proc/1/cgroup', 'utf8').includes('docker'));
    }
    catch {
        return false;
    }
})();
// ── User CRUD ──────────────────────────────────────────────────────────────
function listUsers() {
    const users = database_1.db.prepare('SELECT id, username, email, role, avatar, created_at, updated_at, last_login FROM users ORDER BY created_at DESC').all();
    let onlineUserIds = new Set();
    try {
        const { getOnlineUserIds } = require('../websocket');
        onlineUserIds = getOnlineUserIds();
    }
    catch { /* */ }
    return users.map(u => ({
        ...u,
        avatar_url: u.avatar ? `/uploads/avatars/${u.avatar}` : null,
        created_at: utcSuffix(u.created_at),
        updated_at: utcSuffix(u.updated_at),
        last_login: utcSuffix(u.last_login),
        online: onlineUserIds.has(u.id),
    }));
}
function createUser(data) {
    const username = data.username?.trim();
    const email = data.email?.trim();
    const password = data.password?.trim();
    if (!username || !email || !password) {
        return { error: 'Username, email and password are required', status: 400 };
    }
    const pwCheck = (0, passwordPolicy_1.validatePassword)(password);
    if (!pwCheck.ok)
        return { error: pwCheck.reason, status: 400 };
    if (data.role && !['user', 'admin'].includes(data.role)) {
        return { error: 'Invalid role', status: 400 };
    }
    const existingUsername = database_1.db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUsername)
        return { error: 'Username already taken', status: 409 };
    const existingEmail = database_1.db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail)
        return { error: 'Email already taken', status: 409 };
    const passwordHash = bcryptjs_1.default.hashSync(password, BCRYPT_COST);
    const result = database_1.db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)').run(username, email, passwordHash, data.role || 'user');
    const user = database_1.db.prepare('SELECT id, username, email, role, created_at, updated_at FROM users WHERE id = ?').get(result.lastInsertRowid);
    return {
        user,
        insertedId: Number(result.lastInsertRowid),
        auditDetails: { username, email, role: data.role || 'user' },
    };
}
function updateUser(id, data) {
    const username = typeof data.username === 'string' ? data.username.trim() : data.username;
    const email = typeof data.email === 'string' ? data.email.trim() : data.email;
    const { role, password } = data;
    const user = database_1.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!user)
        return { error: 'User not found', status: 404 };
    if (role && !['user', 'admin'].includes(role)) {
        return { error: 'Invalid role', status: 400 };
    }
    if (username && username !== user.username) {
        const conflict = database_1.db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, id);
        if (conflict)
            return { error: 'Username already taken', status: 409 };
    }
    if (email && email !== user.email) {
        const conflict = database_1.db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, id);
        if (conflict)
            return { error: 'Email already taken', status: 409 };
    }
    if (password) {
        const pwCheck = (0, passwordPolicy_1.validatePassword)(password);
        if (!pwCheck.ok)
            return { error: pwCheck.reason, status: 400 };
    }
    const passwordHash = password ? bcryptjs_1.default.hashSync(password, BCRYPT_COST) : null;
    // Don't let the admin UI demote the last remaining admin — that would leave the
    // instance with no one able to manage it (and on OIDC-only setups, no recovery). #1274
    if (role && role !== 'admin') {
        const current = database_1.db.prepare('SELECT role FROM users WHERE id = ?').get(id);
        if (current?.role === 'admin') {
            const adminCount = database_1.db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
            if (adminCount <= 1)
                return { error: 'Cannot remove the last admin', status: 400 };
        }
    }
    database_1.db.prepare(`
    UPDATE users SET
      username = COALESCE(?, username),
      email = COALESCE(?, email),
      role = COALESCE(?, role),
      password_hash = COALESCE(?, password_hash),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(username || null, email || null, role || null, passwordHash, id);
    const updated = database_1.db.prepare('SELECT id, username, email, role, created_at, updated_at FROM users WHERE id = ?').get(id);
    const changed = [];
    if (username)
        changed.push('username');
    if (email)
        changed.push('email');
    if (role)
        changed.push('role');
    if (password)
        changed.push('password');
    return {
        user: updated,
        previousEmail: user.email,
        changed,
    };
}
function deleteUser(id, currentUserId) {
    if (parseInt(id) === currentUserId) {
        return { error: 'Cannot delete own account', status: 400 };
    }
    const userToDel = database_1.db.prepare('SELECT id, email FROM users WHERE id = ?').get(id);
    if (!userToDel)
        return { error: 'User not found', status: 404 };
    (0, userCleanupService_1.deleteUserCompletely)(userToDel.id);
    return { email: userToDel.email };
}
// ── Stats ──────────────────────────────────────────────────────────────────
function getStats() {
    const totalUsers = database_1.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalTrips = database_1.db.prepare('SELECT COUNT(*) as count FROM trips').get().count;
    const totalPlaces = database_1.db.prepare('SELECT COUNT(*) as count FROM places').get().count;
    const totalFiles = database_1.db.prepare('SELECT COUNT(*) as count FROM trip_files').get().count;
    return { totalUsers, totalTrips, totalPlaces, totalFiles };
}
// ── Permissions ────────────────────────────────────────────────────────────
function getPermissions() {
    const current = (0, permissions_1.getAllPermissions)();
    const actions = permissions_1.PERMISSION_ACTIONS.map(a => ({
        key: a.key,
        level: current[a.key],
        defaultLevel: a.defaultLevel,
        allowedLevels: a.allowedLevels,
    }));
    return { permissions: actions };
}
function savePermissions(permissions) {
    const { skipped } = (0, permissions_1.savePermissions)(permissions);
    return { permissions: (0, permissions_1.getAllPermissions)(), skipped };
}
// ── Audit Log ──────────────────────────────────────────────────────────────
function getAuditLog(query) {
    const limitRaw = parseInt(String(query.limit || '100'), 10);
    const offsetRaw = parseInt(String(query.offset || '0'), 10);
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 500);
    const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);
    const rows = database_1.db.prepare(`
    SELECT a.id, a.created_at, a.user_id, u.username, u.email as user_email, a.action, a.resource, a.details, a.ip
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
    const total = database_1.db.prepare('SELECT COUNT(*) as c FROM audit_log').get().c;
    const entries = rows.map((r) => {
        let details = null;
        if (r.details) {
            try {
                details = JSON.parse(r.details);
            }
            catch {
                details = { _parse_error: true };
            }
        }
        const created_at = r.created_at && !r.created_at.endsWith('Z') ? r.created_at.replace(' ', 'T') + 'Z' : r.created_at;
        return { ...r, created_at, details };
    });
    return { entries, total, limit, offset };
}
// ── OIDC Settings ──────────────────────────────────────────────────────────
function getOidcSettings() {
    const get = (key) => database_1.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key)?.value || '';
    const secret = (0, apiKeyCrypto_1.decrypt_api_key)(get('oidc_client_secret'));
    return {
        issuer: get('oidc_issuer'),
        client_id: get('oidc_client_id'),
        client_secret_set: !!secret,
        display_name: get('oidc_display_name'),
        oidc_only: get('oidc_only') === 'true',
        discovery_url: get('oidc_discovery_url'),
    };
}
function updateOidcSettings(data) {
    // Lockout prevention: can't remove OIDC config when password login is disabled
    if ((data.issuer === '' || data.client_id === '') && !(0, authService_1.resolveAuthToggles)().password_login) {
        return { error: 'Cannot remove SSO configuration while password login is disabled. Enable password login first.', status: 400 };
    }
    const set = (key, val) => database_1.db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run(key, val || '');
    set('oidc_issuer', data.issuer ?? '');
    set('oidc_client_id', data.client_id ?? '');
    if (data.client_secret !== undefined)
        set('oidc_client_secret', (0, apiKeyCrypto_1.maybe_encrypt_api_key)(data.client_secret) ?? '');
    set('oidc_display_name', data.display_name ?? '');
    set('oidc_discovery_url', data.discovery_url ?? '');
    return { success: true };
}
// ── Demo Baseline ──────────────────────────────────────────────────────────
function saveDemoBaseline() {
    if (process.env.DEMO_MODE?.toLowerCase() !== 'true') {
        return { error: 'Not found', status: 404 };
    }
    try {
        const { saveBaseline } = require('../demo/demo-reset');
        saveBaseline();
        return { message: 'Demo baseline saved. Hourly resets will restore to this state.' };
    }
    catch (err) {
        console.error(err);
        return { error: 'Failed to save baseline', status: 500 };
    }
}
// ── GitHub Integration ─────────────────────────────────────────────────────
async function getGithubReleases(perPage = '10', page = '1') {
    try {
        const resp = await fetch(`https://api.github.com/repos/mauriceboe/memove/releases?per_page=${perPage}&page=${page}`, { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'memove-Server' } });
        if (!resp.ok)
            return [];
        const data = await resp.json();
        return Array.isArray(data) ? data : [];
    }
    catch {
        return [];
    }
}
const VERSION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let _versionCache = null;
/** Test-only: clear the in-memory version cache. */
function __clearVersionCacheForTests() {
    _versionCache = null;
}
async function checkVersion() {
    if (_versionCache && Date.now() < _versionCache.expiresAt) {
        return _versionCache.data;
    }
    const currentVersion = process.env.APP_VERSION || require('../../package.json').version;
    const isPrerelease = currentVersion.includes('-pre.');
    const fallback = { current: currentVersion, latest: currentVersion, update_available: false, is_docker: exports.isDocker, is_prerelease: isPrerelease };
    let result;
    try {
        if (isPrerelease) {
            // Fetch release list and find the newest prerelease
            const resp = await fetch('https://api.github.com/repos/mauriceboe/memove/releases?per_page=100', { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'memove-Server' } });
            if (!resp.ok) {
                return fallback;
            }
            const data = await resp.json();
            const prereleases = Array.isArray(data) ? data.filter(r => r.prerelease) : [];
            if (!prereleases.length) {
                return fallback;
            }
            // Pre-compute stripped versions, then sort descending
            const tagged = prereleases.map(r => ({ r, v: (r.tag_name || '').replace(/^v/, '') }));
            tagged.sort((a, b) => compareVersions(b.v, a.v));
            const latest = tagged[0].v;
            const update_available = !!latest && latest !== currentVersion && compareVersions(latest, currentVersion) > 0;
            result = { current: currentVersion, latest, update_available, release_url: tagged[0].r.html_url || '', is_docker: exports.isDocker, is_prerelease: true };
        }
        else {
            const resp = await fetch('https://api.github.com/repos/mauriceboe/memove/releases/latest', { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'memove-Server' } });
            if (!resp.ok) {
                return fallback;
            }
            const data = await resp.json();
            const latest = (data.tag_name || '').replace(/^v/, '');
            const update_available = !!latest && latest !== currentVersion && compareVersions(latest, currentVersion) > 0;
            result = { current: currentVersion, latest, update_available, release_url: data.html_url || '', is_docker: exports.isDocker, is_prerelease: false };
        }
    }
    catch {
        return fallback;
    }
    _versionCache = { data: result, expiresAt: Date.now() + VERSION_CACHE_TTL };
    return result;
}
async function checkAndNotifyVersion() {
    try {
        const result = await checkVersion();
        if (!result.update_available)
            return;
        const lastNotified = database_1.db.prepare('SELECT value FROM app_settings WHERE key = ?').get('last_notified_version')?.value;
        if (lastNotified === result.latest)
            return;
        database_1.db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('last_notified_version', result.latest);
        await (0, notificationService_1.send)({
            event: 'version_available',
            actorId: null,
            scope: 'admin',
            targetId: 0,
            params: { version: result.latest },
        });
    }
    catch {
        // Silently ignore — version check is non-critical
    }
}
// ── Invite Tokens ──────────────────────────────────────────────────────────
function listInvites() {
    return database_1.db.prepare(`
    SELECT i.*, u.username as created_by_name
    FROM invite_tokens i
    JOIN users u ON i.created_by = u.id
    ORDER BY i.created_at DESC
  `).all();
}
function createInvite(createdBy, data) {
    const rawUses = parseInt(String(data.max_uses));
    const uses = rawUses === 0 ? 0 : Math.min(Math.max(rawUses || 1, 1), 5);
    const token = crypto_1.default.randomBytes(16).toString('hex');
    const expiresAt = data.expires_in_days
        ? new Date(Date.now() + parseInt(String(data.expires_in_days)) * 86400000).toISOString()
        : null;
    const ins = database_1.db.prepare('INSERT INTO invite_tokens (token, max_uses, expires_at, created_by) VALUES (?, ?, ?, ?)').run(token, uses, expiresAt, createdBy);
    const inviteId = Number(ins.lastInsertRowid);
    const invite = database_1.db.prepare(`
    SELECT i.*, u.username as created_by_name
    FROM invite_tokens i
    JOIN users u ON i.created_by = u.id
    WHERE i.id = ?
  `).get(inviteId);
    return { invite, inviteId, uses, expiresInDays: data.expires_in_days ?? null };
}
function deleteInvite(id) {
    const invite = database_1.db.prepare('SELECT id FROM invite_tokens WHERE id = ?').get(id);
    if (!invite)
        return { error: 'Invite not found', status: 404 };
    database_1.db.prepare('DELETE FROM invite_tokens WHERE id = ?').run(id);
    return {};
}
// ── Bag Tracking ───────────────────────────────────────────────────────────
function getBagTracking() {
    const row = database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'bag_tracking_enabled'").get();
    return { enabled: row?.value === 'true' };
}
function updateBagTracking(enabled) {
    database_1.db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('bag_tracking_enabled', ?)").run(enabled ? 'true' : 'false');
    return { enabled: !!enabled };
}
// ── Places Photos ─────────────────────────────────────────────────────────
function getPlacesPhotos() {
    const row = database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'places_photos_enabled'").get();
    return { enabled: row?.value !== 'false' };
}
function updatePlacesPhotos(enabled) {
    database_1.db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('places_photos_enabled', ?)").run(enabled ? 'true' : 'false');
    return { enabled: !!enabled };
}
// ── Places Autocomplete ────────────────────────────────────────────────────
function getPlacesAutocomplete() {
    const row = database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'places_autocomplete_enabled'").get();
    return { enabled: row?.value !== 'false' };
}
function updatePlacesAutocomplete(enabled) {
    database_1.db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('places_autocomplete_enabled', ?)").run(enabled ? 'true' : 'false');
    return { enabled: !!enabled };
}
// ── Places Details ─────────────────────────────────────────────────────────
function getPlacesDetails() {
    const row = database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'places_details_enabled'").get();
    return { enabled: row?.value !== 'false' };
}
function updatePlacesDetails(enabled) {
    database_1.db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('places_details_enabled', ?)").run(enabled ? 'true' : 'false');
    return { enabled: !!enabled };
}
// ── Collab Features ───────────────────────────────────────────────────────
const COLLAB_FEATURE_KEYS = ['collab_chat_enabled', 'collab_notes_enabled', 'collab_polls_enabled', 'collab_whatsnext_enabled'];
function getCollabFeatures() {
    const rows = database_1.db.prepare("SELECT key, value FROM app_settings WHERE key IN ('collab_chat_enabled', 'collab_notes_enabled', 'collab_polls_enabled', 'collab_whatsnext_enabled')").all();
    const map = {};
    for (const r of rows)
        map[r.key] = r.value;
    return {
        chat: map['collab_chat_enabled'] !== 'false',
        notes: map['collab_notes_enabled'] !== 'false',
        polls: map['collab_polls_enabled'] !== 'false',
        whatsnext: map['collab_whatsnext_enabled'] !== 'false',
    };
}
function updateCollabFeatures(features) {
    const mapping = { chat: 'collab_chat_enabled', notes: 'collab_notes_enabled', polls: 'collab_polls_enabled', whatsnext: 'collab_whatsnext_enabled' };
    const stmt = database_1.db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)");
    for (const [feat, key] of Object.entries(mapping)) {
        if (features[feat] !== undefined)
            stmt.run(key, features[feat] ? 'true' : 'false');
    }
    return getCollabFeatures();
}
// ── Packing Templates ──────────────────────────────────────────────────────
function listPackingTemplates() {
    return database_1.db.prepare(`
    SELECT pt.*, u.username as created_by_name,
      (SELECT COUNT(*) FROM packing_template_items ti JOIN packing_template_categories tc ON ti.category_id = tc.id WHERE tc.template_id = pt.id) as item_count,
      (SELECT COUNT(*) FROM packing_template_categories WHERE template_id = pt.id) as category_count
    FROM packing_templates pt
    JOIN users u ON pt.created_by = u.id
    ORDER BY pt.created_at DESC
  `).all();
}
function getPackingTemplate(id) {
    const template = database_1.db.prepare('SELECT * FROM packing_templates WHERE id = ?').get(id);
    if (!template)
        return { error: 'Template not found', status: 404 };
    const categories = database_1.db.prepare('SELECT * FROM packing_template_categories WHERE template_id = ? ORDER BY sort_order, id').all(id);
    const items = database_1.db.prepare(`
    SELECT ti.* FROM packing_template_items ti
    JOIN packing_template_categories tc ON ti.category_id = tc.id
    WHERE tc.template_id = ? ORDER BY ti.sort_order, ti.id
  `).all(id);
    return { template, categories, items };
}
function createPackingTemplate(name, createdBy) {
    if (!name?.trim())
        return { error: 'Name is required', status: 400 };
    const result = database_1.db.prepare('INSERT INTO packing_templates (name, created_by) VALUES (?, ?)').run(name.trim(), createdBy);
    const template = database_1.db.prepare('SELECT * FROM packing_templates WHERE id = ?').get(result.lastInsertRowid);
    return { template };
}
function updatePackingTemplate(id, data) {
    const template = database_1.db.prepare('SELECT * FROM packing_templates WHERE id = ?').get(id);
    if (!template)
        return { error: 'Template not found', status: 404 };
    if (data.name?.trim())
        database_1.db.prepare('UPDATE packing_templates SET name = ? WHERE id = ?').run(data.name.trim(), id);
    return { template: database_1.db.prepare('SELECT * FROM packing_templates WHERE id = ?').get(id) };
}
function deletePackingTemplate(id) {
    const template = database_1.db.prepare('SELECT * FROM packing_templates WHERE id = ?').get(id);
    if (!template)
        return { error: 'Template not found', status: 404 };
    database_1.db.prepare('DELETE FROM packing_templates WHERE id = ?').run(id);
    return { name: template.name };
}
// Template categories
function createTemplateCategory(templateId, name) {
    if (!name?.trim())
        return { error: 'Category name is required', status: 400 };
    const template = database_1.db.prepare('SELECT * FROM packing_templates WHERE id = ?').get(templateId);
    if (!template)
        return { error: 'Template not found', status: 404 };
    const maxOrder = database_1.db.prepare('SELECT MAX(sort_order) as max FROM packing_template_categories WHERE template_id = ?').get(templateId);
    const result = database_1.db.prepare('INSERT INTO packing_template_categories (template_id, name, sort_order) VALUES (?, ?, ?)').run(templateId, name.trim(), (maxOrder.max ?? -1) + 1);
    return { category: database_1.db.prepare('SELECT * FROM packing_template_categories WHERE id = ?').get(result.lastInsertRowid) };
}
function updateTemplateCategory(templateId, catId, data) {
    const cat = database_1.db.prepare('SELECT * FROM packing_template_categories WHERE id = ? AND template_id = ?').get(catId, templateId);
    if (!cat)
        return { error: 'Category not found', status: 404 };
    if (data.name?.trim())
        database_1.db.prepare('UPDATE packing_template_categories SET name = ? WHERE id = ?').run(data.name.trim(), catId);
    return { category: database_1.db.prepare('SELECT * FROM packing_template_categories WHERE id = ?').get(catId) };
}
function deleteTemplateCategory(templateId, catId) {
    const cat = database_1.db.prepare('SELECT * FROM packing_template_categories WHERE id = ? AND template_id = ?').get(catId, templateId);
    if (!cat)
        return { error: 'Category not found', status: 404 };
    database_1.db.prepare('DELETE FROM packing_template_categories WHERE id = ?').run(catId);
    return {};
}
// Template items
function createTemplateItem(templateId, catId, name) {
    if (!name?.trim())
        return { error: 'Item name is required', status: 400 };
    const cat = database_1.db.prepare('SELECT * FROM packing_template_categories WHERE id = ? AND template_id = ?').get(catId, templateId);
    if (!cat)
        return { error: 'Category not found', status: 404 };
    const maxOrder = database_1.db.prepare('SELECT MAX(sort_order) as max FROM packing_template_items WHERE category_id = ?').get(catId);
    const result = database_1.db.prepare('INSERT INTO packing_template_items (category_id, name, sort_order) VALUES (?, ?, ?)').run(catId, name.trim(), (maxOrder.max ?? -1) + 1);
    return { item: database_1.db.prepare('SELECT * FROM packing_template_items WHERE id = ?').get(result.lastInsertRowid) };
}
function updateTemplateItem(itemId, data) {
    const item = database_1.db.prepare('SELECT * FROM packing_template_items WHERE id = ?').get(itemId);
    if (!item)
        return { error: 'Item not found', status: 404 };
    if (data.name?.trim())
        database_1.db.prepare('UPDATE packing_template_items SET name = ? WHERE id = ?').run(data.name.trim(), itemId);
    return { item: database_1.db.prepare('SELECT * FROM packing_template_items WHERE id = ?').get(itemId) };
}
function deleteTemplateItem(itemId) {
    const item = database_1.db.prepare('SELECT * FROM packing_template_items WHERE id = ?').get(itemId);
    if (!item)
        return { error: 'Item not found', status: 404 };
    database_1.db.prepare('DELETE FROM packing_template_items WHERE id = ?').run(itemId);
    return {};
}
// ── Addons ─────────────────────────────────────────────────────────────────
function isAddonEnabled(addonId) {
    const addon = database_1.db.prepare('SELECT enabled FROM addons WHERE id = ?').get(addonId);
    return !!addon?.enabled;
}
function listAddons() {
    const addons = database_1.db.prepare('SELECT * FROM addons ORDER BY sort_order, id').all();
    const providers = database_1.db.prepare(`
    SELECT id, name, description, icon, enabled, sort_order
    FROM photo_providers
    ORDER BY sort_order, id
  `).all();
    const fields = database_1.db.prepare(`
    SELECT provider_id, field_key, label, input_type, placeholder, required, secret, settings_key, payload_key, sort_order
    FROM photo_provider_fields
    ORDER BY sort_order, id
  `).all();
    const fieldsByProvider = new Map();
    for (const field of fields) {
        const arr = fieldsByProvider.get(field.provider_id) || [];
        arr.push(field);
        fieldsByProvider.set(field.provider_id, arr);
    }
    return [
        ...addons.map(a => ({ ...a, enabled: !!a.enabled, config: JSON.parse(a.config || '{}') })),
        ...providers.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            type: 'photo_provider',
            icon: p.icon,
            enabled: !!p.enabled,
            config: (0, helpersService_1.getPhotoProviderConfig)(p.id),
            fields: (fieldsByProvider.get(p.id) || []).map(f => ({
                key: f.field_key,
                label: f.label,
                input_type: f.input_type,
                placeholder: f.placeholder || '',
                required: !!f.required,
                secret: !!f.secret,
                settings_key: f.settings_key || null,
                payload_key: f.payload_key || null,
                sort_order: f.sort_order,
            })),
            sort_order: p.sort_order,
        })),
    ];
}
function updateAddon(id, data) {
    const addon = database_1.db.prepare('SELECT * FROM addons WHERE id = ?').get(id);
    const provider = database_1.db.prepare('SELECT * FROM photo_providers WHERE id = ?').get(id);
    if (!addon && !provider)
        return { error: 'Addon not found', status: 404 };
    if (addon) {
        if (data.enabled !== undefined)
            database_1.db.prepare('UPDATE addons SET enabled = ? WHERE id = ?').run(data.enabled ? 1 : 0, id);
        if (data.config !== undefined)
            database_1.db.prepare('UPDATE addons SET config = ? WHERE id = ?').run(JSON.stringify(data.config), id);
    }
    else {
        if (data.enabled !== undefined)
            database_1.db.prepare('UPDATE photo_providers SET enabled = ? WHERE id = ?').run(data.enabled ? 1 : 0, id);
    }
    const updatedAddon = database_1.db.prepare('SELECT * FROM addons WHERE id = ?').get(id);
    const updatedProvider = database_1.db.prepare('SELECT * FROM photo_providers WHERE id = ?').get(id);
    const updated = updatedAddon
        ? { ...updatedAddon, enabled: !!updatedAddon.enabled, config: JSON.parse(updatedAddon.config || '{}') }
        : updatedProvider
            ? {
                id: updatedProvider.id,
                name: updatedProvider.name,
                description: updatedProvider.description,
                type: 'photo_provider',
                icon: updatedProvider.icon,
                enabled: !!updatedProvider.enabled,
                config: (0, helpersService_1.getPhotoProviderConfig)(updatedProvider.id),
                sort_order: updatedProvider.sort_order,
            }
            : null;
    return {
        addon: updated,
        auditDetails: { enabled: data.enabled !== undefined ? !!data.enabled : undefined, config_changed: data.config !== undefined },
    };
}
// ── MCP Tokens ─────────────────────────────────────────────────────────────
function listMcpTokens() {
    return database_1.db.prepare(`
    SELECT t.id, t.name, t.token_prefix, t.created_at, t.last_used_at, t.user_id, u.username
    FROM mcp_tokens t
    JOIN users u ON u.id = t.user_id
    ORDER BY t.created_at DESC
  `).all();
}
function deleteMcpToken(id) {
    const token = database_1.db.prepare('SELECT id, user_id FROM mcp_tokens WHERE id = ?').get(id);
    if (!token)
        return { error: 'Token not found', status: 404 };
    database_1.db.prepare('DELETE FROM mcp_tokens WHERE id = ?').run(id);
    (0, mcp_1.revokeUserSessions)(token.user_id);
    return {};
}
// ── OAuth Sessions ─────────────────────────────────────────────────────────
function listOAuthSessions() {
    const rows = database_1.db.prepare(`
    SELECT ot.id, ot.client_id, oc.name AS client_name, ot.user_id, u.username,
           ot.scopes, ot.access_token_expires_at, ot.refresh_token_expires_at, ot.created_at
    FROM oauth_tokens ot
    JOIN oauth_clients oc ON ot.client_id = oc.client_id
    JOIN users u ON u.id = ot.user_id
    WHERE ot.revoked_at IS NULL
      AND ot.refresh_token_expires_at > CURRENT_TIMESTAMP
    ORDER BY ot.created_at DESC
  `).all();
    return rows.map(r => ({ ...r, scopes: JSON.parse(r.scopes) }));
}
function revokeOAuthSession(id) {
    const row = database_1.db.prepare('SELECT id, user_id, client_id FROM oauth_tokens WHERE id = ?').get(id);
    if (!row)
        return { error: 'Session not found', status: 404 };
    database_1.db.prepare('UPDATE oauth_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    (0, mcp_1.revokeUserSessionsForClient)(row.user_id, row.client_id);
    return {};
}
// ── JWT Rotation ───────────────────────────────────────────────────────────
function rotateJwtSecret() {
    const newSecret = crypto_1.default.randomBytes(32).toString('hex');
    const dataDir = path_1.default.resolve(__dirname, '../../data');
    const secretFile = path_1.default.join(dataDir, '.jwt_secret');
    try {
        if (!fs_1.default.existsSync(dataDir))
            fs_1.default.mkdirSync(dataDir, { recursive: true });
        fs_1.default.writeFileSync(secretFile, newSecret, { mode: 0o600 });
    }
    catch (err) {
        return { error: 'Failed to persist new JWT secret to disk', status: 500 };
    }
    (0, config_1.updateJwtSecret)(newSecret);
    return {};
}
