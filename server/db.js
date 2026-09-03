import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// Older installs carry an ethica.db file; when present it is used, so the
// product rename does not strand anyone's data.
const LEGACY_DB = './data/ethica.db';
const dbPath = process.env.DB_PATH
  || (fs.existsSync(path.resolve(LEGACY_DB)) ? LEGACY_DB : './data/ethiclens.db');
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

export const db = new Database(path.resolve(dbPath));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS tiers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  key            TEXT    NOT NULL UNIQUE,        -- basic | premium
  label          TEXT    NOT NULL,
  daily_quota    INTEGER NOT NULL DEFAULT 10,    -- analyses per day
  monthly_tokens INTEGER NOT NULL DEFAULT 0,     -- 0 = unlimited
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,                     -- display name; built from the two below
  first_name    TEXT,                                 -- optional
  last_name     TEXT,                                 -- optional
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user',      -- user | admin
  tier          TEXT    NOT NULL DEFAULT 'basic',     -- basic | premium
  -- pending = awaiting admin approval | active = approved | rejected | suspended
  status        TEXT    NOT NULL DEFAULT 'pending',
  approved_at   TEXT,
  approved_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_note   TEXT,                                 -- rejection reason or admin note
  -- email plausibility flag: 1 valid, 0 suspect, NULL unchecked
  email_valid   INTEGER,
  email_checked_at TEXT,
  email_check_note TEXT,
  -- NULL means "inherit from the tier"; a number means this user is an exception
  quota_override INTEGER,
  token_override INTEGER,
  email_verified INTEGER NOT NULL DEFAULT 0,
  verified_at   TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS email_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,     -- only the hash is stored, never the token itself
  purpose    TEXT    NOT NULL DEFAULT 'verify',
  expires_at TEXT    NOT NULL,
  used_at    TEXT,
  ip         TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id, purpose);

CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  data    TEXT NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

CREATE TABLE IF NOT EXISTS analyses (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL,
  dilemma      TEXT    NOT NULL,
  context      TEXT,                                   -- JSON: stakeholders, options, urgency, domain
  model        TEXT    NOT NULL,
  prompt_key   TEXT,
  raw_output   TEXT,
  sections     TEXT,                                   -- JSON: parsed sections
  status       TEXT    NOT NULL DEFAULT 'pending',     -- pending | done | partial | error
  completeness TEXT,                                   -- JSON: which sections came back short or empty
  error        TEXT,
  is_favorite  INTEGER NOT NULL DEFAULT 0,
  decision     TEXT,                                   -- the option the user actually chose
  reflection   TEXT,                                   -- what happened afterwards and what they learned
  reflected_at TEXT,
  -- publishing: only by explicit choice of the analysis owner
  is_public      INTEGER NOT NULL DEFAULT 0,
  slug           TEXT UNIQUE,
  published_at   TEXT,
  public_title   TEXT,                                 -- alternative title for public display
  public_summary TEXT,                                 -- meta description for search engines
  public_author  TEXT,                                 -- author name; empty = anonymous
  views          INTEGER NOT NULL DEFAULT 0,
  tokens_in    INTEGER DEFAULT 0,
  tokens_out   INTEGER DEFAULT 0,
  duration_ms  INTEGER DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id, created_at DESC);

-- Categories for published content. Only an admin assigns one, so a category
-- is a curated shelf rather than something every user can invent.
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,             -- Persian, shown to readers
  slug        TEXT    NOT NULL UNIQUE,      -- ASCII, used in the URL
  description TEXT,                         -- meta description for the category page
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sort_order, id);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS providers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT    NOT NULL UNIQUE,          -- nvidia | openai | …
  label      TEXT    NOT NULL,
  base_url   TEXT    NOT NULL,
  api_key    TEXT    NOT NULL DEFAULT '',
  enabled    INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS models (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER REFERENCES providers(id) ON DELETE CASCADE,
  model_id    TEXT NOT NULL,
  label       TEXT NOT NULL,
  note        TEXT,
  enabled     INTEGER NOT NULL DEFAULT 1,
  min_tier    TEXT NOT NULL DEFAULT 'basic',   -- lowest tier allowed to reach this model
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(provider_id, model_id)
);

