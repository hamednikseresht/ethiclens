import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DB_PATH || './data/ethica.db';
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

export const db = new Database(path.resolve(dbPath));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user',      -- user | admin
  status        TEXT    NOT NULL DEFAULT 'active',    -- active | suspended
  daily_quota   INTEGER NOT NULL DEFAULT 30,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

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
  status       TEXT    NOT NULL DEFAULT 'pending',     -- pending | done | error
  error        TEXT,
  is_favorite  INTEGER NOT NULL DEFAULT 0,
  tokens_in    INTEGER DEFAULT 0,
  tokens_out   INTEGER DEFAULT 0,
  duration_ms  INTEGER DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id, created_at DESC);

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
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE(provider_id, model_id)
);

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
   مهاجرت: پایگاه‌های داده‌ای که پیش از افزودن مفهوم «ارائه‌دهنده» ساخته شده‌اند.
   جدول models قدیمی ستون provider_id نداشت و model_id در آن یکتای سراسری بود.
   -------------------------------------------------------------------------- */
function migrateModelsToProviders() {
  const cols = db.prepare('PRAGMA table_info(models)').all().map(c => c.name);
  if (cols.includes('provider_id')) return;

  console.log('[migrate] افزودن ارائه‌دهنده به جدول مدل‌ها…');
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

    // همه مدل‌های قبلی متعلق به انویدیا بوده‌اند
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

  console.log(`[migrate] ${legacy.length} مدل به ارائه‌دهنده انویدیا منتقل شد.`);
}
migrateModelsToProviders();

/**
 * ردیف‌های به‌جامانده از نسخه تک‌ارائه‌دهنده‌ای را از جدول settings پاک می‌کند.
 * کلید API حالا فقط در جدول providers نگهداری می‌شود؛ ماندنش در settings
 * هم بی‌استفاده است و هم خطر نشت دارد.
 */
function purgeLegacySettings() {
  const dead = ['nvidia_api_key', 'nvidia_base_url', 'guest_preview'];
  const found = db.prepare(
    `SELECT key FROM settings WHERE key IN (${dead.map(() => '?').join(',')})`).all(...dead);
  if (!found.length) return;

  // پیش از حذف، کلید را به ارائه‌دهنده انویدیا منتقل کن اگر آنجا خالی است
  const key = db.prepare("SELECT value FROM settings WHERE key = 'nvidia_api_key'").get()?.value;
  if (key) {
    const p = db.prepare("SELECT id, api_key FROM providers WHERE key = 'nvidia'").get();
    if (p && !p.api_key) {
      db.prepare('UPDATE providers SET api_key = ?, enabled = 1 WHERE id = ?').run(key, p.id);
      console.log('[migrate] کلید انویدیا به جدول ارائه‌دهندگان منتقل شد.');
    }
  }
  db.prepare(`DELETE FROM settings WHERE key IN (${dead.map(() => '?').join(',')})`).run(...dead);
  console.log(`[migrate] ${found.length} تنظیم منسوخ حذف شد: ${found.map(f => f.key).join('، ')}`);
}
purgeLegacySettings();

export function audit(userId, action, detail, ip) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, action, detail, ip) VALUES (?,?,?,?)')
      .run(userId ?? null, action, typeof detail === 'string' ? detail : JSON.stringify(detail ?? null), ip ?? null);
  } catch { /* logging must never break a request */ }
}
