import { db } from '../db.js';
import { GUIDE_SEED } from './guide-content.js';

/**
 * Encyclopedia content.
 *
 * The text lives in the database and admins edit it from the panel. Factory
 * content is seeded once only; re-running seed after that overwrites
 * nothing — otherwise every version update would wipe out the admin's
 * work.
 */

const KINDS = ['prose', 'phase', 'lens', 'gate', 'experiment'];

function parse(row) {
  let extra = {};
  try { extra = row.extra ? JSON.parse(row.extra) : {}; } catch { extra = {}; }
  return { ...row, extra, enabled: !!row.enabled };
}

export function seedGuide() {
  const ins = db.prepare(`
    INSERT INTO guide_sections (key, kind, title, subtitle, lead, body, extra, sort_order)
    VALUES (@key, @kind, @title, @subtitle, @lead, @body, @extra, @sort)
    ON CONFLICT(key) DO NOTHING`);

  let added = 0;
  db.transaction(() => {
    for (const s of GUIDE_SEED) {
      const r = ins.run({
        key: s.key, kind: s.kind, title: s.title,
        subtitle: s.subtitle || '', lead: s.lead || '', body: s.body || '',
        extra: JSON.stringify(s.extra || {}), sort: s.sort
      });
      if (r.changes) added++;
    }
  })();

  if (added) console.log(`[seed] added ${added} encyclopedia section(s).`);
  return added;
}

/** Every section, grouped by kind — for rendering the page */
export function guideContent({ includeDisabled = false } = {}) {
  const rows = db.prepare(`
    SELECT * FROM guide_sections
    ${includeDisabled ? '' : 'WHERE enabled = 1'}
    ORDER BY kind, sort_order, id`).all().map(parse);

  const out = { prose: {}, phases: [], lenses: [], gates: [], experiments: [] };
  for (const r of rows) {
    if (r.kind === 'prose') out.prose[r.key.replace(/^intro:/, '')] = r;
    else if (r.kind === 'phase') out.phases.push(r);
    else if (r.kind === 'lens') out.lenses.push(r);
    else if (r.kind === 'gate') out.gates.push(r);
    else if (r.kind === 'experiment') out.experiments.push(r);
  }
  return out;
}

/** Flat list for the admin panel */
export function listSections() {
  return db.prepare('SELECT * FROM guide_sections ORDER BY kind, sort_order, id')
           .all().map(parse);
}

export function getSection(id) {
  const row = db.prepare('SELECT * FROM guide_sections WHERE id = ?').get(id);
  return row ? parse(row) : null;
}

export function updateSection(id, patch, userId) {
  const cur = getSection(id);
  if (!cur) return null;

  const extra = patch.extra !== undefined
    ? (typeof patch.extra === 'string' ? patch.extra : JSON.stringify(patch.extra))
    : JSON.stringify(cur.extra);

  db.prepare(`
    UPDATE guide_sections SET
      title = ?, subtitle = ?, lead = ?, body = ?, extra = ?,
      sort_order = ?, enabled = ?, updated_at = datetime('now'), updated_by = ?
    WHERE id = ?`)
    .run(
      String(patch.title ?? cur.title).slice(0, 300),
      String(patch.subtitle ?? cur.subtitle ?? '').slice(0, 300),
      String(patch.lead ?? cur.lead ?? '').slice(0, 1000),
      String(patch.body ?? cur.body ?? '').slice(0, 20000),
      extra,
      Number(patch.sort_order ?? cur.sort_order),
      patch.enabled === undefined ? (cur.enabled ? 1 : 0) : (patch.enabled ? 1 : 0),
      userId ?? null,
      id
    );

  return getSection(id);
}

export function createSection(data, userId) {
  const kind = KINDS.includes(data.kind) ? data.kind : 'prose';
  const base = String(data.key || '').trim().replace(/[^a-zA-Z0-9:_-]/g, '') ||
               `${kind}:custom-${Date.now().toString(36)}`;

  // On a duplicate key, add a suffix
  let key = base, i = 2;
  while (db.prepare('SELECT 1 FROM guide_sections WHERE key = ?').get(key)) key = `${base}-${i++}`;

  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order), 0) m FROM guide_sections WHERE kind = ?')
                    .get(kind).m;

  const info = db.prepare(`
    INSERT INTO guide_sections (key, kind, title, subtitle, lead, body, extra, sort_order, updated_by)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(key, kind,
         String(data.title || 'بخش تازه').slice(0, 300),
         String(data.subtitle || '').slice(0, 300),
         String(data.lead || '').slice(0, 1000),
         String(data.body || '').slice(0, 20000),
         JSON.stringify(data.extra || {}),
         maxSort + 10, userId ?? null);

  return getSection(Number(info.lastInsertRowid));
}

export function deleteSection(id) {
  return db.prepare('DELETE FROM guide_sections WHERE id = ?').run(id).changes > 0;
}

/** Restore one section to its factory text */
export function resetSection(id, userId) {
  const cur = getSection(id);
  if (!cur) return null;
  const factory = GUIDE_SEED.find(s => s.key === cur.key);
  if (!factory) return { notFactory: true };

  return updateSection(id, {
    title: factory.title, subtitle: factory.subtitle || '',
    lead: factory.lead || '', body: factory.body || '',
    extra: factory.extra || {}, sort_order: factory.sort, enabled: true
  }, userId);
}

/** Does this section differ from the factory text? */
export function isModified(section) {
  const factory = GUIDE_SEED.find(s => s.key === section.key);
  if (!factory) return true;
  return factory.title !== section.title ||
         (factory.body || '') !== (section.body || '') ||
         (factory.lead || '') !== (section.lead || '') ||
         JSON.stringify(factory.extra || {}) !== JSON.stringify(section.extra || {});
}
