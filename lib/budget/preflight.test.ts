import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/usage-ledger', () => ({
  sumActorSpendToday: vi.fn(),
  sumGlobalSpendToday: vi.fn(),
  sumGlobalSpendThisMonth: vi.fn(),
}));

import {
  sumActorSpendToday,
  sumGlobalSpendThisMonth,
  sumGlobalSpendToday,
} from '@/lib/db/usage-ledger';
import { _clearCapCache } from './cap-cache';
import { preflight } from './preflight';

beforeEach(() => {
  // Clear the in-memory cap cache so tests don't bleed into each other.
  _clearCapCache();
  // Reset queued Once values then establish stable defaults.
  vi.mocked(sumActorSpendToday).mockReset().mockResolvedValue(0);
  vi.mocked(sumGlobalSpendToday).mockReset().mockResolvedValue(0);
  vi.mocked(sumGlobalSpendThisMonth).mockReset().mockResolvedValue(0);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('preflight', () => {
  it('allows when all caps under threshold', async () => {
    const r = await preflight({
      actor: { actorKind: 'user', actorId: 'u1' },
      byok: false,
    });
    expect(r.allow).toBe(true);
  });

  it('rejects with dailyCapReached when global daily ≥ $5', async () => {
    (sumGlobalSpendToday as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5.01);
    const r = await preflight({
      actor: { actorKind: 'user', actorId: 'u1' },
      byok: false,
    });
    expect(r.allow).toBe(false);
    if (!r.allow) expect(r.reason).toBe('dailyCapReached');
  });

  it('rejects with monthlyCapReached when global month ≥ $30', async () => {
    (sumGlobalSpendThisMonth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(30.01);
    const r = await preflight({
      actor: { actorKind: 'user', actorId: 'u1' },
      byok: false,
    });
    expect(r.allow).toBe(false);
    if (!r.allow) expect(r.reason).toBe('monthlyCapReached');
  });

  it('rejects anonymous actor at $0.20', async () => {
    (sumActorSpendToday as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(0.21);
    const r = await preflight({
      actor: { actorKind: 'anonymous', actorId: 'a1' },
      byok: false,
    });
    expect(r.allow).toBe(false);
    if (!r.allow) expect(r.reason).toBe('actorCapReached');
  });

  it('rejects user actor at $1.00', async () => {
    (sumActorSpendToday as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1.01);
    const r = await preflight({
      actor: { actorKind: 'user', actorId: 'u1' },
      byok: false,
    });
    expect(r.allow).toBe(false);
    if (!r.allow) expect(r.reason).toBe('actorCapReached');
  });

  it('byok bypasses all global caps', async () => {
    (sumGlobalSpendToday as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(100);
    (sumGlobalSpendThisMonth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(1000);
    const r = await preflight({
      actor: { actorKind: 'user', actorId: 'u1' },
      byok: true,
    });
    expect(r.allow).toBe(true);
  });

  it('null actor: skips per-actor check but enforces global caps', async () => {
    const r = await preflight({ actor: null, byok: false });
    expect(r.allow).toBe(true);
    expect(sumActorSpendToday).not.toHaveBeenCalled();
  });

  it('null actor still rejected when global daily cap is hit', async () => {
    (sumGlobalSpendToday as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(5.01);
    const r = await preflight({ actor: null, byok: false });
    expect(r.allow).toBe(false);
    if (!r.allow) expect(r.reason).toBe('dailyCapReached');
  });
});

describe('preflight cap-cache', () => {
  it('first call hits DB; second call within TTL returns cached deny without additional DB hit', async () => {
    (sumActorSpendToday as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0.21);

    const actor = { actorKind: 'anonymous' as const, actorId: 'anon-cache-test' };

    // First call: DB is hit, deny returned and cached.
    const r1 = await preflight({ actor, byok: false });
    expect(r1.allow).toBe(false);
    if (!r1.allow) expect(r1.reason).toBe('actorCapReached');

    // Reset mock to return 0 — if the cache short-circuits, this is never read.
    vi.mocked(sumActorSpendToday).mockReset().mockResolvedValue(0);

    // Second call within TTL: should return cached deny without hitting DB.
    const r2 = await preflight({ actor, byok: false });
    expect(r2.allow).toBe(false);
    if (!r2.allow) expect(r2.reason).toBe('actorCapReached');

    // sumActorSpendToday was NOT called again (cache short-circuited).
    expect(sumActorSpendToday).not.toHaveBeenCalled();
  });

  it('allow decisions are not cached — second call still hits DB', async () => {
    (sumActorSpendToday as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const actor = { actorKind: 'anonymous' as const, actorId: 'anon-allow-test' };

    const r1 = await preflight({ actor, byok: false });
    expect(r1.allow).toBe(true);

    const r2 = await preflight({ actor, byok: false });
    expect(r2.allow).toBe(true);

    // Both calls hit the DB (allow is not cached).
    expect(sumActorSpendToday).toHaveBeenCalledTimes(2);
  });

  it('global-cap denies are not cached — only actor-cap denies are cached', async () => {
    (sumGlobalSpendToday as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(5.01);

    const actor = { actorKind: 'anonymous' as const, actorId: 'anon-global-test' };

    const r1 = await preflight({ actor, byok: false });
    expect(r1.allow).toBe(false);
    if (!r1.allow) expect(r1.reason).toBe('dailyCapReached');

    // Reset global cap to 0 so the second call would allow — if NOT cached.
    vi.mocked(sumGlobalSpendToday).mockReset().mockResolvedValue(0);
    vi.mocked(sumGlobalSpendThisMonth).mockReset().mockResolvedValue(0);

    // Global deny was not cached, so the second call hits DB and now allows.
    const r2 = await preflight({ actor, byok: false });
    expect(r2.allow).toBe(true);
  });

  it('expired entries fall through to a fresh DB read', async () => {
    (sumActorSpendToday as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(0.21);

    const actor = { actorKind: 'anonymous' as const, actorId: 'anon-expired-test' };

    // First call populates the cache.
    await preflight({ actor, byok: false });

    // Advance time past TTL by mocking Date.now.
    const realNow = Date.now;
    vi.spyOn(Date, 'now').mockReturnValue(realNow() + 61_000);

    // Reset to allow so we can distinguish a fresh read from a cached deny.
    vi.mocked(sumActorSpendToday).mockReset().mockResolvedValue(0);

    const r2 = await preflight({ actor, byok: false });
    // Cache expired → fresh DB read → allow.
    expect(r2.allow).toBe(true);
    expect(sumActorSpendToday).toHaveBeenCalledTimes(1);

    vi.spyOn(Date, 'now').mockRestore();
  });
});
