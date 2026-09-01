import { db } from '../db.js';

/**
 * User tiers.
 *
 * Each tier carries two ceilings: analyses per day, tokens per month.
 * A user may hold an individual exception (quota_override / token_override);
 * NULL means "inherit from the tier". That way raising a tier's ceiling takes
 * effect for every member at once, except where an exception was set
 * explicitly for someone.
 * Model access is per tier too: min_tier='premium' hides a model from basic users.
 */

export const TIER_ORDER = ['basic', 'premium'];

/** Tier rank — used to compare access levels */
export function tierRank(key) {
  const i = TIER_ORDER.indexOf(String(key || 'basic'));
  return i < 0 ? 0 : i;
}

export function listTiers() {
  return db.prepare('SELECT * FROM tiers ORDER BY sort_order, id').all();
}

export function getTier(key) {
  return db.prepare('SELECT * FROM tiers WHERE key = ?').get(String(key || 'basic'))
      || db.prepare('SELECT * FROM tiers ORDER BY sort_order LIMIT 1').get()
      || { key: 'basic', label: 'عادی', daily_quota: 10, monthly_tokens: 0 };
}

/** A user's effective ceilings: individual exception, otherwise the tier's */
export function limitsFor(user) {
  const tier = getTier(user?.tier);
  const dailyQuota = user?.quota_override ?? tier.daily_quota;
  const monthlyTokens = user?.token_override ?? tier.monthly_tokens;
  return {
    tier,
    dailyQuota,
    monthlyTokens,                                   // 0 = unlimited
    quotaIsOverride: user?.quota_override != null,
    tokensIsOverride: user?.token_override != null
  };
}

/** Usage so far today and this month */
export function usageFor(userId) {
  const today = db.prepare(
    `SELECT COUNT(*) c FROM analyses
     WHERE user_id = ? AND date(created_at) = date('now')`).get(userId).c;

  const month = db.prepare(
    `SELECT COUNT(*) analyses,
            COALESCE(SUM(tokens_in), 0)  tokensIn,
            COALESCE(SUM(tokens_out), 0) tokensOut
     FROM analyses
     WHERE user_id = ? AND created_at >= datetime('now','start of month')`).get(userId);

  const total = db.prepare(
    `SELECT COALESCE(SUM(tokens_in + tokens_out), 0) t FROM analyses WHERE user_id = ?`
  ).get(userId).t;

  return {
    today,
    monthAnalyses: month.analyses,
    monthTokens: month.tokensIn + month.tokensOut,
    monthTokensIn: month.tokensIn,
    monthTokensOut: month.tokensOut,
    totalTokens: total
  };
}

/** Is the user allowed to start another analysis? */
export function checkAllowance(user) {
  const limits = limitsFor(user);
  const usage = usageFor(user.id);

  if (limits.dailyQuota > 0 && usage.today >= limits.dailyQuota) {
    return {
      ok: false,
      reason: 'daily',
      error: `سهمیه امروز شما (${limits.dailyQuota} تحلیل) تمام شده است. فردا دوباره تلاش کنید.`
    };
  }

  if (limits.monthlyTokens > 0 && usage.monthTokens >= limits.monthlyTokens) {
    return {
      ok: false,
      reason: 'tokens',
      error: `سقف توکن ماهانه گروه «${limits.tier.label}» تمام شده است. با مدیر سامانه تماس بگیرید.`
    };
  }

  return { ok: true, limits, usage };
}

/** Summary shipped to the client */
export function allowanceSummary(user) {
  const limits = limitsFor(user);
  const usage = usageFor(user.id);
  return {
    tier: { key: limits.tier.key, label: limits.tier.label },
    daily: {
      used: usage.today,
      limit: limits.dailyQuota,
      remaining: limits.dailyQuota > 0 ? Math.max(0, limits.dailyQuota - usage.today) : null,
      isOverride: limits.quotaIsOverride
    },
    tokens: {
      used: usage.monthTokens,
      limit: limits.monthlyTokens,                   // 0 = unlimited
      remaining: limits.monthlyTokens > 0 ? Math.max(0, limits.monthlyTokens - usage.monthTokens) : null,
      percent: limits.monthlyTokens > 0
        ? Math.min(100, Math.round((usage.monthTokens / limits.monthlyTokens) * 100)) : null,
      isOverride: limits.tokensIsOverride,
      totalAllTime: usage.totalTokens
    }
  };
}

/** Usage across all users — for the admin panel */
export function usageByUser() {
  return db.prepare(`
    SELECT u.id,
           COUNT(a.id) analyses,
           COALESCE(SUM(a.tokens_in + a.tokens_out), 0) totalTokens,
           COALESCE(SUM(CASE WHEN a.created_at >= datetime('now','start of month')
                             THEN a.tokens_in + a.tokens_out ELSE 0 END), 0) monthTokens,
           SUM(CASE WHEN date(a.created_at) = date('now') THEN 1 ELSE 0 END) todayAnalyses
    FROM users u LEFT JOIN analyses a ON a.user_id = u.id
    GROUP BY u.id`).all();
}
