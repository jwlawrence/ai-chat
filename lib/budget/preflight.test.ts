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
import { preflight } from './preflight';

beforeEach(() => {
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
