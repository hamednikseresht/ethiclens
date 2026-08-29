import session from 'express-session';
import { db } from './db.js';

const Store = session.Store;

export class SqliteStore extends Store {
  constructor() {
    super();
    this.get_ = db.prepare('SELECT data, expires FROM sessions WHERE sid = ?');
    this.set_ = db.prepare(`INSERT INTO sessions (sid, data, expires) VALUES (?,?,?)
                            ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expires = excluded.expires`);
    this.del_ = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.gc_  = db.prepare('DELETE FROM sessions WHERE expires < ?');
    setInterval(() => { try { this.gc_.run(Date.now()); } catch {} }, 15 * 60 * 1000).unref();
  }

  get(sid, cb) {
    try {
      const row = this.get_.get(sid);
      if (!row) return cb(null, null);
      if (row.expires < Date.now()) { this.del_.run(sid); return cb(null, null); }
      cb(null, JSON.parse(row.data));
    } catch (e) { cb(e); }
  }

  set(sid, sess, cb) {
    try {
      const ttl = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 86400000 * 30;
      this.set_.run(sid, JSON.stringify(sess), ttl);
      cb?.(null);
    } catch (e) { cb?.(e); }
  }

  destroy(sid, cb) {
    try { this.del_.run(sid); cb?.(null); } catch (e) { cb?.(e); }
  }

  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}
