import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn(async () => null),
}));

vi.mock('@/lib/db/usage-ledger', () => ({
  sumActorSpendToday: vi.fn(async () => 0),
}));

vi.mock('@/lib/budget/preflight', () => ({
  CAPS: { userDailyUsd: 1 },
}));

import { getUserId } from '@/lib/auth';
import { sumActorSpendToday } from '@/lib/db/usage-ledger';
import { GET } from './route';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/budget', () => {
  it('returns usedFraction for a logged-in user with partial spend', async () => {
    vi.mocked(getUserId).mockResolvedValueOnce('user-123');
    vi.mocked(sumActorSpendToday).mockResolvedValueOnce(0.27);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.usedFraction).toBeCloseTo(0.27);
    expect(Object.keys(body)).toEqual(['usedFraction']);
    expect(body).not.toHaveProperty('spent');
    expect(body).not.toHaveProperty('cap');
  });

  it('returns usedFraction 0 when user is not logged in', async () => {
    vi.mocked(getUserId).mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ usedFraction: 0 });
    expect(sumActorSpendToday).not.toHaveBeenCalled();
  });

  it('sets Cache-Control: no-store header', async () => {
    vi.mocked(getUserId).mockResolvedValueOnce(null);

    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
