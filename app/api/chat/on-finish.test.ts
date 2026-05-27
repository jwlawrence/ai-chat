import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/budget/postflight', () => ({ postflight: vi.fn(async () => {}) }));
vi.mock('@/lib/db/queries', () => ({ addUsageToSession: vi.fn(async () => {}) }));

import { postflight } from '@/lib/budget/postflight';
import { addUsageToSession } from '@/lib/db/queries';
import { createStreamOnFinish } from './on-finish';

const FAKE_USAGE = {
  inputTokens: 100,
  outputTokens: 50,
  cachedInputTokens: 20,
  totalTokens: 150,
};

function deps(overrides: Partial<Parameters<typeof createStreamOnFinish>[0]> = {}) {
  return {
    actor: { actorKind: 'user' as const, actorId: 'u1' },
    modelId: 'gpt-5.4-mini',
    byok: false,
    day: '2026-05-27',
    sessionId: 'sess-1',
    userId: 'u1',
    isAborted: () => false,
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

describe('createStreamOnFinish', () => {
  it('runs postflight then addUsageToSession on normal completion', async () => {
    const onFinish = createStreamOnFinish(deps());
    await onFinish({ totalUsage: FAKE_USAGE });
    expect(postflight).toHaveBeenCalledTimes(1);
    expect(addUsageToSession).toHaveBeenCalledTimes(1);
  });

  it('runs postflight but SKIPS addUsageToSession when aborted', async () => {
    // Invariant: Azure billed, ledger must record; session badge can stay stale.
    const onFinish = createStreamOnFinish(deps({ isAborted: () => true }));
    await onFinish({ totalUsage: FAKE_USAGE });
    expect(postflight).toHaveBeenCalledTimes(1);
    expect(addUsageToSession).not.toHaveBeenCalled();
  });

  it('forwards day to postflight (day-pinning invariant)', async () => {
    const onFinish = createStreamOnFinish(deps({ day: '2026-01-01' }));
    await onFinish({ totalUsage: FAKE_USAGE });
    expect(postflight).toHaveBeenCalledWith(expect.objectContaining({ day: '2026-01-01' }));
  });

  it('swallows postflight throw and still gates session badge correctly', async () => {
    vi.mocked(postflight).mockRejectedValueOnce(new Error('boom'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onFinish = createStreamOnFinish(deps());
    await onFinish({ totalUsage: FAKE_USAGE });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[postflight] outer wrapper'),
      expect.any(Error),
    );
    // Even though postflight threw, the session badge update still proceeds (not aborted).
    expect(addUsageToSession).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('forwards zero tokens correctly (model refusal path)', async () => {
    const onFinish = createStreamOnFinish(deps());
    await onFinish({
      totalUsage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, totalTokens: 0 },
    });
    expect(postflight).toHaveBeenCalledWith(
      expect.objectContaining({ tokensIn: 0, tokensOut: 0, tokensCached: 0 }),
    );
  });
});
