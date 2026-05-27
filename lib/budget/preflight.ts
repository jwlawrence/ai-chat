import {
  sumActorSpendToday,
  sumGlobalSpendThisMonth,
  sumGlobalSpendToday,
} from '@/lib/db/usage-ledger';
import type { Actor } from './identity';

function parseCapUsd(name: string, defaultUsd: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultUsd;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(
      `[budget] env var ${name}="${raw}" is not a non-negative number — refusing to start with a broken cap`,
    );
  }
  return n;
}

export const CAPS = {
  dailyGlobalUsd: parseCapUsd('CAP_DAILY_USD', 5),
  monthlyGlobalUsd: parseCapUsd('CAP_MONTHLY_USD', 30),
  anonymousDailyUsd: parseCapUsd('CAP_ANON_DAILY_USD', 0.2),
  userDailyUsd: parseCapUsd('CAP_USER_DAILY_USD', 1),
};

export type PreflightReason = 'dailyCapReached' | 'monthlyCapReached' | 'actorCapReached';

export type PreflightResult = { allow: true } | { allow: false; reason: PreflightReason };

export interface PreflightInput {
  actor: Actor | null;
  byok: boolean;
}

/**
 * Best-effort budget gate. Reads aggregated spend at request time and decides
 * allow/reject; the actual postflight write lands at end-of-stream. Concurrent
 * in-flight requests therefore share a stale read, so a burst of N parallel
 * requests can collectively exceed a cap by up to N × per-turn cost. For
 * portfolio-scale traffic this is acceptable; tighter enforcement would
 * require either a Postgres advisory lock per actor or a tentative-row write
 * at preflight time. See Phase 3 review for trade-offs.
 */
export async function preflight(input: PreflightInput): Promise<PreflightResult> {
  if (input.byok) return { allow: true };

  const [globalDaily, globalMonthly] = await Promise.all([
    sumGlobalSpendToday(),
    sumGlobalSpendThisMonth(),
  ]);

  if (globalDaily >= CAPS.dailyGlobalUsd) return { allow: false, reason: 'dailyCapReached' };
  if (globalMonthly >= CAPS.monthlyGlobalUsd) return { allow: false, reason: 'monthlyCapReached' };

  // No actor → skip per-actor enforcement. Phase 4's middleware will guarantee
  // an anonymousId cookie so this branch should never serve real traffic after
  // that phase ships; until then, global caps remain the backstop.
  if (input.actor === null) return { allow: true };

  const actorSpend = await sumActorSpendToday(input.actor.actorId);
  const actorCap = input.actor.actorKind === 'user' ? CAPS.userDailyUsd : CAPS.anonymousDailyUsd;
  if (actorSpend >= actorCap) return { allow: false, reason: 'actorCapReached' };

  return { allow: true };
}
