import { db } from '../db.js';

/**
 * Categories for published analyses, plus the tag handling that goes with
 * the editorial publish form.
 *
 * A category carries a Persian title for readers and an ASCII slug for the
 * URL. The two are kept apart deliberately: Persian slugs are fine for Google
 * and the analysis pages use them, but a category sits in the path of every
 * article beneath it, so an ASCII segment stays readable when copied into
 * places that percent-encode aggressively.
 */

/** ASCII-only slug. Persian input cannot produce one, so the caller must ask. */
export function categorySlug(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

export function listCategories() {
  return db.prepare(`
    SELECT c.*,
           (SELECT COUNT(*) FROM analyses a
             WHERE a.category_id = c.id AND a.is_public = 1) AS published
    FROM categories c
    ORDER BY c.sort_order, c.id`).all();
}

export function getCategory(id) {
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
}

export function getCategoryBySlug(slug) {
  return db.prepare('SELECT * FROM categories WHERE slug = ?').get(String(slug));
}

export function createCategory({ title, slug, description, sort_order }) {
  const clean = categorySlug(slug);
  if (!clean) { const e = new Error('آدرس انگلیسی لازم است و باید حروف لاتین باشد.'); e.code = 'BAD_SLUG'; throw e; }
  if (!String(title || '').trim()) { const e = new Error('عنوان فارسی لازم است.'); e.code = 'BAD_TITLE'; throw e; }

  if (RESERVED_SLUGS.has(clean)) {
    const e = new Error('این نشانی رزرو شده است و برای تحلیل‌های منتشرشده کاربران به کار می‌رود.');
    e.code = 'RESERVED';
    throw e;
  }

  if (getCategoryBySlug(clean)) {
    const e = new Error('دسته‌بندی دیگری با همین آدرس وجود دارد.');
    e.code = 'DUPLICATE';
    throw e;
  }

  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) m FROM categories').get().m;
  const info = db.prepare(`
    INSERT INTO categories (title, slug, description, sort_order) VALUES (?,?,?,?)`)
    .run(String(title).trim().slice(0, 120), clean,
         String(description || '').trim().slice(0, 300),
         Number.isFinite(Number(sort_order)) ? Number(sort_order) : max + 10);

  return getCategory(Number(info.lastInsertRowid));
}

export function updateCategory(id, patch) {
  const cur = getCategory(id);
  if (!cur) return null;

  const slug = patch.slug !== undefined ? categorySlug(patch.slug) : cur.slug;
  if (!slug) { const e = new Error('آدرس انگلیسی لازم است.'); e.code = 'BAD_SLUG'; throw e; }

  // Guarded on rename as well as creation: otherwise the reserved slug is
  // simply taken on the second attempt.
  if (RESERVED_SLUGS.has(slug)) {
    const e = new Error('این نشانی رزرو شده است و برای تحلیل‌های منتشرشده کاربران به کار می‌رود.');
    e.code = 'RESERVED';
    throw e;
  }

  const clash = getCategoryBySlug(slug);
  if (clash && clash.id !== cur.id) {
    const e = new Error('دسته‌بندی دیگری با همین آدرس وجود دارد.');
    e.code = 'DUPLICATE';
    throw e;
  }

  db.prepare(`UPDATE categories SET title = ?, slug = ?, description = ?, sort_order = ? WHERE id = ?`)
    .run(String(patch.title ?? cur.title).trim().slice(0, 120), slug,
         String(patch.description ?? cur.description ?? '').trim().slice(0, 300),
         Number(patch.sort_order ?? cur.sort_order), cur.id);

  return getCategory(cur.id);
}

/**
 * Delete a category. Articles are not deleted with it — the foreign key is
 * ON DELETE SET NULL, so they simply become uncategorised. Removing a shelf
 * should never remove what was on it.
 */
export function deleteCategory(id) {
  return db.prepare('DELETE FROM categories WHERE id = ?').run(id).changes > 0;
}

