import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

// نصب‌های قدیمی فایل ethica.db دارند؛ اگر باشد همان استفاده می‌شود
// تا ارتقای نام محصول داده کسی را جا نگذارد.
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
  daily_quota    INTEGER NOT NULL DEFAULT 10,    -- تحلیل در روز
  monthly_tokens INTEGER NOT NULL DEFAULT 0,     -- ۰ = بی‌نهایت
  sort_order     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,                     -- نام نمایشی؛ از دو مورد زیر ساخته می‌شود
  first_name    TEXT,                                 -- اختیاری
  last_name     TEXT,                                 -- اختیاری
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'user',      -- user | admin
  tier          TEXT    NOT NULL DEFAULT 'basic',     -- basic | premium
  -- pending = منتظر تأیید مدیر | active = تأییدشده | rejected = رد شده | suspended = مسدود
  status        TEXT    NOT NULL DEFAULT 'pending',
  approved_at   TEXT,
  approved_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_note   TEXT,                                 -- دلیل رد یا یادداشت مدیر
  -- پرچم اعتبار ایمیل: ۱ معتبر، ۰ مشکوک، NULL بررسی‌نشده
  email_valid   INTEGER,
  email_checked_at TEXT,
  email_check_note TEXT,
  -- NULL یعنی «از گروه ارث ببر»؛ عدد یعنی این کاربر استثناست
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
  token_hash TEXT    NOT NULL UNIQUE,     -- فقط چکیده ذخیره می‌شود، نه خود توکن
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
  status       TEXT    NOT NULL DEFAULT 'pending',     -- pending | done | error
  error        TEXT,
  is_favorite  INTEGER NOT NULL DEFAULT 0,
  decision     TEXT,                                   -- گزینه‌ای که کاربر واقعاً انتخاب کرد
  reflection   TEXT,                                   -- بعداً چه شد و چه آموخت
  reflected_at TEXT,
  -- انتشار عمومی: فقط با انتخاب صریح صاحب تحلیل
  is_public      INTEGER NOT NULL DEFAULT 0,
  slug           TEXT UNIQUE,
  published_at   TEXT,
  public_title   TEXT,                                 -- عنوان جایگزین برای نمایش عمومی
  public_summary TEXT,                                 -- توضیح متا برای موتور جست‌وجو
  public_author  TEXT,                                 -- نام نویسنده؛ خالی = ناشناس
  views          INTEGER NOT NULL DEFAULT 0,
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
  min_tier    TEXT NOT NULL DEFAULT 'basic',   -- کمترین گروهی که به این مدل دسترسی دارد
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

/**
 * ستون‌هایی که بعد از انتشار اولیه اضافه شده‌اند.
 * CREATE TABLE فقط پایگاه داده تازه را می‌سازد، پس ستون‌های جدید باید
 * روی پایگاه‌های موجود با ALTER اضافه شوند.
 */
function addMissingColumns() {
  const WANTED = {
    analyses: {
      decision:     'TEXT',   // گزینه‌ای که کاربر واقعاً انتخاب کرد
      reflection:   'TEXT',   // بعداً چه شد و چه آموخت
      reflected_at: 'TEXT',
      is_public:      'INTEGER NOT NULL DEFAULT 0',
      slug:           'TEXT',            // یکتایی با ایندکس جدا اعمال می‌شود
      published_at:   'TEXT',
      public_title:   'TEXT',
      public_summary: 'TEXT',
      public_author:  'TEXT',
      views:          'INTEGER NOT NULL DEFAULT 0'
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
    }
  };

  for (const [table, cols] of Object.entries(WANTED)) {
    const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
    for (const [col, type] of Object.entries(cols)) {
      if (have.has(col)) continue;
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      console.log(`[migrate] ستون ${table}.${col} اضافه شد.`);
    }
  }
}
addMissingColumns();

/**
 * ایندکس‌هایی که به ستون‌های افزوده‌شده وابسته‌اند.
 * باید بعد از addMissingColumns ساخته شوند، وگرنه روی پایگاه داده‌ای که
 * هنوز ستون را ندارد با «no such column» شکست می‌خورند.
 */
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_analyses_slug
  ON analyses(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analyses_public
  ON analyses(is_public, published_at DESC) WHERE is_public = 1;
`);

/**
 * سهمیه‌ای که پیش از مفهوم «گروه» مستقیم روی کاربر بود، به استثنای فردی
 * تبدیل می‌شود تا رفتار هیچ کاربری با این ارتقا عوض نشود. سپس ستون قدیمی
 * حذف می‌شود چون دیگر خوانده نمی‌شود و ماندنش گمراه‌کننده است.
 */
function migrateDailyQuota() {
  const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
  if (!cols.includes('daily_quota')) return;

  const moved = db.prepare(
    'UPDATE users SET quota_override = daily_quota WHERE quota_override IS NULL'
  ).run().changes;

  db.exec('ALTER TABLE users DROP COLUMN daily_quota');
  console.log(`[migrate] سهمیه ${moved} کاربر به استثنای فردی منتقل و ستون قدیمی حذف شد.`);
}
migrateDailyQuota();

/**
 * کاربرانی که پیش از افزودن تأیید ایمیل ثبت‌نام کرده‌اند، تأییدشده حساب
 * می‌شوند. وگرنه با روشن‌شدن این قابلیت، همه حساب‌های موجود ناگهان
 * مسدود می‌شدند — که برای کسی که ایمیلش را دیگر ندارد بازگشت‌ناپذیر است.
 */
function grandfatherVerifiedUsers() {
  if (db.prepare("SELECT value FROM settings WHERE key = 'email_verify_migrated'").get()) return;

  const n = db.prepare(
    "UPDATE users SET email_verified = 1, verified_at = COALESCE(verified_at, created_at) WHERE email_verified = 0"
  ).run().changes;

  db.prepare("INSERT INTO settings (key, value) VALUES ('email_verify_migrated', '1')").run();
  if (n) console.log(`[migrate] ${n} کاربر موجود تأییدشده علامت خورد (پیش از فعال‌شدن تأیید ایمیل ساخته شده بودند).`);
}
grandfatherVerifiedUsers();

export function audit(userId, action, detail, ip) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, action, detail, ip) VALUES (?,?,?,?)')
      .run(userId ?? null, action, typeof detail === 'string' ? detail : JSON.stringify(detail ?? null), ip ?? null);
  } catch { /* logging must never break a request */ }
}
