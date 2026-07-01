"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.avatarUrl = void 0;
exports.utcSuffix = utcSuffix;
exports.stripUserForClient = stripUserForClient;
exports.maskKey = maskKey;
exports.mask_stored_api_key = mask_stored_api_key;
exports.resolveAuthToggles = resolveAuthToggles;
exports.isOidcOnlyMode = isOidcOnlyMode;
exports.generateToken = generateToken;
exports.normalizeBackupCode = normalizeBackupCode;
exports.hashBackupCode = hashBackupCode;
exports.hashBackupCodeBcrypt = hashBackupCodeBcrypt;
exports.matchBackupCode = matchBackupCode;
exports.generateBackupCodes = generateBackupCodes;
exports.parseBackupCodeHashes = parseBackupCodeHashes;
exports.getPendingMfaSecret = getPendingMfaSecret;
exports.getAppConfig = getAppConfig;
exports.demoLogin = demoLogin;
exports.validateInviteToken = validateInviteToken;
exports.registerUser = registerUser;
exports.loginUser = loginUser;
exports.getCurrentUser = getCurrentUser;
exports.changePassword = changePassword;
exports.deleteAccount = deleteAccount;
exports.updateMapsKey = updateMapsKey;
exports.updateApiKeys = updateApiKeys;
exports.updateSettings = updateSettings;
exports.getSettings = getSettings;
exports.saveAvatar = saveAvatar;
exports.deleteAvatar = deleteAvatar;
exports.listUsers = listUsers;
exports.validateKeys = validateKeys;
exports.getAppSettings = getAppSettings;
exports.updateAppSettings = updateAppSettings;
exports.getTravelStats = getTravelStats;
exports.setupMfa = setupMfa;
exports.enableMfa = enableMfa;
exports.disableMfa = disableMfa;
exports.verifyMfaLogin = verifyMfaLogin;
exports.requestPasswordReset = requestPasswordReset;
exports.resetPassword = resetPassword;
exports.listMcpTokens = listMcpTokens;
exports.createMcpToken = createMcpToken;
exports.deleteMcpToken = deleteMcpToken;
exports.createWsToken = createWsToken;
exports.createResourceToken = createResourceToken;
exports.isDemoUser = isDemoUser;
exports.verifyMcpToken = verifyMcpToken;
exports.verifyJwtToken = verifyJwtToken;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const otplib_1 = require("otplib");
const qrcode_1 = __importDefault(require("qrcode"));
const crypto_2 = require("crypto");
const database_1 = require("../db/database");
const config_1 = require("../config");
const passwordPolicy_1 = require("./passwordPolicy");
const mfaCrypto_1 = require("./mfaCrypto");
const permissions_1 = require("./permissions");
const apiKeyCrypto_1 = require("./apiKeyCrypto");
const ephemeralTokens_1 = require("./ephemeralTokens");
const mcp_1 = require("../mcp");
const scheduler_1 = require("../scheduler");
const userCleanupService_1 = require("./userCleanupService");
const distanceService_1 = require("./distanceService");
const auth_1 = require("../middleware/auth");
const demo_1 = require("./demo");
const avatarUrl_1 = require("./avatarUrl");
Object.defineProperty(exports, "avatarUrl", { enumerable: true, get: function () { return avatarUrl_1.avatarUrl; } });
const webauthnConfig_1 = require("./webauthnConfig");
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
otplib_1.authenticator.options = { window: 1 };
// bcrypt cost factor for user passwords. Shared by register/changePassword/
// resetPassword and the dummy-hash timing equaliser below — must stay in sync.
const BCRYPT_COST = 12;
// Shape check for email input on register and profile update.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Pre-computed bcrypt hash to equalise timing of "unknown email" and
// "OIDC-only account" branches with the real verification path (CWE-208).
const DUMMY_PASSWORD_HASH = bcryptjs_1.default.hashSync('__memove_no_such_user__', BCRYPT_COST);
const MFA_SETUP_TTL_MS = 15 * 60 * 1000;
const mfaSetupPending = new Map();
const MFA_BACKUP_CODE_COUNT = 10;
const ADMIN_SETTINGS_KEYS = [
    'allow_registration', 'allowed_file_types', 'require_mfa',
    'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_skip_tls_verify',
    'notification_channels', 'admin_webhook_url', 'admin_ntfy_server', 'admin_ntfy_topic', 'admin_ntfy_token',
    'notify_trip_reminder',
    'password_login', 'password_registration', 'oidc_login', 'oidc_registration',
    'passkey_login', 'webauthn_rp_id', 'webauthn_origins',
];
const avatarDir = path_1.default.join(__dirname, '../../uploads/avatars');
if (!fs_1.default.existsSync(avatarDir))
    fs_1.default.mkdirSync(avatarDir, { recursive: true });
