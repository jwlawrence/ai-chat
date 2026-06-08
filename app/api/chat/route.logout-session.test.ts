import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signTrust } from '@/lib/turnstile/cookie';

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn(async () => null),
}));

vi.mock('@/lib/budget/preflight', () => ({
  preflight: vi.fn(async () => ({ allow: true })),
  CAPS: { dailyGlobalUsd: 5, monthlyGlobalUsd: 30, anonymousDailyUsd: 0.2, userDailyUsd: 1 },
}));

vi.mock('@/lib/ai/providers', () => ({
  getModel: vi.fn(() => ({ doStream: vi.fn() })),
}));

vi.mock('@/lib/db/usage-ledger', () => ({
  recordUsage: vi.fn(async () => {}),
  sumActorSpendToday: vi.fn(async () => 0),
  sumGlobalSpendToday: vi.fn(async () => 0),
  sumGlobalSpendThisMonth: vi.fn(async () => 0),
}));

vi.mock('@/lib/db/queries', () => ({
  getSession: vi.fn(async () => null),
  isUserOwnedSession: vi.fn(async () => false),
  createSession: vi.fn(async () => ({ id: 'new-session-999' })),
  countMessages: vi.fn(async () => 0),
  appendMessages: vi.fn(async () => {}),
  touchSession: vi.fn(async () => {}),
  trimTrailingMessages: vi.fn(async () => {}),
  renameSession: vi.fn(async () => {}),
  addUsageToSession: vi.fn(async () => {}),
}));

import { getSession, isUserOwnedSession } from '@/lib/db/queries';
import { POST } from './route';

const USER_OWNED_SESSION_ID = '32790581-e8ba-42e7-af11-deed18ff6b8e';

async function freshTrustCookie(): Promise<string> {
  const secret = process.env.TRUST_COOKIE_SECRET;
  if (!secret) {
    throw new Error(
      'TRUST_COOKIE_SECRET unset in test env — tests need .env.local with the secret set',
    );
  }
  const now = Date.now();
  return signTrust({ verifiedAt: now, expiresAt: now + 60_000 }, secret);
}

async function anonRequestWithSession(sessionId: string): Promise<Request> {
  const trustCookie = `pac_trust=${await freshTrustCookie()}`;
  return new Request('http://test/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-anonymous-id': 'anon-after-logout',
      cookie: trustCookie,
    },
    body: JSON.stringify({
      sessionId,
      model: 'claude-sonnet-4-5',
      messages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: 'Hello, continuing my old chat' }],
          metadata: { chipId: 'dashboard' },
        },
      ],
    }),
  });
}

describe('chat route — logout-then-continue-session (main path)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('anon POST with user-owned sessionId → streams sign-in card, not 404', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    vi.mocked(isUserOwnedSession).mockResolvedValueOnce(true);

    const res = await POST(await anonRequestWithSession(USER_OWNED_SESSION_ID));

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('tool-input-available');
    expect(body).toContain('renderUI');
    expect(body).toContain('signInWith');
    // Card must include callbackUrl pointing back to the session
    expect(body).toContain(`/chat/${USER_OWNED_SESSION_ID}`);
  });

  it('anon POST with non-existent sessionId → still 404', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    vi.mocked(isUserOwnedSession).mockResolvedValueOnce(false);

    const res = await POST(await anonRequestWithSession(USER_OWNED_SESSION_ID));

    expect(res.status).toBe(404);
    const text = await res.text();
    expect(text).toBe('Session not found');
  });
});

describe('chat route — logout-then-continue-session (contact path)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('anon contact submit with user-owned sessionId → 404, not a sign-in card', async () => {
    // Submitting a contact form while anonymous on a user-owned session is
    // anomalous — return 404, not a silent sign-in card swap.
    vi.mocked(getSession).mockResolvedValueOnce(null);
    vi.mocked(isUserOwnedSession).mockResolvedValueOnce(true);

    const trustCookie = `pac_trust=${await freshTrustCookie()}`;
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-anonymous-id': 'anon-after-logout',
        cookie: trustCookie,
      },
      body: JSON.stringify({
        sessionId: USER_OWNED_SESSION_ID,
        messages: [
          {
            role: 'user',
            parts: [{ type: 'text', text: 'Build a form.' }],
            metadata: { chipId: 'interactive' },
          },
          {
            role: 'user',
            parts: [
              {
                type: 'data-press',
                data: {
                  action: 'submitForm',
                  label: 'Submitted contact',
                  formName: 'contact',
                  submissionId: 'sub-logout-test-1',
                  data: {
                    name: 'Jane',
                    email: 'jane@acme.com',
                    topic: 'Say hello',
                    message: 'hi',
                  },
                  mode: 'model',
                },
              },
              { type: 'text', text: '[Submitted form contact]' },
            ],
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Session not found');
  });

  it('anon contact submit with non-existent sessionId → 404', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null);
    vi.mocked(isUserOwnedSession).mockResolvedValueOnce(false);

    const trustCookie = `pac_trust=${await freshTrustCookie()}`;
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-anonymous-id': 'anon-after-logout',
        cookie: trustCookie,
      },
      body: JSON.stringify({
        sessionId: USER_OWNED_SESSION_ID,
        messages: [
          {
            role: 'user',
            parts: [{ type: 'text', text: 'Build a form.' }],
            metadata: { chipId: 'interactive' },
          },
          {
            role: 'user',
            parts: [
              {
                type: 'data-press',
                data: {
                  action: 'submitForm',
                  label: 'Submitted contact',
                  formName: 'contact',
                  submissionId: 'sub-logout-test-2',
                  data: {
                    name: 'Jane',
                    email: 'jane@acme.com',
                    topic: 'Say hello',
                    message: 'hi',
                  },
                  mode: 'model',
                },
              },
              { type: 'text', text: '[Submitted form contact]' },
            ],
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Session not found');
  });
});

describe('chat route — logout-then-continue-session (wall path)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('anon actorCapReached with user-owned sessionId → streams sign-in card (not 404)', async () => {
    const { preflight } = await import('@/lib/budget/preflight');
    vi.mocked(preflight).mockResolvedValueOnce({ allow: false, reason: 'actorCapReached' });
    vi.mocked(getSession).mockResolvedValueOnce(null);
    vi.mocked(isUserOwnedSession).mockResolvedValueOnce(true);

    const res = await POST(await anonRequestWithSession(USER_OWNED_SESSION_ID));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('tool-input-available');
    expect(body).toContain('signInWith');
    expect(body).toContain(`/chat/${USER_OWNED_SESSION_ID}`);
  });

  it('anon actorCapReached with non-existent sessionId → 404', async () => {
    const { preflight } = await import('@/lib/budget/preflight');
    vi.mocked(preflight).mockResolvedValueOnce({ allow: false, reason: 'actorCapReached' });
    vi.mocked(getSession).mockResolvedValueOnce(null);
    vi.mocked(isUserOwnedSession).mockResolvedValueOnce(false);

    const res = await POST(await anonRequestWithSession(USER_OWNED_SESSION_ID));
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Session not found');
  });
});
