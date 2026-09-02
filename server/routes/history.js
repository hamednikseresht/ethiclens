import express from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { uniqueSlug, metaDescription } from '../services/seo.js';
import { audit } from '../db.js';
import { parseTags, readTags, listCategories } from '../services/categories.js';

export const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const perPage = Math.min(50, Math.max(5, parseInt(req.query.perPage) || 12));
  const q = String(req.query.q || '').trim();
  const fav = req.query.favorite === '1';

  const where = ['user_id = ?'];
  const params = [req.user.id];
  if (q) { where.push('(title LIKE ? OR dilemma LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (fav) where.push('is_favorite = 1');
  if (req.query.reflected === '1') where.push('reflected_at IS NOT NULL');
  if (req.query.reflected === '0') where.push("reflected_at IS NULL AND status IN ('done','partial')");
  const clause = where.join(' AND ');

  const total = db.prepare(`SELECT COUNT(*) c FROM analyses WHERE ${clause}`).get(...params).c;
  const items = db.prepare(
    `SELECT id, title, model, status, is_favorite, duration_ms, created_at,
            decision, reflected_at, is_public, slug, views, completeness,
            substr(dilemma, 1, 220) AS excerpt
     FROM analyses WHERE ${clause}
     ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, perPage, (page - 1) * perPage);

  res.json({ items, total, page, perPage, pages: Math.ceil(total / perPage) || 1 });
});

router.get('/stats', (req, res) => {
  const uid = req.user.id;
  const base = db.prepare(
    `SELECT COUNT(*) total,
            SUM(status = 'done') done,
            SUM(is_favorite = 1) favorites,
            SUM(reflected_at IS NOT NULL) reflected,
            SUM(reflected_at IS NULL AND status IN ('done','partial')) awaiting,
            COALESCE(AVG(NULLIF(duration_ms,0)), 0) avgMs
     FROM analyses WHERE user_id = ?`).get(uid);

  const today = db.prepare(
    `SELECT COUNT(*) c FROM analyses WHERE user_id = ? AND date(created_at) = date('now')`).get(uid).c;

  const daily = db.prepare(
    `SELECT date(created_at) d, COUNT(*) c FROM analyses
     WHERE user_id = ? AND created_at >= datetime('now','-29 days')
     GROUP BY d ORDER BY d`).all(uid);

  const models = db.prepare(
    `SELECT model, COUNT(*) c FROM analyses WHERE user_id = ? GROUP BY model ORDER BY c DESC`).all(uid);

  res.json({ ...base, today, quota: req.user.daily_quota, daily, models });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM analyses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'تحلیل یافت نشد.' });
  res.json({
    ...row,
    context: safeJson(row.context, {}),
    sections: safeJson(row.sections, {}),
    completeness: safeJson(row.completeness, null),
    tags: readTags(row.tags),
    // The publish dialog needs the list to build its dropdown. Sent only to
    // admins, since only they can set a category.
    categories: req.user.role === 'admin' ? listCategories() : undefined
  });
});

router.post('/:id/favorite', (req, res) => {
  const row = db.prepare('SELECT is_favorite FROM analyses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'تحلیل یافت نشد.' });
  const next = row.is_favorite ? 0 : 1;
  db.prepare('UPDATE analyses SET is_favorite = ? WHERE id = ?').run(next, req.params.id);
  res.json({ ok: true, isFavorite: !!next });
});

/**
 * Phase five of the framework: "act and reflect".
 * The user records what they decided and what happened afterwards — which
 * no model can supply, and is the only genuinely learning part of the process.
 */
router.post('/:id/reflection', (req, res) => {
  const own = db.prepare('SELECT id FROM analyses WHERE id = ? AND user_id = ?')
                .get(req.params.id, req.user.id);
  if (!own) return res.status(404).json({ error: 'تحلیل یافت نشد.' });

  const decision = String(req.body?.decision || '').trim().slice(0, 300);
  const reflection = String(req.body?.reflection || '').trim().slice(0, 4000);

  if (!decision && !reflection) {
    db.prepare('UPDATE analyses SET decision = NULL, reflection = NULL, reflected_at = NULL WHERE id = ?')
      .run(own.id);
    return res.json({ ok: true, cleared: true });
  }

  db.prepare(`UPDATE analyses SET decision = ?, reflection = ?, reflected_at = datetime('now')
              WHERE id = ?`).run(decision || null, reflection || null, own.id);

  const row = db.prepare('SELECT decision, reflection, reflected_at FROM analyses WHERE id = ?').get(own.id);
  res.json({ ok: true, ...row });
});

/**
 * Publishing an analysis.
 *
 * Publishing is always an explicit choice by the analysis owner and never
 * automatic: dilemma text is personal and may carry identifying detail.
 * The user can set a separate public title and summary, and stay anonymous.
 */
router.post('/:id/publish', (req, res) => {
  const row = db.prepare('SELECT * FROM analyses WHERE id = ? AND user_id = ?')
                .get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'تحلیل یافت نشد.' });
  // A partial analysis may still be published — the owner decides whether an
  // incomplete result is worth sharing. What must not happen is publishing
  // succeeding while the public page 404s, so the same predicate is used here
  // and in the public/sitemap lookups.
  if (row.status !== 'done' && row.status !== 'partial') {
    return res.status(400).json({ error: 'فقط تحلیل کامل‌شده را می‌توان منتشر کرد.' });
  }

  const makePublic = req.body?.publish !== false;

  if (!makePublic) {
    db.prepare('UPDATE analyses SET is_public = 0 WHERE id = ?').run(row.id);
    audit(req.user.id, 'analysis_unpublish', { id: row.id, slug: row.slug }, req.ip);
    return res.json({ ok: true, isPublic: false, slug: row.slug });
  }

  // Fields that were not sent keep their previous value — re-publishing must
  // not wipe a title or summary the user already wrote.
  const pick = (sent, previous, fallback = '') => {
    const v = String(sent ?? '').trim();
    if (v) return v;
    return (previous || '').trim() || fallback;
  };

  const publicTitle   = pick(req.body?.public_title, row.public_title, row.title).slice(0, 120);
  const publicSummary = pick(req.body?.public_summary, row.public_summary).slice(0, 300);
  const publicAuthor  = pick(req.body?.public_author, row.public_author).slice(0, 60);

  // A published title has to be unique. Two analyses sharing one name are
  // indistinguishable in the public index and in search results, and the
  // slug would silently gain a random suffix that means nothing to anyone.
  // Better to say so and let the author pick a name they intended.
  const clash = db.prepare(`
    SELECT id FROM analyses
    WHERE is_public = 1 AND id <> ? AND lower(trim(COALESCE(public_title, title))) = lower(trim(?))
    LIMIT 1`).get(row.id, publicTitle);

  if (clash) {
    return res.status(409).json({
      error: 'تحلیل دیگری با همین عنوان منتشر شده است. عنوان عمومی را عوض کنید.',
      code: 'title_taken'
    });
  }

  /* ---- Editorial fields, admins only ----
     A reader-supplied slug or SEO title is an editorial decision about how
     the site appears in search results, so it stays with the admin. An
     ordinary user publishing their own dilemma gets the simple form and the
     slug generated from their title, exactly as before. */
  const isAdmin = req.user.role === 'admin';

  // Minted once only, so a published address never breaks — but an admin may
  // set it explicitly the first time.
  let slug = row.slug;
  if (!slug) {
    const wanted = isAdmin ? String(req.body?.slug || '').trim() : '';
    slug = wanted ? uniqueSlug(wanted, row.id) : uniqueSlug(publicTitle, row.id);
  }

  let sections = {};
  try { sections = JSON.parse(row.sections) || {}; } catch {}
  const summary = publicSummary || metaDescription(sections.reframe || row.dilemma);

  const editorial = isAdmin
    ? {
        category_id: req.body?.category_id ? Number(req.body.category_id) || null : (row.category_id ?? null),
        seo_title: pick(req.body?.seo_title, row.seo_title).slice(0, 70) || null,
        h1: pick(req.body?.h1, row.h1).slice(0, 120) || null,
        tags: req.body?.tags !== undefined
          ? JSON.stringify(parseTags(req.body.tags))
          : (row.tags ?? null)
      }
    : {
        category_id: row.category_id ?? null,
        seo_title: row.seo_title ?? null,
        h1: row.h1 ?? null,
        tags: row.tags ?? null
      };

  db.prepare(`UPDATE analyses SET is_public = 1, slug = ?,
              published_at = COALESCE(published_at, datetime('now')),
              public_title = ?, public_summary = ?, public_author = ?,
              category_id = ?, seo_title = ?, h1 = ?, tags = ?
              WHERE id = ?`)
    .run(slug, publicTitle, summary, publicAuthor || null,
         editorial.category_id, editorial.seo_title, editorial.h1, editorial.tags, row.id);

  audit(req.user.id, 'analysis_publish',
        { id: row.id, slug, editorial: isAdmin, category: editorial.category_id }, req.ip);

  const out = db.prepare(`
    SELECT is_public, slug, published_at, public_title, public_summary, public_author,
           category_id, seo_title, h1, tags, views
    FROM analyses WHERE id = ?`).get(row.id);

  res.json({ ok: true, isPublic: true, url: `/a/${encodeURIComponent(slug)}`,
             ...out, tags: readTags(out.tags) });
});

router.post('/:id/title', (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 120);
  if (!title) return res.status(400).json({ error: 'عنوان نمی‌تواند خالی باشد.' });
  const info = db.prepare('UPDATE analyses SET title = ? WHERE id = ? AND user_id = ?')
                 .run(title, req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'تحلیل یافت نشد.' });
  res.json({ ok: true, title });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM analyses WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (!info.changes) return res.status(404).json({ error: 'تحلیل یافت نشد.' });
  res.json({ ok: true });
});

router.get('/:id/export', (req, res) => {
  const row = db.prepare('SELECT * FROM analyses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'تحلیل یافت نشد.' });
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="analysis-${row.id}.md"`);

  const reflection = row.reflected_at
    ? `\n\n---\n\n## بازنگری — ثبت‌شده در ${row.reflected_at}\n\n` +
      `**تصمیمی که گرفتم:** ${row.decision || '—'}\n\n${row.reflection || ''}\n`
    : '';

  res.send(
    `# ${row.title}\n\n` +
    `**تاریخ:** ${row.created_at}\n**مدل:** ${row.model}\n\n` +
    `## شرح دوراهی\n\n${row.dilemma}\n\n---\n\n` +
    `${row.raw_output || ''}${reflection}\n`
  );
});

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}