CREATE TABLE IF NOT EXISTS guide_sections (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT    NOT NULL UNIQUE,      -- lens:virtue | phase:1 | gate:dignity | exp:gyges | intro:hero
  kind       TEXT    NOT NULL,             -- lens | phase | gate | experiment | prose
  title      TEXT    NOT NULL,
  subtitle   TEXT,                         -- Latin term or thinker's name
  lead       TEXT,                         -- the core question, or a short explanation
  body       TEXT,                         -- main text (light markdown)
  extra      TEXT,                         -- JSON: concepts, critique, sources, colour, icon
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_guide_kind ON guide_sections(kind, sort_order);

CREATE TABLE IF NOT EXISTS prompts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  content    TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  detail     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
`);

/* --------------------------------------------------------------------------
   Migration: databases created before the "provider" concept existed.
   The old models table had no provider_id and model_id was globally unique.
   -------------------------------------------------------------------------- */
function migrateModelsToProviders() {
  const cols = db.prepare('PRAGMA table_info(models)').all().map(c => c.name);
  if (cols.includes('provider_id')) return;

  console.log('[migrate] adding provider column to models table…');
  const legacy = db.prepare('SELECT * FROM models').all();

  db.transaction(() => {
    db.exec('ALTER TABLE models RENAME TO models_legacy');
    db.exec(`
      CREATE TABLE models (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER REFERENCES providers(id) ON DELETE CASCADE,
        model_id    TEXT NOT NULL,
        label       TEXT NOT NULL,
        note        TEXT,
        enabled     INTEGER NOT NULL DEFAULT 1,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        UNIQUE(provider_id, model_id)
      )`);

  // Every pre-existing model belonged to NVIDIA
    const nv = db.prepare("SELECT id FROM providers WHERE key = 'nvidia'").get();
    const pid = nv ? nv.id : db.prepare(
      `INSERT INTO providers (key, label, base_url, api_key, sort_order)
       VALUES ('nvidia', 'NVIDIA NIM', ?, ?, 10)`
    ).run(
      db.prepare("SELECT value FROM settings WHERE key='nvidia_base_url'").get()?.value
        || 'https://integrate.api.nvidia.com/v1',
      db.prepare("SELECT value FROM settings WHERE key='nvidia_api_key'").get()?.value || ''
    ).lastInsertRowid;

    const ins = db.prepare(
      `INSERT INTO models (provider_id, model_id, label, note, enabled, sort_order)
       VALUES (?,?,?,?,?,?)`);
    for (const m of legacy) ins.run(pid, m.model_id, m.label, m.note, m.enabled, m.sort_order);

    db.exec('DROP TABLE models_legacy');
  })();

  console.log(`[migrate] moved ${legacy.length} model(s) to the NVIDIA provider.`);
}
migrateModelsToProviders();

/**
 * Remove rows left over from the single-provider version of the settings table.
 * The API key now lives only in the providers table; leaving it in settings is
 * both useless and a leak risk.
 */
function purgeLegacySettings() {
  const dead = ['nvidia_api_key', 'nvidia_base_url', 'guest_preview'];
  const found = db.prepare(
    `SELECT key FROM settings WHERE key IN (${dead.map(() => '?').join(',')})`).all(...dead);
  if (!found.length) return;

  // Before deleting, move the key to the NVIDIA provider if that slot is empty
  const key = db.prepare("SELECT value FROM settings WHERE key = 'nvidia_api_key'").get()?.value;
  if (key) {
    const p = db.prepare("SELECT id, api_key FROM providers WHERE key = 'nvidia'").get();
    if (p && !p.api_key) {
      db.prepare('UPDATE providers SET api_key = ?, enabled = 1 WHERE id = ?').run(key, p.id);
      console.log('[migrate] moved the NVIDIA key into the providers table.');
    }
  }
  db.prepare(`DELETE FROM settings WHERE key IN (${dead.map(() => '?').join(',')})`).run(...dead);
  console.log(`[migrate] removed ${found.length} obsolete setting(s): ${found.map(f => f.key).join(', ')}`);
}
purgeLegacySettings();

/**
 * Columns added after the first release.
 * CREATE TABLE only builds a fresh database, so new columns have to be added
 * to existing ones with ALTER.
 */
function addMissingColumns() {
  const WANTED = {
    analyses: {
      decision:     'TEXT',   // the option the user actually chose
      reflection:   'TEXT',   // what happened afterwards and what they learned
      reflected_at: 'TEXT',
      is_public:      'INTEGER NOT NULL DEFAULT 0',
      slug:           'TEXT',            // uniqueness is enforced by a separate index
      published_at:   'TEXT',
      public_title:   'TEXT',
      public_summary: 'TEXT',
      public_author:  'TEXT',
      views:          'INTEGER NOT NULL DEFAULT 0',
      completeness:   'TEXT',
      // Editorial fields, set by an admin at publish time. Separate columns
      // rather than reusing public_title, because the browser tab and the
      // page heading serve different jobs: the <title> competes in a search
      // result and wants keywords, the <h1> is read by someone already on
      // the page. Collapsing them forces one to be wrong.
      category_id:    'INTEGER REFERENCES categories(id) ON DELETE SET NULL',
      seo_title:      'TEXT',
      h1:             'TEXT',
      tags:           'TEXT'    // JSON array
    },
    users: {
      tier:           "TEXT NOT NULL DEFAULT 'basic'",
      email_verified: 'INTEGER NOT NULL DEFAULT 0',
      verified_at:    'TEXT',
      first_name:       'TEXT',
      last_name:        'TEXT',
      approved_at:      'TEXT',
      approved_by:      'INTEGER',
      review_note:      'TEXT',
      email_valid:      'INTEGER',
      email_checked_at: 'TEXT',
      email_check_note: 'TEXT',
      quota_override: 'INTEGER',
      token_override: 'INTEGER'
    },
    models: {
      min_tier: "TEXT NOT NULL DEFAULT 'basic'"
    },
    email_tokens: {
      // Wrong-guess counter for six-digit codes. Link tokens never need it —
      // they are unguessable — but a short code has to die after a few misses
      // or the million-value space can simply be walked through.
      attempts: 'INTEGER NOT NULL DEFAULT 0'
    }
  };

  for (const [table, cols] of Object.entries(WANTED)) {
    const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
    for (const [col, type] of Object.entries(cols)) {
      if (have.has(col)) continue;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      console.log(`[migrate] added column ${table}.${col}.`);
    }
  }
}
addMissingColumns();

/**
 * Indexes that depend on the added columns.
 * They must be created after addMissingColumns, or they fail with
 * "no such column" on a database that does not have the column yet.
 */
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_analyses_slug
  ON analyses(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analyses_public
  ON analyses(is_public, published_at DESC) WHERE is_public = 1;
`);

