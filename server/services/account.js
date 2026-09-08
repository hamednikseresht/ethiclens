import { db, audit } from '../db.js';
import { readTags } from './categories.js';

/**
 * Erasing and exporting an account.
 *
 * Two rights with two different shapes. Google Play requires that an account
 * created in an app can be deleted from it, and that the deletion is real
 * rather than a disabled flag. GDPR article 17 asks for the same and article
 * 20 asks for a copy in a structured, machine-readable form.
 *
 * The delete is not a single statement. `DELETE FROM users` cascades to
 * analyses and email tokens, but it leaves two things behind that are
 * personal data on their own:
 *
 *   - audit_log rows. The foreign key is ON DELETE SET NULL, so the rows
 *     survive holding the IP address, and some carry the email inside
 *     `detail` — registration writes one, and so does an admin deleting a
 *     user. Severing the id is not erasure while the address and the email
 *     are still in the row.
 *
 *   - sessions. There is no foreign key at all, so a signed-in session
 *     outlives the account it belongs to.
 *
 * Everything runs in one transaction: a half-erased account is worse than
 * either outcome, because nothing on screen would say which half.
 */

/** Tables scrubbed by erase(), for the confirmation the caller shows. */
export function accountFootprint(userId) {
  const one = (sql, ...p) => db.prepare(sql).get(...p).c;
  return {
    analyses:  one('SELECT COUNT(*) c FROM analyses WHERE user_id = ?', userId),
    published: one('SELECT COUNT(*) c FROM analyses WHERE user_id = ? AND is_public = 1', userId),
    events:    one('SELECT COUNT(*) c FROM audit_log WHERE user_id = ?', userId)
  };
}

/**
 * Everything the account holds, as JSON — GDPR article 20.
 *
 * The raw model output and the parsed sections are both included: the first
 * is what the service received, the second is what it showed, and a copy that
 * omitted either would not be the whole record.
 */
export function exportAccount(user) {
  const rows = db.prepare(`
    SELECT a.*, c.slug AS category_slug, c.title AS category_title
    FROM analyses a LEFT JOIN categories c ON c.id = a.category_id
    WHERE a.user_id = ? ORDER BY a.created_at`).all(user.id);

  const safeJson = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

  return {
    exportedAt: new Date().toISOString(),
    format: 'ethiclens-account-export/1',
    account: {
      email: user.email,
      name: user.name,
      firstName: user.first_name || null,
      lastName: user.last_name || null,
      role: user.role,
      tier: user.tier,
      status: user.status,
      emailVerified: Boolean(user.email_verified),
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at || null
    },
    analyses: rows.map(r => ({
      id: r.id,
      title: r.title,
      dilemma: r.dilemma,
      context: safeJson(r.context, {}),
      model: r.model,
      status: r.status,
      createdAt: r.created_at,
      durationMs: r.duration_ms,
      tokens: { in: r.tokens_in, out: r.tokens_out },
      sections: safeJson(r.sections, {}),
      rawOutput: r.raw_output,
      isFavorite: Boolean(r.is_favorite),
      decision: r.decision || null,
      reflection: r.reflection || null,
      reflectedAt: r.reflected_at || null,
      published: Boolean(r.is_public) ? {
        slug: r.slug,
        title: r.public_title,
        summary: r.public_summary,
        author: r.public_author,
        publishedAt: r.published_at,
        views: r.views,
        category: r.category_slug ? { slug: r.category_slug, title: r.category_title } : null,
        tags: readTags(r.tags)
      } : null
    })),
    // Named so it is clear this is not everything the service ever logged —
    // only what is still attached to this account at the moment of export.
    securityEvents: db.prepare(
      `SELECT action, detail, created_at FROM audit_log WHERE user_id = ? ORDER BY created_at`
    ).all(user.id).map(e => ({ action: e.action, detail: safeJson(e.detail, e.detail), at: e.created_at }))
  };
}

/**
 * Erase the account and everything personal attached to it.
 *
 * Published analyses go with it. They were the user's to publish and are the
 * user's to withdraw, and erasure that left their writing on a public,
 * indexed page would not be erasure. Their addresses start returning 404,
 * which is the same thing that already happens when an analysis is
 * unpublished.
 *
 * One anonymous row is written afterwards recording that a deletion
 * happened — no id, no email, no address. Without it an operator watching the
 * audit log sees an account vanish with nothing to say it was deliberate.
 */
export function eraseAccount(userId) {
  const before = accountFootprint(userId);
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
  if (!user) return null;

  const run = db.transaction(() => {
    // Rows belonging to the user, and rows about the user written by someone
    // else — an admin's user_delete or an approval carries the email or the
    // id in `detail`, and those are as personal as the user's own rows.
    db.prepare('DELETE FROM audit_log WHERE user_id = ?').run(userId);
    db.prepare(`DELETE FROM audit_log
                WHERE detail LIKE ? OR json_extract(detail, '$.targetId') = ?`)
      .run(`%${user.email}%`, userId);

    // No foreign key here, so nothing else would remove these. Exact match
    // through json_extract rather than LIKE, which would also match user 12
    // when erasing user 1.
    db.prepare(`DELETE FROM sessions WHERE json_extract(data, '$.userId') = ?`).run(userId);

    // analyses and email_tokens follow by ON DELETE CASCADE.
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });

  run();

  audit(null, 'account_deleted', { analyses: before.analyses, published: before.published }, null);
  return before;
}
