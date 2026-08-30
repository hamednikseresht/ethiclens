import express from 'express';
import { db } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

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
  if (req.query.reflected === '0') where.push("reflected_at IS NULL AND status = 'done'");
  const clause = where.join(' AND ');

  const total = db.prepare(`SELECT COUNT(*) c FROM analyses WHERE ${clause}`).get(...params).c;
  const items = db.prepare(
    `SELECT id, title, model, status, is_favorite, duration_ms, created_at,
            decision, reflected_at,
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
            SUM(reflected_at IS NULL AND status = 'done') awaiting,
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
    sections: safeJson(row.sections, {})
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
 * فاز پنجم چارچوب: «اجرا و بازنگری».
 * کاربر ثبت می‌کند چه تصمیمی گرفت و بعداً چه شد — چیزی که هیچ مدلی
 * نمی‌تواند جایش را پر کند و تنها بخشِ واقعاً یادگیرنده فرایند است.
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
