import Database from 'better-sqlite3';
import crypto from 'crypto';
import { logInfo, logError } from '../services/auditLog';

// bcrypt cost factor for the seeded admin password — kept in sync with authService.
const BCRYPT_COST = 12;

// Seeds run at startup before the DB admin panel can be used, so only env vars
// are checked here. The granular password_login/password_registration DB toggles
// are only relevant after the first user exists; at that point seeds have already
// finished and skip via the userCount > 0 guard above.
function isOidcOnlyConfigured(): boolean {
  if (process.env.OIDC_ONLY?.toLowerCase() !== 'true') return false;
  return !!(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID);
}

function seedAdminAccount(db: Database.Database): void {
  try {
    const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
    if (userCount > 0) return;

    // Demo mode seeds its own admin (admin@memove.app, username 'admin') right after this.
    // Creating a first-run admin here would grab username 'admin' first and make the demo
    // seeder fail on the UNIQUE(username) constraint, leaving the demo user uncreated.
    if (process.env.DEMO_MODE?.toLowerCase() === 'true') return;

    if (isOidcOnlyConfigured()) {
      logInfo('');
      logInfo('╔══════════════════════════════════════════════╗');
      logInfo('║  memove — OIDC-Only Mode                       ║');
      logInfo('║  First SSO login will become admin.           ║');
      logInfo('╚══════════════════════════════════════════════╝');
      logInfo('');
      return;
    }

    const bcrypt = require('bcryptjs');

    const env_admin_email = process.env.ADMIN_EMAIL;
    const env_admin_pw = process.env.ADMIN_PASSWORD;

    let password;
    let email;
    if (env_admin_email && env_admin_pw) {
      password = env_admin_pw;
      email = env_admin_email;
    } else {
      password = crypto.randomBytes(12).toString('base64url');
      email = 'admin@memove.local';
    }

    const hash = bcrypt.hashSync(password, BCRYPT_COST);
    const username = 'admin';

    db.prepare('INSERT INTO users (username, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)').run(username, email, hash, 'admin');

    logInfo('');
    logInfo('╔══════════════════════════════════════════════╗');
    logInfo('║  memove — First Run: Admin Account Created     ║');
    logInfo('╠══════════════════════════════════════════════╣');
    logInfo(`║  Email:    ${email.padEnd(33)}║`);
    logInfo(`║  Password: ${password.padEnd(33)}║`);
    logInfo('╚══════════════════════════════════════════════╝');
    logInfo('');
  } catch (err: unknown) {
    logError('[ERROR] Error seeding admin account:' + (err instanceof Error ? err.message : String(err)));
  }
}

function seedCategories(db: Database.Database): void {
  try {
    const existingCats = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
    if (existingCats.count === 0) {
      const defaultCategories = [
        { name: 'Hotel', color: '#3b82f6', icon: '🏨' },
        { name: 'Restaurant', color: '#ef4444', icon: '🍽️' },
        { name: 'Attraction', color: '#8b5cf6', icon: '🏛️' },
        { name: 'Shopping', color: '#f59e0b', icon: '🛍️' },
        { name: 'Transport', color: '#6b7280', icon: '🚌' },
        { name: 'Activity', color: '#10b981', icon: '🎯' },
        { name: 'Bar/Cafe', color: '#f97316', icon: '☕' },
        { name: 'Beach', color: '#06b6d4', icon: '🏖️' },
        { name: 'Nature', color: '#84cc16', icon: '🌿' },
        { name: 'Other', color: '#6366f1', icon: '📍' },
      ];
      const insertCat = db.prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)');
      for (const cat of defaultCategories) insertCat.run(cat.name, cat.color, cat.icon);
      logInfo('Default categories seeded');
    }
  } catch (err: unknown) {
    logError('Error seeding categories:' + (err instanceof Error ? err.message : String(err)));
  }
}

