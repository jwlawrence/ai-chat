import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn(),
}));

vi.mock('@/lib/db/queries', () => ({
  listSessions: vi.fn(),
}));

import { getUserId } from '@/lib/auth';
import { listSessions } from '@/lib/db/queries';
import { GET } from './route';

describe('GET /api/sessions', () => {
  beforeEach(() => {
    vi.mocked(getUserId).mockReset();
    vi.mocked(listSessions).mockReset();
  });

  it('calls listSessions with null userId for an unauthenticated request', async () => {
    vi.mocked(getUserId).mockResolvedValue(null);
    vi.mocked(listSessions).mockResolvedValue([]);
    const res = await GET();
    expect(listSessions).toHaveBeenCalledWith(null);
    expect(res.status).toBe(200);
  });

  it('calls listSessions with the resolved userId for a signed-in request', async () => {
    vi.mocked(getUserId).mockResolvedValue('user-A');
    vi.mocked(listSessions).mockResolvedValue([]);
    await GET();
    expect(listSessions).toHaveBeenCalledWith('user-A');
  });
});
