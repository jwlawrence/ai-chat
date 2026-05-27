import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn(),
}));

vi.mock('@/lib/db/queries', () => ({
  renameSession: vi.fn(),
  deleteSession: vi.fn(),
}));

import { getUserId } from '@/lib/auth';
import { deleteSession, renameSession } from '@/lib/db/queries';
import { DELETE, PATCH } from './route';

function makeReq(body?: unknown) {
  return new Request('http://localhost/api/sessions/abc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('PATCH /api/sessions/[id]', () => {
  beforeEach(() => {
    vi.mocked(getUserId).mockReset();
    vi.mocked(renameSession).mockReset();
  });

  it('passes userId from getUserId to renameSession', async () => {
    vi.mocked(getUserId).mockResolvedValue('user-A');
    const params = Promise.resolve({ id: 'abc' });
    await PATCH(makeReq({ title: 'New' }), { params });
    expect(renameSession).toHaveBeenCalledWith('abc', 'New', 'user-A');
  });

  it('passes null userId to renameSession for unauthenticated callers', async () => {
    vi.mocked(getUserId).mockResolvedValue(null);
    const params = Promise.resolve({ id: 'abc' });
    await PATCH(makeReq({ title: 'New' }), { params });
    expect(renameSession).toHaveBeenCalledWith('abc', 'New', null);
  });

  it('returns 400 on invalid body (empty title fails zod)', async () => {
    vi.mocked(getUserId).mockResolvedValue('user-A');
    const params = Promise.resolve({ id: 'abc' });
    const res = await PATCH(makeReq({ title: '' }), { params });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/sessions/[id]', () => {
  beforeEach(() => {
    vi.mocked(getUserId).mockReset();
    vi.mocked(deleteSession).mockReset();
  });

  it('passes userId from getUserId to deleteSession', async () => {
    vi.mocked(getUserId).mockResolvedValue('user-A');
    const params = Promise.resolve({ id: 'abc' });
    await DELETE(new Request('http://localhost/api/sessions/abc', { method: 'DELETE' }), {
      params,
    });
    expect(deleteSession).toHaveBeenCalledWith('abc', 'user-A');
  });
});
