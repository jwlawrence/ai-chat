import type { Actor } from '@/lib/budget/identity';
import { postflight } from '@/lib/budget/postflight';
import { addUsageToSession } from '@/lib/db/queries';

export interface OnFinishDeps {
  actor: Actor | null;
  modelId: string;
  byok: boolean;
  day: string;
  sessionId: string;
  userId: string | null;
  isAborted: () => boolean;
}

/**
 * Build the inner streamText onFinish handler.
 *
 * Invariant: postflight must run unconditionally so the ledger reflects spend
 * Azure billed even when the client aborted. addUsageToSession (UI-only session
 * badge) gates on isAborted() because aborted turns never show an answer.
 */
export function createStreamOnFinish(deps: OnFinishDeps) {
  return async ({
    totalUsage,
  }: {
    totalUsage: {
      inputTokens?: number;
      outputTokens?: number;
      cachedInputTokens?: number;
      totalTokens?: number;
    };
  }) => {
    const tokens = {
      tokensIn: totalUsage.inputTokens ?? 0,
      tokensOut: totalUsage.outputTokens ?? 0,
      tokensCached: totalUsage.cachedInputTokens ?? 0,
    };
    try {
      await postflight({
        actor: deps.actor,
        modelId: deps.modelId,
        ...tokens,
        byok: deps.byok,
        day: deps.day,
      });
    } catch (err) {
      console.error('[postflight] outer wrapper caught unexpected throw', err);
    }
    if (deps.isAborted()) return;
    try {
      await addUsageToSession(deps.sessionId, deps.userId, tokens);
    } catch (err) {
      console.error('[chat] addUsageToSession failed', err);
    }
  };
}
