import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn(),
}));

import { cookies } from 'next/headers';
import { getUserId } from '@/lib/auth';
import { signTrust } from '@/lib/turnstile/cookie';
import { resolveAnonState } from './anon-state';

const SECRET = 'test-trust-secret-32-chars-xxxxx';

function mockCookies(map: Record<string, string>) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (map[name] ? { value: map[name] } : undefined),
  } as unknown as Awaited<ReturnType<typeof cookies>>);
}

beforeEach(() => {
  process.env.TRUST_COOKIE_SECRET = SECRET;
  vi.mocked(getUserId).mockReset();
  vi.mocked(cookies).mockReset();
});

describe('resolveAnonState', () => {
  it('signed-in user has isAnonymous=false', async () => {
    vi.mocked(getUserId).mockResolvedValue('user-1');
    mockCookies({});
    const { isAnonymous } = await resolveAnonState();
    expect(isAnonymous).toBe(false);
  });

  it('no userId and no trust cookie → anon, no trust', async () => {
    vi.mocked(getUserId).mockResolvedValue(null);
    mockCookies({});
    expect(await resolveAnonState()).toEqual({ isAnonymous: true, hasTrust: false });
  });

  it('no userId and valid trust cookie → anon with trust', async () => {
    vi.mocked(getUserId).mockResolvedValue(null);
    const now = Date.now();
    const value = await signTrust({ verifiedAt: now, expiresAt: now + 60_000 }, SECRET);
    mockCookies({ pac_trust: value });
    expect(await resolveAnonState()).toEqual({ isAnonymous: true, hasTrust: true });
  });

  it('expired trust cookie → no trust', async () => {
    vi.mocked(getUserId).mockResolvedValue(null);
    const now = Date.now();
    const value = await signTrust({ verifiedAt: now - 1_000_000, expiresAt: now - 1 }, SECRET);
    mockCookies({ pac_trust: value });
    expect(await resolveAnonState()).toEqual({ isAnonymous: true, hasTrust: false });
  });

  it('TRUST_COOKIE_SECRET missing → hasTrust false', async () => {
    delete process.env.TRUST_COOKIE_SECRET;
    vi.mocked(getUserId).mockResolvedValue(null);
    mockCookies({ pac_trust: 'some-value' });
    expect(await resolveAnonState()).toEqual({ isAnonymous: true, hasTrust: false });
  });
});