/* --------------------------------------------------------------------------
   Tags
   -------------------------------------------------------------------------- */

/**
 * Split pasted tag text into a clean list.
 *
 * People paste tags in whatever shape they were copied from — Latin commas,
 * Persian commas (،), newlines, or a mix — so all of them count as
 * separators. Duplicates are dropped case-insensitively but the first
 * spelling is kept, since that is the one the editor chose to write.
 */
export function parseTags(input) {
  if (Array.isArray(input)) input = input.join(',');

  const seen = new Set();
  const out = [];

  for (const raw of String(input || '').split(/[,،؛;\n\r]+/)) {
    const tag = raw.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 20) break;
  }
  return out;
}

/** Tags stored on a row, always as an array even when the column is empty. */
export function readTags(json) {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

/* ==========================================================================
   The reader's category

   An admin files an analysis under a category when publishing it. An ordinary
   user cannot — the editorial fields are admin-only — so everything published
   by a member arrives with no category at all, and until now had nowhere to
   appear except the flat list.

   Those are collected under one shelf that behaves like a category everywhere
   a category is used: it has a slug, it has a page, and it appears in the
   index. It is not a row, because it is defined by the absence of one — a
   real row would have to be kept in step with every publish and could be
   deleted out from under the analyses that depend on it.
   ========================================================================== */
export const PUBLIC_CATEGORY = {
  id: null,
  slug: 'public',
  title: 'منتشرشده کاربران',
  description: 'دوراهی‌هایی که کاربران خودشان تحلیل کرده و برای دیگران عمومی کرده‌اند.',
  synthetic: true
};

/**
 * Slugs an admin may not take, because the router already means something by
 * them. Without this, creating a category called "public" would produce a
 * second page at /c/public and one of the two would win by accident.
 */
export const RESERVED_SLUGS = new Set([PUBLIC_CATEGORY.slug]);

/** Resolve a slug to a category, real or synthetic. */
export function resolveCategory(slug) {
  if (slug === PUBLIC_CATEGORY.slug) return PUBLIC_CATEGORY;
  return getCategoryBySlug(slug) || null;
}

/**
 * The categories a reader can browse: the admin's, plus the members' shelf
 * when anything is on it. Empty categories are left out — a category page
 * with nothing on it is a dead end for a reader and a thin page for a
 * crawler.
 */
export function browsableCategories() {
  const real = listCategories().filter(c => c.published > 0);
  const mine = countInCategory(null);
  return mine > 0
    ? [...real, { ...PUBLIC_CATEGORY, published: mine }]
    : real;
}

/**
 * Published analyses in one category.
 *
 * A null id means the members' shelf, so the comparison has to be IS NULL
 * rather than = ?, which never matches null in SQL.
 */
export function analysesInCategory(categoryId, { limit = 50, offset = 0 } = {}) {
  const where = categoryId === null ? 'category_id IS NULL' : 'category_id = ?';
  const params = categoryId === null ? [] : [categoryId];
  return db.prepare(`
    SELECT id, slug, title, public_title, seo_title, h1, public_summary,
           public_author, tags, published_at, created_at, views
    FROM analyses
    WHERE ${where} AND is_public = 1 AND slug IS NOT NULL
      AND status IN ('done','partial')
    ORDER BY published_at DESC
    LIMIT ? OFFSET ?`).all(...params, limit, offset);
}

export function countInCategory(categoryId) {
  const where = categoryId === null ? 'category_id IS NULL' : 'category_id = ?';
  const params = categoryId === null ? [] : [categoryId];
  return db.prepare(`
    SELECT COUNT(*) c FROM analyses
    WHERE ${where} AND is_public = 1 AND slug IS NOT NULL
      AND status IN ('done','partial')`).get(...params).c;
}

/** The category segment an analysis's public address sits under. */
export function categoryPathFor(row) {
  if (!row?.category_id) return PUBLIC_CATEGORY.slug;
  return getCategory(row.category_id)?.slug || PUBLIC_CATEGORY.slug;
}
