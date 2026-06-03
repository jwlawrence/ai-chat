import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sentinel errors that let us distinguish redirect() vs notFound() calls.
class RedirectError extends Error {
  constructor(public readonly url: string) {
    super(`REDIRECT:${url}`);
    this.name = 'RedirectError';
  }
}
class NotFoundError extends Error {
  constructor() {
    super('NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectError(url);
  }),
  notFound: vi.fn(() => {
    throw new NotFoundError();
  }),
}));

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn(async () => null),
}));

vi.mock('@/lib/db/queries', () => ({
  getSession: vi.fn(async () => null),
  isUserOwnedSession: vi.fn(async () => false),
  getMessages: vi.fn(async () => []),
}));

vi.mock('@/lib/chat/anon-state', () => ({
  resolveAnonState: vi.fn(async () => ({ isAnonymous: true, hasTrust: false })),
}));

vi.mock('@/components/chat/chat', () => ({
  Chat: vi.fn(() => null),
}));

import { redirect } from 'next/navigation';
import { getUserId } from '@/lib/auth';
import { getSession, isUserOwnedSession } from '@/lib/db/queries';
import SessionPage from './page';

const SESSION_ID = '11111111-2222-3333-4444-555555555555';

describe('SessionPage — logout-and-resume routing', () => {
  beforeEach(() => vi.clearAllMocks());

  it('(a) anon + getSession→null + isUserOwnedSession→true → redirect to sign-in with callbackUrl', async () => {
    vi.mocked(getUserId).mockResolvedValueOnce(null);
    vi.mocked(getSession).mockResolvedValueOnce(null);
    vi.mocked(isUserOwnedSession).mockResolvedValueOnce(true);

    await expect(
      SessionPage({ params: Promise.resolve({ id: SESSION_ID }) }),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(redirect).toHaveBeenCalledWith(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(`/chat/${SESSION_ID}`)}`,
    );
  });

  it('(b) anon + getSession→null + isUserOwnedSession→false → notFound', async () => {
    vi.mocked(getUserId).mockResolvedValueOnce(null);
    vi.mocked(getSession).mockResolvedValueOnce(null);
    vi.mocked(isUserOwnedSession).mockResolvedValueOnce(false);

    await expect(
      SessionPage({ params: Promise.resolve({ id: SESSION_ID }) }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('(c) signed-in owner + getSession→session → renders (no redirect/notFound)', async () => {
    const mockSession = {
      id: SESSION_ID,
      userId: 'u1',
      anonymousId: null,
      title: 'Test',
      model: 'claude-sonnet-4-5',
      tokensIn: 0,
      tokensOut: 0,
      tokensCached: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(getUserId).mockResolvedValueOnce('u1');
    vi.mocked(getSession).mockResolvedValueOnce(mockSession);

    // Should not throw — no redirect or notFound
    await expect(
      SessionPage({ params: Promise.resolve({ id: SESSION_ID }) }),
    ).resolves.not.toThrow();

    expect(redirect).not.toHaveBeenCalled();
  });

  it('(d) different signed-in user + getSession→null → notFound (no existence leak)', async () => {
    vi.mocked(getUserId).mockResolvedValueOnce('u-other');
    vi.mocked(getSession).mockResolvedValueOnce(null);
    // isUserOwnedSession should NOT be called for a signed-in (non-null) user
    vi.mocked(isUserOwnedSession).mockResolvedValueOnce(true);

    await expect(
      SessionPage({ params: Promise.resolve({ id: SESSION_ID }) }),
    ).rejects.toBeInstanceOf(NotFoundError);

    // No redirect for signed-in users accessing someone else's session
    expect(redirect).not.toHaveBeenCalled();
    // isUserOwnedSession should not be consulted for signed-in users
    expect(isUserOwnedSession).not.toHaveBeenCalled();
  });
});