function seedAddons(db: Database.Database): void {
  try {
    const defaultAddons = [
      { id: 'packing', name: 'Lists', description: 'Packing lists and to-do tasks for your trips', type: 'trip', icon: 'ListChecks', enabled: 1, sort_order: 0 },
      { id: 'budget', name: 'Costs', description: 'Track and split trip expenses', type: 'trip', icon: 'Wallet', enabled: 1, sort_order: 1 },
      { id: 'documents', name: 'Documents', description: 'Store and manage travel documents', type: 'trip', icon: 'FileText', enabled: 1, sort_order: 2 },
      { id: 'vacay', name: 'Vacay', description: 'Personal vacation day planner with calendar view', type: 'global', icon: 'CalendarDays', enabled: 1, sort_order: 10 },
      { id: 'atlas', name: 'Atlas', description: 'World map of your visited countries with travel stats', type: 'global', icon: 'Globe', enabled: 1, sort_order: 11 },
      { id: 'mcp', name: 'MCP', description: 'Model Context Protocol for AI assistant integration', type: 'integration', icon: 'Terminal', enabled: 0, sort_order: 12 },
      { id: 'naver_list_import', name: 'Naver List Import', description: 'Import places from shared Naver Maps lists', type: 'trip', icon: 'Link2', enabled: 1, sort_order: 13 },
      { id: 'collab', name: 'Collab', description: 'Notes, polls, and live chat for trip collaboration', type: 'trip', icon: 'Users', enabled: 1, sort_order: 6 },
      { id: 'journey', name: 'Journey', description: 'Trip tracking & travel journal — check-ins, photos, daily stories', type: 'global', icon: 'Compass', enabled: 1, sort_order: 35 },
      { id: 'airtrail', name: 'AirTrail', description: 'Sync flights from your self-hosted AirTrail instance', type: 'integration', icon: 'Plane', enabled: 0, sort_order: 14 },
      { id: 'relocation', name: 'Relocation', description: 'AI-powered relocation intelligence and city comparison', type: 'global', icon: 'MapPin', enabled: 1, sort_order: 5 },
    ];
    // ponytail: UPSERT — only sets enabled when the seed default is on (1), so admin UI
    // disabling of off-by-default addons (mcp, airtrail) is preserved across boots.
    // Display fields (name/desc/icon/type/sort_order) always sync from the seed.
    // Needed because migration 84 inserts journey with enabled=0; without this upsert
    // the journey row stays off in fresh DBs (INSERT OR IGNORE silently no-ops).
    const insertAddon = db.prepare(`
      INSERT INTO addons (id, name, description, type, icon, enabled, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        type = excluded.type,
        icon = excluded.icon,
        enabled = CASE WHEN excluded.enabled = 1 THEN 1 ELSE addons.enabled END,
        sort_order = excluded.sort_order
    `);
    for (const a of defaultAddons) insertAddon.run(a.id, a.name, a.description, a.type, a.icon, a.enabled, a.sort_order);

    const providerRows = [
      {
        id: 'immich',
        name: 'Immich',
        description: 'Immich photo provider',
        icon: 'Image',
        enabled: 0,
        sort_order: 0,
      },
      {
        id: 'synologyphotos',
        name: 'Synology Photos',
        description: 'Synology Photos integration with separate account settings',
        icon: 'Image',
        enabled: 0,
        sort_order: 1,
      },
    ];
    const insertProvider = db.prepare('INSERT OR IGNORE INTO photo_providers (id, name, description, icon, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    for (const p of providerRows) insertProvider.run(p.id, p.name, p.description, p.icon, p.enabled, p.sort_order);

    const providerFields = [
      { provider_id: 'immich', field_key: 'immich_url', label: 'providerUrl', input_type: 'url', placeholder: 'https://immich.example.com', hint: null, required: 1, secret: 0, settings_key: 'immich_url', payload_key: 'immich_url', sort_order: 0 },
      { provider_id: 'immich', field_key: 'immich_api_key', label: 'providerApiKey', input_type: 'password', placeholder: 'API Key', hint: null, required: 1, secret: 1, settings_key: null, payload_key: 'immich_api_key', sort_order: 1 },
      { provider_id: 'synologyphotos', field_key: 'synology_url', label: 'providerUrl', input_type: 'url', placeholder: 'https://synology.example.com/photo', hint: 'providerUrlHintSynology', required: 1, secret: 0, settings_key: 'synology_url', payload_key: 'synology_url', sort_order: 0 },
      { provider_id: 'synologyphotos', field_key: 'synology_username', label: 'providerUsername', input_type: 'text', placeholder: 'Username', hint: null, required: 1, secret: 0, settings_key: 'synology_username', payload_key: 'synology_username', sort_order: 1 },
      { provider_id: 'synologyphotos', field_key: 'synology_password', label: 'providerPassword', input_type: 'password', placeholder: 'Password', hint: null, required: 1, secret: 1, settings_key: null, payload_key: 'synology_password', sort_order: 2 },
      { provider_id: 'synologyphotos', field_key: 'synology_otp', label: 'providerOTP', input_type: 'text', placeholder: '123456', hint: null, required: 0, secret: 0, settings_key: null, payload_key: 'synology_otp', sort_order: 3 },
      { provider_id: 'synologyphotos', field_key: 'synology_skip_ssl', label: 'skipSSLVerification', input_type: 'checkbox', placeholder: null, hint: null, required: 0, secret: 0, settings_key: 'synology_skip_ssl', payload_key: 'synology_skip_ssl', sort_order: 4 },
    ];
    const insertProviderField = db.prepare('INSERT OR IGNORE INTO photo_provider_fields (provider_id, field_key, label, input_type, placeholder, hint, required, secret, settings_key, payload_key, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const f of providerFields) {
      insertProviderField.run(f.provider_id, f.field_key, f.label, f.input_type, f.placeholder, f.hint, f.required, f.secret, f.settings_key, f.payload_key, f.sort_order);
    }
    logInfo('Default addons seeded');
  } catch (err: unknown) {
    logError('Error seeding addons:' + (err instanceof Error ? err.message : String(err)));
  }
}

function runSeeds(db: Database.Database): void {
  seedAdminAccount(db);
  seedCategories(db);
  seedAddons(db);
}

export { runSeeds };
