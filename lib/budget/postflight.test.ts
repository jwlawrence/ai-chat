import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/usage-ledger', () => ({
  recordUsage: vi.fn(async () => {}),
}));

import { recordUsage } from '@/lib/db/usage-ledger';
import { postflight } from './postflight';

afterEach(() => {
  vi.resetAllMocks();
});

describe('postflight', () => {
  it('forwards usage to recordUsage when actor is present', async () => {
    await postflight({
      actor: { actorKind: 'user', actorId: 'u1' },
      modelId: 'gpt-5.4-mini',
      tokensIn: 100,
      tokensOut: 50,
      tokensCached: 25,
      byok: false,
    });
    expect(recordUsage).toHaveBeenCalledWith({
      actorId: 'u1',
      actorKind: 'user',
      modelId: 'gpt-5.4-mini',
      tokensIn: 100,
      tokensOut: 50,
      tokensCached: 25,
      byok: false,
      day: undefined,
    });
  });

  it('skips recordUsage when actor is null', async () => {
    await postflight({
      actor: null,
      modelId: 'gpt-5.4-mini',
      tokensIn: 100,
      tokensOut: 50,
      tokensCached: 25,
      byok: false,
    });
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('swallows ledger errors and logs', async () => {
    (recordUsage as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('db down'),
    );
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      postflight({
        actor: { actorKind: 'user', actorId: 'u1' },
        modelId: 'gpt-5.4-mini',
        tokensIn: 0,
        tokensOut: 0,
        tokensCached: 0,
        byok: false,
      }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[postflight] LEDGER WRITE FAILED'),
      expect.objectContaining({
        actorId: 'u1',
        modelId: 'gpt-5.4-mini',
        tokensIn: 0,
        tokensOut: 0,
        tokensCached: 0,
        byok: false,
      }),
    );
    spy.mockRestore();
  });

  it('forwards byok=true to recordUsage when actor is present', async () => {
    await postflight({
      actor: { actorKind: 'user', actorId: 'u1' },
      modelId: 'gpt-5.4-mini',
      tokensIn: 100,
      tokensOut: 50,
      tokensCached: 0,
      byok: true,
    });
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 'u1', byok: true }),
    );
  });
});