const KNOWN_COUNTRIES = new Set([
    'Japan', 'Germany', 'Deutschland', 'France', 'Frankreich', 'Italy', 'Italien', 'Spain', 'Spanien',
    'United States', 'USA', 'United Kingdom', 'UK', 'Thailand', 'Australia', 'Australien',
    'Canada', 'Kanada', 'Mexico', 'Mexiko', 'Brazil', 'Brasilien', 'China', 'India', 'Indien',
    'South Korea', 'Sudkorea', 'Indonesia', 'Indonesien', 'Turkey', 'Turkei', 'Turkiye',
    'Greece', 'Griechenland', 'Portugal', 'Netherlands', 'Niederlande', 'Belgium', 'Belgien',
    'Switzerland', 'Schweiz', 'Austria', 'Osterreich', 'Sweden', 'Schweden', 'Norway', 'Norwegen',
    'Denmark', 'Danemark', 'Finland', 'Finnland', 'Poland', 'Polen', 'Czech Republic', 'Tschechien',
    'Czechia', 'Hungary', 'Ungarn', 'Croatia', 'Kroatien', 'Romania', 'Rumanien',
    'Ireland', 'Irland', 'Iceland', 'Island', 'New Zealand', 'Neuseeland',
    'Singapore', 'Singapur', 'Malaysia', 'Vietnam', 'Philippines', 'Philippinen',
    'Egypt', 'Agypten', 'Morocco', 'Marokko', 'South Africa', 'Sudafrika', 'Kenya', 'Kenia',
    'Argentina', 'Argentinien', 'Chile', 'Colombia', 'Kolumbien', 'Peru',
    'Russia', 'Russland', 'United Arab Emirates', 'UAE', 'Vereinigte Arabische Emirate',
    'Israel', 'Jordan', 'Jordanien', 'Taiwan', 'Hong Kong', 'Hongkong',
    'Cuba', 'Kuba', 'Costa Rica', 'Panama', 'Ecuador', 'Bolivia', 'Bolivien', 'Uruguay', 'Paraguay',
    'Luxembourg', 'Luxemburg', 'Malta', 'Cyprus', 'Zypern', 'Estonia', 'Estland',
    'Latvia', 'Lettland', 'Lithuania', 'Litauen', 'Slovakia', 'Slowakei', 'Slovenia', 'Slowenien',
    'Bulgaria', 'Bulgarien', 'Serbia', 'Serbien', 'Montenegro', 'Albania', 'Albanien',
    'Sri Lanka', 'Nepal', 'Cambodia', 'Kambodscha', 'Laos', 'Myanmar', 'Mongolia', 'Mongolei',
    'Saudi Arabia', 'Saudi-Arabien', 'Qatar', 'Katar', 'Oman', 'Bahrain', 'Kuwait',
    'Tanzania', 'Tansania', 'Ethiopia', 'Athiopien', 'Nigeria', 'Ghana', 'Tunisia', 'Tunesien',
    'Dominican Republic', 'Dominikanische Republik', 'Jamaica', 'Jamaika',
    'Ukraine', 'Georgia', 'Georgien', 'Armenia', 'Armenien', 'Pakistan', 'Bangladesh', 'Bangladesch',
    'Senegal', 'Mozambique', 'Mosambik', 'Moldova', 'Moldawien', 'Belarus', 'Weissrussland',
]);
// ---------------------------------------------------------------------------
// Helpers (exported for route-level use where needed)
// ---------------------------------------------------------------------------
function utcSuffix(ts) {
    if (!ts)
        return null;
    return ts.endsWith('Z') ? ts : ts.replace(' ', 'T') + 'Z';
}
function stripUserForClient(user) {
    const { password_hash: _p, maps_api_key: _m, openweather_api_key: _o, unsplash_api_key: _u, mfa_secret: _mf, mfa_backup_codes: _mbc, ...rest } = user;
    return {
        ...rest,
        created_at: utcSuffix(rest.created_at),
        updated_at: utcSuffix(rest.updated_at),
        last_login: utcSuffix(rest.last_login),
        mfa_enabled: !!(user.mfa_enabled === 1 || user.mfa_enabled === true),
        must_change_password: !!(user.must_change_password === 1 || user.must_change_password === true),
    };
}
function maskKey(key) {
    if (!key)
        return null;
    if (key.length <= 8)
        return '--------';
    return '----' + key.slice(-4);
}
function mask_stored_api_key(key) {
    const plain = (0, apiKeyCrypto_1.decrypt_api_key)(key);
    return maskKey(plain);
}
function resolveAuthToggles() {
    const get = (key) => database_1.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key)?.value ?? null;
    // Passkey login is independent of the password/OIDC "new keys" probe, so it
    // must be resolved OUTSIDE the branch below — otherwise on a fresh install
    // that never touched the password/OIDC toggles it would silently read false
    // even after an admin enabled it. Default OFF (opt-in).
    const passkey_login = get('passkey_login') === 'true';
    const hasNewKeys = ['password_login', 'password_registration', 'oidc_login', 'oidc_registration']
        .some(k => get(k) !== null);
    if (hasNewKeys) {
        const result = {
            password_login: get('password_login') !== 'false',
            password_registration: get('password_registration') !== 'false',
            oidc_login: get('oidc_login') !== 'false',
            oidc_registration: get('oidc_registration') !== 'false',
            passkey_login,
        };
        if (process.env.OIDC_ONLY?.toLowerCase() === 'true') {
            result.password_login = false;
            result.password_registration = false;
        }
        return result;
    }
    // Legacy fallback
    const oidcOnlyEnabled = process.env.OIDC_ONLY?.toLowerCase() === 'true' || get('oidc_only') === 'true';
    const oidcConfigured = !!((process.env.OIDC_ISSUER || get('oidc_issuer')) &&
        (process.env.OIDC_CLIENT_ID || get('oidc_client_id')));
    const oidcOnly = oidcOnlyEnabled && oidcConfigured;
    const allowReg = (get('allow_registration') ?? 'true') === 'true';
    return {
        password_login: !oidcOnly,
        password_registration: !oidcOnly && allowReg,
        oidc_login: true,
        oidc_registration: allowReg,
        passkey_login,
    };
}
function isOidcOnlyMode() {
    return !resolveAuthToggles().password_login;
}
function generateToken(user, rememberMe = false) {
    const pv = typeof user.password_version === 'number'
        ? user.password_version
        : (database_1.db.prepare('SELECT password_version FROM users WHERE id = ?').get(user.id)?.password_version ?? 0);
    // "Remember me" extends the JWT lifetime to match the persistent cookie maxAge;
    // the cookie service decides session-vs-persistent off the same flag.
    const expiresIn = rememberMe ? config_1.SESSION_DURATION_REMEMBER_SECONDS : config_1.SESSION_DURATION_SECONDS;
    return jsonwebtoken_1.default.sign({ id: user.id, pv }, config_1.JWT_SECRET, { expiresIn, algorithm: 'HS256' });
}
// ---------------------------------------------------------------------------
// MFA helpers
// ---------------------------------------------------------------------------
function normalizeBackupCode(input) {
    return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
// Legacy SHA-256 hex hash. Kept so existing stored hashes (from before
// the bcrypt migration) can still be verified in `matchBackupCode`
// without forcing every user to re-enrol their MFA device. New hashes
// are produced by `hashBackupCodeBcrypt` below.
function hashBackupCode(input) {
    return crypto_1.default.createHash('sha256').update(normalizeBackupCode(input)).digest('hex');
}
const BCRYPT_BACKUP_COST = 10;
/**
 * Hash a backup code with bcrypt for at-rest storage. Backup codes only
 * have ~40 bits of entropy (8 hex chars) so a plain SHA-256 rainbow
 * table cracks them in minutes if the DB ever leaks. bcrypt with a
 * moderate cost raises that cost by ~3-4 orders of magnitude.
 */
function hashBackupCodeBcrypt(input) {
    return bcryptjs_1.default.hashSync(normalizeBackupCode(input), BCRYPT_BACKUP_COST);
}
/**
 * Constant-time match of a plaintext backup code against a stored hash
 * in either format (bcrypt or legacy SHA-256 hex). Used by login and
 * password-reset flows; callers that need to CONSUME the matching
 * entry should use this to find the index, then splice it out.
 */
function matchBackupCode(plaintext, storedHash) {
    if (!storedHash)
        return false;
    if (storedHash.startsWith('$2')) {
        // bcrypt hash — compareSync is constant-time internally.
        try {
            return bcryptjs_1.default.compareSync(normalizeBackupCode(plaintext), storedHash);
        }
        catch {
            return false;
        }
    }
    // Legacy SHA-256 hex. Compare the SHA-256 of the input against the
    // stored hex with a constant-time comparator so timing can't leak.
    const candidate = hashBackupCode(plaintext);
    if (candidate.length !== storedHash.length)
        return false;
    return crypto_1.default.timingSafeEqual(Buffer.from(candidate), Buffer.from(storedHash));
}
function generateBackupCodes(count = MFA_BACKUP_CODE_COUNT) {
    const codes = [];
    while (codes.length < count) {
        const raw = crypto_1.default.randomBytes(4).toString('hex').toUpperCase();
        const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
        if (!codes.includes(code))
            codes.push(code);
    }
    return codes;
}
function parseBackupCodeHashes(raw) {
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(v => typeof v === 'string') : [];
    }
    catch {
        return [];
    }
}
function getPendingMfaSecret(userId) {
    const row = mfaSetupPending.get(userId);
    if (!row || Date.now() > row.exp) {
        mfaSetupPending.delete(userId);
        return null;
    }
    return row.secret;
}
// ---------------------------------------------------------------------------
// App config (public)
// ---------------------------------------------------------------------------
function getAppConfig(authenticatedUser) {
    const userCount = database_1.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const isDemo = process.env.DEMO_MODE?.toLowerCase() === 'true';
    const toggles = resolveAuthToggles();
    const version = process.env.APP_VERSION ?? require('../../package.json').version;
    const hasGoogleKey = !!database_1.db.prepare("SELECT maps_api_key FROM users WHERE role = 'admin' AND maps_api_key IS NOT NULL AND maps_api_key != '' LIMIT 1").get();
    const oidcDisplayName = process.env.OIDC_DISPLAY_NAME ||
        database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'oidc_display_name'").get()?.value || null;
    const oidcConfigured = !!((process.env.OIDC_ISSUER || database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'oidc_issuer'").get()?.value) &&
        (process.env.OIDC_CLIENT_ID || database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'oidc_client_id'").get()?.value));
    const requireMfaRow = database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'require_mfa'").get();
    const notifChannel = database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'notification_channel'").get()?.value || 'none';
    const tripReminderSetting = database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'notify_trip_reminder'").get()?.value;
    const hasSmtpHost = !!(process.env.SMTP_HOST || database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'smtp_host'").get()?.value);
    const notifChannelsRaw = database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'notification_channels'").get()?.value || notifChannel;
    const activeChannels = notifChannelsRaw === 'none' ? [] : notifChannelsRaw.split(',').map((c) => c.trim()).filter(Boolean);
    const hasWebhookEnabled = activeChannels.includes('webhook');
    const tripRemindersEnabled = tripReminderSetting !== 'false';
    const placesPhotosSetting = database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'places_photos_enabled'").get()?.value;
    const placesPhotosEnabled = placesPhotosSetting !== 'false';
    const placesAutocompleteSetting = database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'places_autocomplete_enabled'").get()?.value;
    const placesAutocompleteEnabled = placesAutocompleteSetting !== 'false';
    const placesDetailsSetting = database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'places_details_enabled'").get()?.value;
    const placesDetailsEnabled = placesDetailsSetting !== 'false';
    const setupComplete = userCount > 0 && !(database_1.db.prepare("SELECT id FROM users WHERE role = 'admin' AND must_change_password = 1 LIMIT 1").get());
    return {
        // Legacy fields (backward compat)
        allow_registration: isDemo ? false : (toggles.password_registration || toggles.oidc_registration),
        oidc_only_mode: !toggles.password_login && !toggles.password_registration,
        // Granular toggles
        password_login: toggles.password_login,
        password_registration: isDemo ? false : toggles.password_registration,
        oidc_login: toggles.oidc_login,
        oidc_registration: isDemo ? false : toggles.oidc_registration,
        // Passkey login: the instance toggle + whether a usable RP ID resolves for
        // this deployment. The login page shows the passkey button only when both
        // are true. `passkey_configured` stays a pure boolean — it never leaks the
        // resolved RP ID / origin / APP_URL on this unauthenticated endpoint.
        passkey_login: toggles.passkey_login,
        passkey_configured: (0, webauthnConfig_1.isPasskeyConfigured)(),
        env_override_oidc_only: process.env.OIDC_ONLY === 'true',
        has_users: userCount > 0,
        setup_complete: setupComplete,
        version,
        is_prerelease: version.includes('-pre.'),
        has_maps_key: hasGoogleKey,
        oidc_configured: oidcConfigured,
        oidc_display_name: oidcConfigured ? (oidcDisplayName || 'SSO') : undefined,
        require_mfa: requireMfaRow?.value === 'true',
        allowed_file_types: database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'allowed_file_types'").get()?.value || 'jpg,jpeg,png,gif,webp,heic,pdf,doc,docx,xls,xlsx,txt,csv',
        demo_mode: isDemo,
        demo_email: isDemo ? demo_1.DEMO_EMAIL_PRIMARY : undefined,
        demo_password: isDemo ? 'demo12345' : undefined,
        timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        notification_channel: notifChannel,
        notification_channels: activeChannels,
        available_channels: { email: hasSmtpHost, webhook: hasWebhookEnabled, inapp: true },
        trip_reminders_enabled: tripRemindersEnabled,
        places_photos_enabled: placesPhotosEnabled,
        places_autocomplete_enabled: placesAutocompleteEnabled,
        places_details_enabled: placesDetailsEnabled,
        permissions: authenticatedUser ? (0, permissions_1.getAllPermissions)() : undefined,
        dev_mode: process.env.NODE_ENV === 'development',
    };
}
// ---------------------------------------------------------------------------
// Auth: register, login, demo
// ---------------------------------------------------------------------------
function demoLogin() {
    if (process.env.DEMO_MODE !== 'true') {
        return { error: 'Not found', status: 404 };
    }
    const user = database_1.db.prepare('SELECT * FROM users WHERE email = ?').get(demo_1.DEMO_EMAIL_PRIMARY);
    if (!user)
        return { error: 'Demo user not found', status: 500 };
    const token = generateToken(user);
    const safe = stripUserForClient(user);
    return { token, user: { ...safe, avatar_url: (0, avatarUrl_1.avatarUrl)(user) } };
}
function validateInviteToken(token) {
    const invite = database_1.db.prepare('SELECT * FROM invite_tokens WHERE token = ?').get(token);
    if (!invite)
        return { error: 'Invalid invite link', status: 404 };
    if (invite.max_uses > 0 && invite.used_count >= invite.max_uses)
        return { error: 'Invite link has been fully used', status: 410 };
    if (invite.expires_at && new Date(invite.expires_at) < new Date())
        return { error: 'Invite link has expired', status: 410 };
    return { valid: true, max_uses: invite.max_uses, used_count: invite.used_count, expires_at: invite.expires_at };
}
function registerUser(body) {
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const { password, invite_token } = body;
    const userCount = database_1.db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    let validInvite = null;
    if (invite_token) {
        validInvite = database_1.db.prepare('SELECT * FROM invite_tokens WHERE token = ?').get(invite_token);
        if (!validInvite)
            return { error: 'Invalid invite link', status: 400 };
        if (validInvite.max_uses > 0 && validInvite.used_count >= validInvite.max_uses)
            return { error: 'Invite link has been fully used', status: 410 };
        if (validInvite.expires_at && new Date(validInvite.expires_at) < new Date())
            return { error: 'Invite link has expired', status: 410 };
    }
    if (userCount > 0 && !validInvite) {
        const toggles = resolveAuthToggles();
        if (!toggles.password_registration) {
            return { error: 'Password registration is disabled. Contact your administrator.', status: 403 };
        }
    }
    if (!username || !email || !password) {
        return { error: 'Username, email and password are required', status: 400 };
    }
    const pwCheck = (0, passwordPolicy_1.validatePassword)(password);
    if (!pwCheck.ok)
        return { error: pwCheck.reason, status: 400 };
    if (!EMAIL_REGEX.test(email)) {
        return { error: 'Invalid email format', status: 400 };
    }
    const existingUser = database_1.db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)').get(email, username);
    if (existingUser) {
        return { error: 'Registration failed. Please try different credentials.', status: 409 };
    }
    const password_hash = bcryptjs_1.default.hashSync(password, BCRYPT_COST);
    const isFirstUser = userCount === 0;
    const role = isFirstUser ? 'admin' : 'user';
    try {
        const result = database_1.db.prepare('INSERT INTO users (username, email, password_hash, role, first_seen_version, login_count) VALUES (?, ?, ?, ?, ?, 0)').run(username, email, password_hash, role, process.env.APP_VERSION || '0.0.0');
        const user = { id: result.lastInsertRowid, username, email, role, avatar: null, mfa_enabled: false };
        const token = generateToken(user);
        if (validInvite) {
            const updated = database_1.db.prepare('UPDATE invite_tokens SET used_count = used_count + 1 WHERE id = ? AND (max_uses = 0 OR used_count < max_uses) RETURNING used_count').get(validInvite.id);
            if (!updated) {
                console.warn(`[Auth] Invite token ${validInvite.token.slice(0, 8)}... exceeded max_uses due to race condition`);
            }
        }
        return {
            token,
            user: { ...user, avatar_url: null },
            auditUserId: Number(result.lastInsertRowid),
            auditDetails: { username, email, role },
        };
    }
    catch {
        return { error: 'Error creating user', status: 500 };
    }
}
function loginUser(body) {
    if (isOidcOnlyMode()) {
        return { error: 'Password authentication is disabled. Please sign in with SSO.', status: 403 };
    }
    const { email, password, remember_me } = body;
    const remember = remember_me === true;
    if (!email || !password) {
        return { error: 'Email and password are required', status: 400 };
    }
    const user = database_1.db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
    // Always run bcrypt — even for unknown/OIDC-only users — so response time
    // does not reveal whether the email exists in the database (CWE-203/208).
    const hashToCheck = user?.password_hash ?? DUMMY_PASSWORD_HASH;
    const validPassword = bcryptjs_1.default.compareSync(password, hashToCheck);
    if (!user) {
        return {
            error: 'Invalid email or password', status: 401,
            auditUserId: null, auditAction: 'user.login_failed', auditDetails: { email, reason: 'unknown_email' },
        };
    }
    if (!user.password_hash) {
        return {
            error: 'Invalid email or password', status: 401,
            auditUserId: Number(user.id), auditAction: 'user.login_failed', auditDetails: { email, reason: 'oidc_only' },
        };
    }
    if (!validPassword) {
        return {
            error: 'Invalid email or password', status: 401,
            auditUserId: Number(user.id), auditAction: 'user.login_failed', auditDetails: { email, reason: 'wrong_password' },
        };
    }
    if (user.mfa_enabled === 1 || user.mfa_enabled === true) {
        const pv = user.password_version ?? 0;
        const mfa_token = jsonwebtoken_1.default.sign({ id: Number(user.id), purpose: 'mfa_login', pv }, config_1.JWT_SECRET, { expiresIn: '5m', algorithm: 'HS256' });
        return { mfa_required: true, mfa_token };
    }
    database_1.db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP, login_count = login_count + 1 WHERE id = ?').run(user.id);
    const token = generateToken(user, remember);
    const userSafe = stripUserForClient(user);
    return {
        token,
        user: { ...userSafe, avatar_url: (0, avatarUrl_1.avatarUrl)(user) },
        remember,
        auditUserId: Number(user.id),
        auditAction: 'user.login',
        auditDetails: { email },
    };
}
// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------
function getCurrentUser(userId) {
    const user = database_1.db.prepare('SELECT id, username, email, role, avatar, oidc_issuer, created_at, mfa_enabled, must_change_password FROM users WHERE id = ?').get(userId);
    if (!user)
        return null;
    const base = stripUserForClient(user);
    return { ...base, id: user.id, username: user.username, email: user.email, role: user.role, avatar_url: (0, avatarUrl_1.avatarUrl)(user) };
}
// ---------------------------------------------------------------------------
// Password & account
// ---------------------------------------------------------------------------
function changePassword(userId, userEmail, body) {
    if (isOidcOnlyMode()) {
        return { error: 'Password authentication is disabled.', status: 403 };
    }
    if (process.env.DEMO_MODE === 'true' && (0, demo_1.isDemoEmail)(userEmail)) {
        return { error: 'Password change is disabled in demo mode.', status: 403 };
    }
    const { current_password, new_password } = body;
    if (!current_password)
        return { error: 'Current password is required', status: 400 };
    if (!new_password)
        return { error: 'New password is required', status: 400 };
    const pwCheck = (0, passwordPolicy_1.validatePassword)(new_password);
    if (!pwCheck.ok)
        return { error: pwCheck.reason, status: 400 };
    const user = database_1.db.prepare('SELECT password_hash, password_version FROM users WHERE id = ?').get(userId);
    if (!user || !bcryptjs_1.default.compareSync(current_password, user.password_hash)) {
        return { error: 'Current password is incorrect', status: 401 };
    }
    const hash = bcryptjs_1.default.hashSync(new_password, BCRYPT_COST);
    const newPv = (user.password_version ?? 0) + 1;
    database_1.db.transaction(() => {
        database_1.db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, password_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, newPv, userId);
        // A password change rotates the user's sessions: bumping password_version
        // invalidates existing JWT cookie sessions, and the separate MCP static
        // token and OAuth bearer-token stores are pruned to match (same set the
        // password-reset path already revokes).
        database_1.db.prepare('DELETE FROM mcp_tokens WHERE user_id = ?').run(userId);
        try {
            database_1.db.prepare("UPDATE oauth_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL").run(userId);
        }
        catch { /* oauth_tokens table may not exist in very old installs */ }
    })();
    try {
        (0, mcp_1.revokeUserSessions)?.(userId);
    }
    catch { /* best-effort */ }
    // Re-issue a session bound to the new password_version so the current device
    // stays logged in while other existing sessions are rotated out by the pv gate.
    const token = generateToken({ id: userId, password_version: newPv });
    return { success: true, token };
}
function deleteAccount(userId, userEmail, userRole) {
    if (process.env.DEMO_MODE === 'true' && (0, demo_1.isDemoEmail)(userEmail)) {
        return { error: 'Account deletion is disabled in demo mode.', status: 403 };
    }
    if (userRole === 'admin') {
        const adminCount = database_1.db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
        if (adminCount <= 1) {
            return { error: 'Cannot delete the last admin account', status: 400 };
        }
    }
    (0, userCleanupService_1.deleteUserCompletely)(userId);
    return { success: true };
}
// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------
function updateMapsKey(userId, maps_api_key) {
    database_1.db.prepare('UPDATE users SET maps_api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run((0, apiKeyCrypto_1.maybe_encrypt_api_key)(maps_api_key), userId);
    return { success: true, maps_api_key: mask_stored_api_key(maps_api_key) };
}
function updateApiKeys(userId, body) {
    const current = database_1.db.prepare('SELECT maps_api_key, openweather_api_key FROM users WHERE id = ?').get(userId);
    database_1.db.prepare('UPDATE users SET maps_api_key = ?, openweather_api_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(body.maps_api_key !== undefined ? (0, apiKeyCrypto_1.maybe_encrypt_api_key)(body.maps_api_key) : current.maps_api_key, body.openweather_api_key !== undefined ? (0, apiKeyCrypto_1.maybe_encrypt_api_key)(body.openweather_api_key) : current.openweather_api_key, userId);
    const updated = database_1.db.prepare('SELECT id, username, email, role, maps_api_key, openweather_api_key, avatar, mfa_enabled FROM users WHERE id = ?').get(userId);
    const u = updated ? { ...updated, mfa_enabled: !!(updated.mfa_enabled === 1 || updated.mfa_enabled === true) } : undefined;
    return {
        success: true,
        user: { ...u, maps_api_key: mask_stored_api_key(u?.maps_api_key), openweather_api_key: mask_stored_api_key(u?.openweather_api_key), avatar_url: (0, avatarUrl_1.avatarUrl)(updated || {}) },
    };
}
function updateSettings(userId, body) {
    const { maps_api_key, openweather_api_key, username, email } = body;
    if (username !== undefined) {
        const trimmed = username.trim();
        if (!trimmed || trimmed.length < 2 || trimmed.length > 50) {
            return { error: 'Username must be between 2 and 50 characters', status: 400 };
        }
        if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) {
            return { error: 'Username can only contain letters, numbers, underscores, dots and hyphens', status: 400 };
        }
        const conflict = database_1.db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?').get(trimmed, userId);
        if (conflict)
            return { error: 'Username already taken', status: 409 };
    }
    if (email !== undefined) {
        const trimmed = email.trim();
        if (!trimmed || !EMAIL_REGEX.test(trimmed)) {
            return { error: 'Invalid email format', status: 400 };
        }
        const conflict = database_1.db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?').get(trimmed, userId);
        if (conflict)
            return { error: 'Email already taken', status: 409 };
    }
    const updates = [];
    const params = [];
    if (maps_api_key !== undefined) {
        updates.push('maps_api_key = ?');
        params.push((0, apiKeyCrypto_1.maybe_encrypt_api_key)(maps_api_key));
    }
    if (openweather_api_key !== undefined) {
        updates.push('openweather_api_key = ?');
        params.push((0, apiKeyCrypto_1.maybe_encrypt_api_key)(openweather_api_key));
    }
    if (username !== undefined) {
        updates.push('username = ?');
        params.push(username.trim());
    }
    if (email !== undefined) {
        updates.push('email = ?');
        params.push(email.trim());
    }
    if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(userId);
        database_1.db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    const updated = database_1.db.prepare('SELECT id, username, email, role, maps_api_key, openweather_api_key, avatar, mfa_enabled FROM users WHERE id = ?').get(userId);
    const u = updated ? { ...updated, mfa_enabled: !!(updated.mfa_enabled === 1 || updated.mfa_enabled === true) } : undefined;
    return {
        success: true,
        user: { ...u, maps_api_key: mask_stored_api_key(u?.maps_api_key), openweather_api_key: mask_stored_api_key(u?.openweather_api_key), avatar_url: (0, avatarUrl_1.avatarUrl)(updated || {}) },
    };
}
function getSettings(userId) {
    const user = database_1.db.prepare('SELECT role, maps_api_key, openweather_api_key FROM users WHERE id = ?').get(userId);
    if (user?.role !== 'admin')
        return { error: 'Admin access required', status: 403 };
    return {
        settings: {
            maps_api_key: (0, apiKeyCrypto_1.decrypt_api_key)(user.maps_api_key),
            openweather_api_key: (0, apiKeyCrypto_1.decrypt_api_key)(user.openweather_api_key),
        },
    };
}
// ---------------------------------------------------------------------------
// Avatar
// ---------------------------------------------------------------------------
async function saveAvatar(userId, filename) {
    const current = database_1.db.prepare('SELECT avatar FROM users WHERE id = ?').get(userId);
    if (current && current.avatar) {
        // Fire-and-forget: leftover files are harmless; the DB update is
        // the source of truth for which avatar is current.
        const oldPath = path_1.default.join(avatarDir, current.avatar);
        await fs_1.default.promises.rm(oldPath, { force: true }).catch(() => { });
    }
    database_1.db.prepare('UPDATE users SET avatar = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(filename, userId);
    const updated = database_1.db.prepare('SELECT id, username, email, role, avatar FROM users WHERE id = ?').get(userId);
    return { success: true, avatar_url: (0, avatarUrl_1.avatarUrl)(updated || {}) };
}
async function deleteAvatar(userId) {
    const current = database_1.db.prepare('SELECT avatar FROM users WHERE id = ?').get(userId);
    if (current && current.avatar) {
        const filePath = path_1.default.join(avatarDir, current.avatar);
        await fs_1.default.promises.rm(filePath, { force: true }).catch(() => { });
    }
    database_1.db.prepare('UPDATE users SET avatar = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    return { success: true };
}
// ---------------------------------------------------------------------------
// User directory
// ---------------------------------------------------------------------------
function listUsers(excludeUserId) {
    const users = database_1.db.prepare('SELECT id, username, avatar FROM users WHERE id != ? ORDER BY username ASC').all(excludeUserId);
    return users.map(u => ({ ...u, avatar_url: (0, avatarUrl_1.avatarUrl)(u) }));
}
// ---------------------------------------------------------------------------
// Key validation
// ---------------------------------------------------------------------------
async function validateKeys(userId) {
    const user = database_1.db.prepare('SELECT role, maps_api_key, openweather_api_key FROM users WHERE id = ?').get(userId);
    if (user?.role !== 'admin')
        return { error: 'Admin access required', status: 403, maps: false, weather: false, maps_details: null };
    const result = { maps: false, weather: false, maps_details: null };
    const maps_api_key = (0, apiKeyCrypto_1.decrypt_api_key)(user.maps_api_key);
    if (maps_api_key) {
        try {
            const mapsRes = await fetch(`https://places.googleapis.com/v1/places:searchText`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': maps_api_key,
                    'X-Goog-FieldMask': 'places.displayName',
                },
                body: JSON.stringify({ textQuery: 'test' }),
            });
            result.maps = mapsRes.status === 200;
            let error_text = null;
            let error_json = null;
            if (!result.maps) {
                try {
                    error_text = await mapsRes.text();
                    try {
                        error_json = JSON.parse(error_text);
                    }
                    catch {
                        error_json = null;
                    }
                }
                catch {
                    error_text = null;
                    error_json = null;
                }
            }
            result.maps_details = {
                ok: result.maps,
                status: mapsRes.status,
                status_text: mapsRes.statusText || null,
                error_message: error_json?.error?.message || null,
                error_status: error_json?.error?.status || null,
                error_raw: error_text,
            };
        }
        catch (err) {
            result.maps = false;
            result.maps_details = {
                ok: false,
                status: null,
                status_text: null,
                error_message: err instanceof Error ? err.message : 'Request failed',
                error_status: 'FETCH_ERROR',
                error_raw: null,
            };
        }
    }
    const openweather_api_key = (0, apiKeyCrypto_1.decrypt_api_key)(user.openweather_api_key);
    if (openweather_api_key) {
        try {
            const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=London&appid=${openweather_api_key}`);
            result.weather = weatherRes.status === 200;
        }
        catch {
            result.weather = false;
        }
    }
    return result;
}
// ---------------------------------------------------------------------------
// Admin settings
// ---------------------------------------------------------------------------
function getAppSettings(userId) {
    const user = database_1.db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
    if (user?.role !== 'admin')
        return { error: 'Admin access required', status: 403 };
    const result = {};
    for (const key of ADMIN_SETTINGS_KEYS) {
        const row = database_1.db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
        if (row)
            result[key] = (key === 'smtp_pass' || key === 'admin_webhook_url' || key === 'admin_ntfy_token') ? '••••••••' : row.value;
    }
    return { data: result };
}
function updateAppSettings(userId, body) {
    const user = database_1.db.prepare('SELECT role FROM users WHERE id = ?').get(userId);
    if (user?.role !== 'admin')
        return { error: 'Admin access required', status: 403 };
    const { require_mfa } = body;
    if (require_mfa === true || require_mfa === 'true') {
        const adminMfa = database_1.db.prepare('SELECT mfa_enabled FROM users WHERE id = ?').get(userId);
        // A user-verified passkey satisfies the MFA policy, so an admin who secured
        // their own account with a passkey may enable it too (not only TOTP).
        const adminHasPasskey = !!database_1.db.prepare('SELECT 1 FROM webauthn_credentials WHERE user_id = ? LIMIT 1').get(userId);
        if (!(adminMfa?.mfa_enabled === 1) && !adminHasPasskey) {
            return {
                error: 'Secure your own account with two-factor authentication or a passkey before requiring it for all users.',
                status: 400,
            };
        }
    }
    // Lockout prevention: can't disable all login methods
    if (body.password_login !== undefined || body.oidc_login !== undefined) {
        const current = resolveAuthToggles();
        const oidcConfigured = !!((process.env.OIDC_ISSUER || database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'oidc_issuer'").get()?.value) &&
            (process.env.OIDC_CLIENT_ID || database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'oidc_client_id'").get()?.value));
        const nextPasswordLogin = body.password_login !== undefined ? (String(body.password_login) === 'true') : current.password_login;
        const nextOidcLogin = body.oidc_login !== undefined ? (String(body.oidc_login) === 'true') : current.oidc_login;
        if (!nextPasswordLogin && (!nextOidcLogin || !oidcConfigured)) {
            return { error: 'Cannot disable all login methods. At least one must remain enabled.', status: 400 };
        }
    }
    for (const key of ADMIN_SETTINGS_KEYS) {
        if (body[key] !== undefined) {
            let val = String(body[key]);
            if (key === 'require_mfa') {
                val = body[key] === true || val === 'true' ? 'true' : 'false';
            }
            if (key === 'smtp_pass' && val === '••••••••')
                continue;
            if (key === 'smtp_pass')
                val = (0, apiKeyCrypto_1.encrypt_api_key)(val);
            if (key === 'admin_webhook_url' && val === '••••••••')
                continue;
            if (key === 'admin_webhook_url' && val)
                val = (0, apiKeyCrypto_1.maybe_encrypt_api_key)(val) ?? val;
            if (key === 'admin_ntfy_token' && val === '••••••••')
                continue;
            if (key === 'admin_ntfy_token' && val)
                val = (0, apiKeyCrypto_1.maybe_encrypt_api_key)(val) ?? val;
            database_1.db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)").run(key, val);
        }
    }
    const changedKeys = ADMIN_SETTINGS_KEYS.filter(k => body[k] !== undefined && !(k === 'smtp_pass' && String(body[k]) === '••••••••'));
    const summary = {};
    const smtpChanged = changedKeys.some(k => k.startsWith('smtp_'));
    if (changedKeys.includes('notification_channels'))
        summary.notification_channels = body.notification_channels;
    if (changedKeys.includes('admin_webhook_url'))
        summary.admin_webhook_url_updated = true;
    if (changedKeys.some(k => k.startsWith('admin_ntfy_')))
        summary.admin_ntfy_updated = true;
    if (smtpChanged)
        summary.smtp_settings_updated = true;
    if (changedKeys.includes('allow_registration'))
        summary.allow_registration = body.allow_registration;
    if (changedKeys.includes('allowed_file_types'))
        summary.allowed_file_types_updated = true;
    if (changedKeys.includes('require_mfa'))
        summary.require_mfa = body.require_mfa;
    const debugDetails = {};
    for (const k of changedKeys) {
        debugDetails[k] = k === 'smtp_pass' ? '***' : body[k];
    }
    const notifRelated = ['notification_channels', 'smtp_host'];
    const shouldRestartScheduler = changedKeys.some(k => notifRelated.includes(k));
    if (shouldRestartScheduler) {
        (0, scheduler_1.startTripReminders)();
    }
    return { success: true, auditSummary: summary, auditDebugDetails: debugDetails, shouldRestartScheduler };
}
// ---------------------------------------------------------------------------
// Travel stats
// ---------------------------------------------------------------------------
function getTravelStats(userId) {
    const places = database_1.db.prepare(`
    SELECT DISTINCT p.address, p.lat, p.lng
    FROM places p
    JOIN trips t ON p.trip_id = t.id
    LEFT JOIN trip_members tm ON t.id = tm.trip_id
    WHERE t.user_id = ? OR tm.user_id = ?
  `).all(userId, userId);
    // Archived trips still count here, matching the places, countries and flight
    // distance widgets (which never filtered on is_archived) so the dashboard stats
    // stay consistent — archiving a trip no longer zeroes out trips/days.
    const tripStats = database_1.db.prepare(`
    SELECT COUNT(DISTINCT t.id) as trips,
           COUNT(DISTINCT d.id) as days
    FROM trips t
    LEFT JOIN days d ON d.trip_id = t.id
    LEFT JOIN trip_members tm ON t.id = tm.trip_id
    WHERE (t.user_id = ? OR tm.user_id = ?)
  `).get(userId, userId);
    const cities = new Set();
    const coords = [];
    places.forEach(p => {
        if (p.lat && p.lng)
            coords.push({ lat: p.lat, lng: p.lng });
        if (p.address) {
            const parts = p.address.split(',').map(s => s.trim().replace(/\d{3,}/g, '').trim());
            const cityPart = parts.find(s => !KNOWN_COUNTRIES.has(s) && /^[A-Za-z\u00C0-\u00FF\s-]{2,}$/.test(s));
            if (cityPart)
                cities.add(cityPart);
        }
    });
    // Visited countries \u2014 same source the Atlas page uses: ISO-2 codes from
    // auto-resolved place regions plus countries the user marked manually.
    const countryCodes = new Set();
    const manualCountries = database_1.db.prepare('SELECT country_code FROM visited_countries WHERE user_id = ?').all(userId);
    manualCountries.forEach(m => { if (m.country_code)
        countryCodes.add(m.country_code.toUpperCase()); });
    const placeRegionCodes = database_1.db.prepare(`
    SELECT DISTINCT pr.country_code
    FROM place_regions pr
    JOIN places p ON p.id = pr.place_id
    JOIN trips t ON p.trip_id = t.id
    LEFT JOIN trip_members tm ON t.id = tm.trip_id
    WHERE (t.user_id = ? OR tm.user_id = ?) AND pr.country_code IS NOT NULL
  `).all(userId, userId);
    placeRegionCodes.forEach(r => { if (r.country_code)
        countryCodes.add(r.country_code.toUpperCase()); });
    return {
        countries: [...countryCodes],
        cities: [...cities],
        coords,
        totalTrips: tripStats?.trips || 0,
        totalDays: tripStats?.days || 0,
        totalPlaces: places.length,
        totalDistanceKm: (0, distanceService_1.getFlightDistanceKm)(userId),
    };
}
// ---------------------------------------------------------------------------
// MFA
// ---------------------------------------------------------------------------
function setupMfa(userId, userEmail) {
    if (process.env.DEMO_MODE === 'true' && (0, demo_1.isDemoEmail)(userEmail)) {
        return { error: 'MFA is not available in demo mode.', status: 403 };
    }
    const row = database_1.db.prepare('SELECT mfa_enabled FROM users WHERE id = ?').get(userId);
    if (row?.mfa_enabled) {
        return { error: 'MFA is already enabled', status: 400 };
    }
    let secret, otpauth_url;
    try {
        secret = otplib_1.authenticator.generateSecret();
        mfaSetupPending.set(userId, { secret, exp: Date.now() + MFA_SETUP_TTL_MS });
        otpauth_url = otplib_1.authenticator.keyuri(userEmail, 'memove', secret);
    }
    catch (err) {
        console.error('[MFA] Setup error:', err);
        return { error: 'MFA setup failed', status: 500 };
    }
    return { secret, otpauth_url, qrPromise: qrcode_1.default.toString(otpauth_url, { type: 'svg', width: 250 }) };
}
function enableMfa(userId, code) {
    if (!code) {
        return { error: 'Verification code is required', status: 400 };
    }
    const pending = getPendingMfaSecret(userId);
    if (!pending) {
        return { error: 'No MFA setup in progress. Start the setup again.', status: 400 };
    }
    const tokenStr = String(code).replace(/\s/g, '');
    const ok = otplib_1.authenticator.verify({ token: tokenStr, secret: pending });
    if (!ok) {
        return { error: 'Invalid verification code', status: 401 };
    }
    const backupCodes = generateBackupCodes();
    const backupHashes = backupCodes.map(hashBackupCodeBcrypt);
    const enc = (0, mfaCrypto_1.encryptMfaSecret)(pending);
    database_1.db.prepare('UPDATE users SET mfa_enabled = 1, mfa_secret = ?, mfa_backup_codes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(enc, JSON.stringify(backupHashes), userId);
    mfaSetupPending.delete(userId);
    return { success: true, mfa_enabled: true, backup_codes: backupCodes };
}
function disableMfa(userId, userEmail, body) {
    if (process.env.DEMO_MODE === 'true' && (0, demo_1.isDemoEmail)(userEmail)) {
        return { error: 'MFA cannot be changed in demo mode.', status: 403 };
    }
    const policy = database_1.db.prepare("SELECT value FROM app_settings WHERE key = 'require_mfa'").get();
    if (policy?.value === 'true') {
        return { error: 'Two-factor authentication cannot be disabled while it is required for all users.', status: 403 };
    }
    const { password, code } = body;
    if (!password || !code) {
        return { error: 'Password and authenticator code are required', status: 400 };
    }
    const user = database_1.db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user?.mfa_enabled || !user.mfa_secret) {
        return { error: 'MFA is not enabled', status: 400 };
    }
    if (!user.password_hash || !bcryptjs_1.default.compareSync(password, user.password_hash)) {
        return { error: 'Incorrect password', status: 401 };
    }
    const secret = (0, mfaCrypto_1.decryptMfaSecret)(user.mfa_secret);
    const tokenStr = String(code).replace(/\s/g, '');
    const ok = otplib_1.authenticator.verify({ token: tokenStr, secret });
    if (!ok) {
        return { error: 'Invalid verification code', status: 401 };
    }
    database_1.db.prepare('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, mfa_backup_codes = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    mfaSetupPending.delete(userId);
    return { success: true, mfa_enabled: false };
}
function verifyMfaLogin(body) {
    const { mfa_token, code, remember_me } = body;
    const remember = remember_me === true;
    if (!mfa_token || !code) {
        return { error: 'Verification token and code are required', status: 400 };
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(mfa_token, config_1.JWT_SECRET, { algorithms: ['HS256'] });
        if (decoded.purpose !== 'mfa_login') {
            return { error: 'Invalid verification token', status: 401 };
        }
        const user = database_1.db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
        if (!user || !(user.mfa_enabled === 1 || user.mfa_enabled === true) || !user.mfa_secret) {
            return { error: 'Invalid session', status: 401 };
        }
        const secret = (0, mfaCrypto_1.decryptMfaSecret)(user.mfa_secret);
        const tokenStr = String(code).trim();
        const okTotp = otplib_1.authenticator.verify({ token: tokenStr.replace(/\s/g, ''), secret });
        if (!okTotp) {
            const hashes = parseBackupCodeHashes(user.mfa_backup_codes);
            // matchBackupCode handles both bcrypt and legacy SHA-256 hashes;
            // any store older than the bcrypt migration keeps working.
            const idx = hashes.findIndex((h) => matchBackupCode(tokenStr, h));
            if (idx === -1) {
                return { error: 'Invalid verification code', status: 401 };
            }
            hashes.splice(idx, 1);
            database_1.db.prepare('UPDATE users SET mfa_backup_codes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(hashes), user.id);
        }
        database_1.db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP, login_count = login_count + 1 WHERE id = ?').run(user.id);
        const sessionToken = generateToken(user, remember);
        const userSafe = stripUserForClient(user);
        return {
            token: sessionToken,
            user: { ...userSafe, avatar_url: (0, avatarUrl_1.avatarUrl)(user) },
            remember,
            auditUserId: Number(user.id),
        };
    }
    catch {
        return { error: 'Invalid or expired verification token', status: 401 };
    }
}
// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------
// 60 min; long enough to read the email in a second tab, short enough
// that a leaked link is unlikely to still be valid when someone tries it.
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const PASSWORD_RESET_TOKEN_BYTES = 32; // 256-bit entropy
/**
 * Returns the SHA-256 hex hash of a reset token. Raw tokens are never
 * persisted — we only store and compare their hashes.
 */
function hashResetToken(raw) {
    return (0, crypto_2.createHash)('sha256').update(raw).digest('hex');
}
// Per-email throttle (defence-in-depth on top of the per-IP limiter).
const perEmailResetAttempts = new Map();
const PASSWORD_RESET_PER_EMAIL_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_PER_EMAIL_MAX = 3;
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of perEmailResetAttempts) {
        if (now - record.first >= PASSWORD_RESET_PER_EMAIL_WINDOW_MS)
            perEmailResetAttempts.delete(key);
    }
}, 5 * 60 * 1000).unref?.();
function requestPasswordReset(rawEmail, createdIp) {
    const email = String(rawEmail || '').trim().toLowerCase();
    // Basic shape check — a fully empty / malformed email is treated like
    // "no user" so we still spend the same time internally.
    const looksLikeEmail = email.length > 0 && /.+@.+\..+/.test(email);
    // Global policy check: password login disabled → no reset possible.
    const toggles = resolveAuthToggles();
    if (!toggles.password_login) {
        return { tokenForDelivery: null, userId: null, userEmail: null, reason: 'password_login_disabled' };
    }
    // Per-email throttle. We check this BEFORE the DB lookup so the timing
    // is identical regardless of whether the account exists.
    const throttleKey = email || '__noemail__';
    const now = Date.now();
    const record = perEmailResetAttempts.get(throttleKey);
    if (record && record.count >= PASSWORD_RESET_PER_EMAIL_MAX && now - record.first < PASSWORD_RESET_PER_EMAIL_WINDOW_MS) {
        return { tokenForDelivery: null, userId: null, userEmail: null, reason: 'throttled_per_email' };
    }
    if (!record || now - record.first >= PASSWORD_RESET_PER_EMAIL_WINDOW_MS) {
        perEmailResetAttempts.set(throttleKey, { count: 1, first: now });
    }
    else {
        record.count++;
    }
    if (!looksLikeEmail) {
        return { tokenForDelivery: null, userId: null, userEmail: null, reason: 'no_user' };
    }
    const user = database_1.db.prepare('SELECT id, email, password_hash, oidc_sub FROM users WHERE email = ?').get(email);
    if (!user) {
        return { tokenForDelivery: null, userId: null, userEmail: null, reason: 'no_user' };
    }
    // SSO-linked account — refuse a reset. OIDC users are created with a random
    // bcrypt hash (so password_hash is never empty), which is why we must key off
    // oidc_sub rather than a missing hash. Letting the reset proceed would set a
    // local password and revoke session/credential state, which breaks the SSO
    // login; admins (or the user, with their current password) can still set one.
    // The client still gets the generic "if that email exists…" response.
    if (user.oidc_sub) {
        return { tokenForDelivery: null, userId: user.id, userEmail: user.email, reason: 'oidc_only' };
    }
    // Invalidate any prior unconsumed tokens for this user so there is
    // always at most one live reset link in flight.
    database_1.db.prepare("UPDATE password_reset_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND consumed_at IS NULL").run(user.id);
    const raw = (0, crypto_2.randomBytes)(PASSWORD_RESET_TOKEN_BYTES).toString('base64url');
    const token_hash = hashResetToken(raw);
    const expires_at = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();
    database_1.db.prepare('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_ip) VALUES (?, ?, ?, ?)').run(user.id, token_hash, expires_at, createdIp);
    return { tokenForDelivery: raw, userId: user.id, userEmail: user.email, reason: 'issued' };
}
/**
 * Consume a reset token and set a new password. If the target user has
 * MFA enabled, a valid TOTP code or backup code must be supplied — a
 * compromised email alone therefore does NOT allow taking over a
 * 2FA-protected account.
 */
function resetPassword(body) {
    const { token, new_password, mfa_code } = body;
    if (!token || typeof token !== 'string') {
        return { error: 'Reset token is required', status: 400 };
    }
    if (!new_password || typeof new_password !== 'string') {
        return { error: 'New password is required', status: 400 };
    }
    // Check the policy BEFORE touching the token so an invalid password
    // does not burn the user's one-time link.
    const pwCheck = (0, passwordPolicy_1.validatePassword)(new_password);
    if (!pwCheck.ok)
        return { error: pwCheck.reason, status: 400 };
    const tokenHash = hashResetToken(token);
    const row = database_1.db.prepare('SELECT id, user_id, expires_at, consumed_at FROM password_reset_tokens WHERE token_hash = ?').get(tokenHash);
    if (!row)
        return { error: 'Invalid or expired reset link', status: 400 };
    if (row.consumed_at)
        return { error: 'This reset link has already been used', status: 400 };
    if (new Date(row.expires_at).getTime() < Date.now()) {
        return { error: 'Reset link has expired. Please request a new one.', status: 400 };
    }
    const user = database_1.db.prepare('SELECT id, email, mfa_enabled, mfa_secret, mfa_backup_codes, password_version FROM users WHERE id = ?').get(row.user_id);
    if (!user)
        return { error: 'Invalid or expired reset link', status: 400 };
    // MFA gate. If enabled, require a valid TOTP or backup code.
    const mfaOn = user.mfa_enabled === 1 || user.mfa_enabled === true;
    let backupCodeConsumedIndex = null;
    if (mfaOn) {
        if (!user.mfa_secret) {
            // Data inconsistency — fail closed.
            return { error: 'MFA is enabled but not configured. Contact your administrator.', status: 500 };
        }
        const supplied = typeof mfa_code === 'string' ? mfa_code.trim() : '';
        if (!supplied)
            return { mfa_required: true, status: 200 };
        const secret = (0, mfaCrypto_1.decryptMfaSecret)(user.mfa_secret);
        const okTotp = otplib_1.authenticator.verify({ token: supplied.replace(/\s/g, ''), secret });
        if (!okTotp) {
            const hashes = parseBackupCodeHashes(user.mfa_backup_codes);
            const idx = hashes.findIndex((h) => matchBackupCode(supplied, h));
            if (idx === -1)
                return { error: 'Invalid MFA code', status: 401 };
            backupCodeConsumedIndex = idx;
        }
    }
    const newHash = bcryptjs_1.default.hashSync(new_password, BCRYPT_COST);
    const newPv = (user.password_version ?? 0) + 1;
    database_1.db.transaction(() => {
        // Burn the token first to keep it atomic with the password change.
        database_1.db.prepare('UPDATE password_reset_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?').run(row.id);
        // Also burn every OTHER live token for this user — a fresh login
        // should not leave a second door open.
        database_1.db.prepare("UPDATE password_reset_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND consumed_at IS NULL AND id != ?").run(user.id, row.id);
        database_1.db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0, password_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, newPv, user.id);
        // Consume backup code if one was used.
        if (backupCodeConsumedIndex !== null) {
            const hashes = parseBackupCodeHashes(user.mfa_backup_codes);
            hashes.splice(backupCodeConsumedIndex, 1);
            database_1.db.prepare('UPDATE users SET mfa_backup_codes = ? WHERE id = ?').run(JSON.stringify(hashes), user.id);
        }
        // Revoke every other credential class the user had. The
        // password_version bump alone invalidates JWT cookie sessions, but
        // MCP static tokens and OAuth 2.1 bearer tokens are separate stores
        // that survive the bump unless we prune them here.
        database_1.db.prepare('DELETE FROM mcp_tokens WHERE user_id = ?').run(user.id);
        try {
            database_1.db.prepare("UPDATE oauth_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE user_id = ? AND revoked_at IS NULL").run(user.id);
        }
        catch { /* oauth_tokens table may not exist in very old installs */ }
    })();
    // Kick off any MCP/WS session cleanup — same hook the account-delete path uses.
    try {
        (0, mcp_1.revokeUserSessions)?.(user.id);
    }
    catch { /* best-effort */ }
    return { success: true, userId: user.id };
}
// ---------------------------------------------------------------------------
// MCP tokens
// ---------------------------------------------------------------------------
function listMcpTokens(userId) {
    return database_1.db.prepare('SELECT id, name, token_prefix, created_at, last_used_at FROM mcp_tokens WHERE user_id = ? ORDER BY created_at DESC').all(userId);
}
function createMcpToken(userId, name) {
    if (!name?.trim())
        return { error: 'Token name is required', status: 400 };
    if (name.trim().length > 100)
        return { error: 'Token name must be 100 characters or less', status: 400 };
    const tokenCount = database_1.db.prepare('SELECT COUNT(*) as count FROM mcp_tokens WHERE user_id = ?').get(userId).count;
    if (tokenCount >= 10)
        return { error: 'Maximum of 10 tokens per user reached', status: 400 };
    const rawToken = 'memove_' + (0, crypto_2.randomBytes)(24).toString('hex');
    const tokenHash = (0, crypto_2.createHash)('sha256').update(rawToken).digest('hex');
    const tokenPrefix = rawToken.slice(0, 13);
    const result = database_1.db.prepare('INSERT INTO mcp_tokens (user_id, name, token_hash, token_prefix) VALUES (?, ?, ?, ?)').run(userId, name.trim(), tokenHash, tokenPrefix);
    const token = database_1.db.prepare('SELECT id, name, token_prefix, created_at, last_used_at FROM mcp_tokens WHERE id = ?').get(result.lastInsertRowid);
    return { token: { ...token, raw_token: rawToken } };
}
function deleteMcpToken(userId, tokenId) {
    const token = database_1.db.prepare('SELECT id FROM mcp_tokens WHERE id = ? AND user_id = ?').get(tokenId, userId);
    if (!token)
        return { error: 'Token not found', status: 404 };
    database_1.db.prepare('DELETE FROM mcp_tokens WHERE id = ?').run(tokenId);
    (0, mcp_1.revokeUserSessions)(userId);
    return { success: true };
}
// ---------------------------------------------------------------------------
// Ephemeral tokens
// ---------------------------------------------------------------------------
function createWsToken(userId) {
    // Bind the ws-token to the user's current password_version so a token minted
    // before a password reset is rejected on connect (defence-in-depth session gate).
    const pv = database_1.db.prepare('SELECT password_version FROM users WHERE id = ?').get(userId)?.password_version ?? 0;
    const token = (0, ephemeralTokens_1.createEphemeralToken)(userId, 'ws', { pv });
    if (!token)
        return { error: 'Service unavailable', status: 503 };
    return { token };
}
function createResourceToken(userId, purpose) {
    if (purpose !== 'download') {
        return { error: 'Invalid purpose', status: 400 };
    }
    const token = (0, ephemeralTokens_1.createEphemeralToken)(userId, purpose);
    if (!token)
        return { error: 'Service unavailable', status: 503 };
    return { token };
}
// ---------------------------------------------------------------------------
// MCP auth helpers
// ---------------------------------------------------------------------------
function isDemoUser(userId) {
    if (process.env.DEMO_MODE !== 'true')
        return false;
    const user = database_1.db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    return (0, demo_1.isDemoEmail)(user?.email);
}
function verifyMcpToken(rawToken) {
    const hash = (0, crypto_2.createHash)('sha256').update(rawToken).digest('hex');
    const row = database_1.db.prepare(`
    SELECT u.id, u.username, u.email, u.role
    FROM mcp_tokens mt
    JOIN users u ON mt.user_id = u.id
    WHERE mt.token_hash = ?
  `).get(hash);
    if (row) {
        database_1.db.prepare('UPDATE mcp_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE token_hash = ?').run(hash);
        return row;
    }
    return null;
}
/**
 * Verify a JWT the same way `middleware/auth.ts#verifyJwtAndLoadUser`
 * does — including the `password_version` check — so that stolen tokens
 * lose access the moment the victim resets their password.
 *
 * This is the single entry point every non-cookie JWT verification path
 * (MCP bearer, WebSocket handshake, file-download query tokens, photo
 * route) should go through.
 */
function verifyJwtToken(token) {
    return (0, auth_1.verifyJwtAndLoadUser)(token);
}