/**
 * A quota that sat directly on the user before tiers existed becomes an
 * individual exception, so no user's behaviour changes across the upgrade.
 * The old column is then dropped, since nothing reads it and keeping it misleads.
 */
function migrateDailyQuota() {
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!cols.includes('daily_quota')) return;

  const moved = db.prepare(
    'UPDATE users SET quota_override = daily_quota WHERE quota_override IS NULL'
  ).run().changes;

  db.exec('ALTER TABLE users DROP COLUMN daily_quota');
  console.log(`[migrate] moved ${moved} per-user quota(s) to individual overrides and dropped the old column.`);
}
migrateDailyQuota();

/**
 * Users who registered before email verification existed are counted as
 * verified. Otherwise switching the feature on would suddenly lock out every
 * existing account — irreversible for anyone who no longer has that address.
 */
function grandfatherVerifiedUsers() {
  if (db.prepare("SELECT value FROM settings WHERE key = 'email_verify_migrated'").get()) return;

  const n = db.prepare(
    "UPDATE users SET email_verified = 1, verified_at = COALESCE(verified_at, created_at) WHERE email_verified = 0"
  ).run().changes;

  db.prepare("INSERT INTO settings (key, value) VALUES ('email_verify_migrated', '1')").run();
  if (n) console.log(`[migrate] marked ${n} existing user(s) as verified (created before email verification existed).`);
}
grandfatherVerifiedUsers();

export function audit(userId, action, detail, ip) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, action, detail, ip) VALUES (?,?,?,?)')
      .run(userId ?? null, action, typeof detail === 'string' ? detail : JSON.stringify(detail ?? null), ip ?? null);
  } catch { /* logging must never break a request */ }
}
