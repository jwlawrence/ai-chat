/**
 * Postflight ledger writer — fire-and-forget after a chat turn finishes.
 *
 * Failure mode: if the ledger write fails (Neon outage, etc.), spend goes
 * unrecorded and the preflight gate's view of usage stays stale, so caps can
 * silently be exceeded during the outage window. The catch handler tags such
 * failures with `[postflight] LEDGER WRITE FAILED` so ops alerting can grep
 * for them; retry/backfill is out of scope for Phase 3.
 */
import { recordUsage } from '@/lib/db/usage-ledger';
import type { Actor } from './identity';

export interface PostflightInput {
  actor: Actor | null;
  modelId: string;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  byok: boolean;
  /** Pin the ledger row to the day preflight was checked against, to avoid
   *  cross-midnight enforcement gaps. */
  day?: string;
}

export async function postflight(input: PostflightInput): Promise<void> {
  // No actor → can't attribute spend. Phase 4's middleware will guarantee a
  // pac_anon cookie, so this branch should be empty after that ships.
  if (input.actor === null) return;

  try {
    await recordUsage({
      actorId: input.actor.actorId,
      actorKind: input.actor.actorKind,
      modelId: input.modelId,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      tokensCached: input.tokensCached,
      byok: input.byok,
      day: input.day,
    });
  } catch (err) {
    console.error('[postflight] LEDGER WRITE FAILED — budget enforcement degraded', {
      err: String(err),
      actorId: input.actor.actorId,
      actorKind: input.actor.actorKind,
      modelId: input.modelId,
      tokensIn: input.tokensIn,
      tokensOut: input.tokensOut,
      tokensCached: input.tokensCached,
      byok: input.byok,
    });
  }
}
