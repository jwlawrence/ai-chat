import { beforeEach, describe, expect, it, vi } from 'vitest';
import { specSchema } from '@/lib/ai/tools/render-ui';
import { signTrust } from '@/lib/turnstile/cookie';

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn(async () => null),
}));

vi.mock('@/lib/budget/preflight', () => ({
  preflight: vi.fn(),
  CAPS: { dailyGlobalUsd: 5, monthlyGlobalUsd: 30, anonymousDailyUsd: 0.2, userDailyUsd: 1 },
}));

// Mock providers because @/lib/ai/providers evaluates createAzure() at module
// load time and requires AZURE_FOUNDRY_BASE_URL/API_KEY. These tests all exit
// before streamText runs, so getModel is never invoked. If a future test
// exercises the allow path, replace this stub with a real model factory.
vi.mock('@/lib/ai/providers', () => ({
  getModel: vi.fn(),
}));

vi.mock('@/lib/db/usage-ledger', () => ({
  recordUsage: vi.fn(async () => {}),
  sumActorSpendToday: vi.fn(async () => 0),
  sumGlobalSpendToday: vi.fn(async () => 0),
  sumGlobalSpendThisMonth: vi.fn(async () => 0),
}));

vi.mock('@/lib/db/queries', () => ({
  getSession: vi.fn(async () => null),
  createSession: vi.fn(async () => ({ id: 'wall-session-123' })),
  countMessages: vi.fn(async () => 0),
  appendMessages: vi.fn(async () => {}),
  touchSession: vi.fn(async () => {}),
  trimTrailingMessages: vi.fn(async () => {}),
  renameSession: vi.fn(async () => {}),
  addUsageToSession: vi.fn(async () => {}),
}));

import { getUserId } from '@/lib/auth';
import { preflight } from '@/lib/budget/preflight';
import { addUsageToSession, appendMessages, createSession } from '@/lib/db/queries';
import { POST } from './route';

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

async function chatRequest(
  overrides: { messages?: unknown[]; headers?: Record<string, string>; skipTrust?: boolean } = {},
) {
  const trustCookie = overrides.skipTrust ? '' : `pac_trust=${await freshTrustCookie()}`;
  return new Request('http://test/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-anonymous-id': 'anon-test',
      ...(trustCookie ? { cookie: trustCookie } : {}),
      ...overrides.headers,
    },
    body: JSON.stringify({
      messages: overrides.messages ?? [
        { role: 'user', parts: [{ type: 'text', text: 'hi' }], metadata: { chipId: 'dashboard' } },
      ],
    }),
  });
}

describe('chat route preflight gating', () => {
  it('returns 429 with reason when preflight rejects with dailyCapReached', async () => {
    vi.mocked(preflight).mockResolvedValueOnce({ allow: false, reason: 'dailyCapReached' });
    const res = await POST(await chatRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: 'quota', reason: 'dailyCapReached' });
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('returns 429 with actorCapReached for authenticated users who breach their cap', async () => {
    vi.mocked(getUserId).mockResolvedValueOnce('user-fixture');
    vi.mocked(preflight).mockResolvedValueOnce({ allow: false, reason: 'actorCapReached' });
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: 'quota', reason: 'actorCapReached' });
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('returns 503 with preflightFailure when preflight throws', async () => {
    vi.mocked(preflight).mockRejectedValueOnce(new Error('neon down'));
    // Silence the expected console.error so test output stays clean.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(await chatRequest());
    spy.mockRestore();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: 'service_unavailable', reason: 'preflightFailure' });
  });

  it('treats x-anonymous-id longer than 128 chars as not-present (graceful degradation)', async () => {
    vi.mocked(preflight).mockResolvedValueOnce({ allow: false, reason: 'dailyCapReached' });
    const res = await POST(await chatRequest({ headers: { 'x-anonymous-id': 'a'.repeat(200) } }));
    // Still reaches the quota gate — preflight ran, returned 429
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('returns 403 turnstileRequired when anonymous without a pac_trust cookie', async () => {
    const req = await chatRequest({ skipTrust: true });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'turnstileRequired' });
  });

  it('returns 403 chipRequired when anonymous user message lacks a known chipId', async () => {
    const req = await chatRequest({
      messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] /* no metadata */ }],
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'chipRequired' });
  });

  it('returns 403 chipRequired when chipId is not a known chip', async () => {
    const req = await chatRequest({
      messages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: 'hi' }],
          metadata: { chipId: 'not-a-real-chip' },
        },
      ],
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'chipRequired' });
  });

  it('skips chip gate for signed-in users', async () => {
    vi.mocked(getUserId).mockResolvedValueOnce('user-fixture');
    vi.mocked(preflight).mockResolvedValueOnce({ allow: false, reason: 'dailyCapReached' });
    // No chipId, no trust cookie — but user is signed in, so both gates skipped.
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    });
    const res = await POST(req);
    // We expect to reach preflight, which is mocked to deny → 429.
    expect(res.status).toBe(429);
  });
});

describe('chat route — anonymous quota-wall injects sign-in card', () => {
  beforeEach(() => vi.clearAllMocks());

  it('on anon + actorCapReached, returns 200 stream containing tool-renderUI + signInWith', async () => {
    vi.mocked(preflight).mockResolvedValueOnce({ allow: false, reason: 'actorCapReached' });

    const res = await POST(await chatRequest());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('tool-input-available');
    expect(body).toContain('renderUI');
    expect(body).toContain('signInWith');
    expect(body).toContain('"provider":"google"');
    expect(body).toContain('"provider":"github"');

    // Parse the SSE stream (each line is `data: <JSON>\n`) and find the
    // tool-output-available frame. Assert its `output` is a valid spec.
    const frames = body
      .split('\n')
      .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
      .map((line) => {
        try {
          return JSON.parse(line.slice('data: '.length)) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Record<string, unknown>[];

    const outputFrame = frames.find((f) => f.type === 'tool-output-available');
    expect(outputFrame).toBeDefined();
    if (outputFrame) {
      const result = specSchema.safeParse(outputFrame.output);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.root).toBe('card');
      }
    }
  });

  it('still returns 429 for anon + dailyCapReached (no card injection)', async () => {
    vi.mocked(preflight).mockResolvedValueOnce({ allow: false, reason: 'dailyCapReached' });

    const res = await POST(await chatRequest());
    expect(res.status).toBe(429);
  });

  it('wall path persists the user message + card to a new session', async () => {
    vi.mocked(preflight).mockResolvedValueOnce({ allow: false, reason: 'actorCapReached' });
    vi.mocked(createSession).mockResolvedValueOnce({
      id: 'wall-session-123',
      model: 'gpt-4o',
      userId: null,
      anonymousId: 'anon-test',
      title: 'New chat',
      tokensIn: 0,
      tokensOut: 0,
      tokensCached: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const appendSpy = vi.mocked(appendMessages);

    const res = await POST(await chatRequest());
    expect(res.status).toBe(200);

    // Stream should contain a data-session frame with the new session id.
    const body = await res.text();
    expect(body).toContain('"id":"wall-session-123"');
    expect(body).toContain('"isNew":true');

    // appendMessages should have been called with the wall session and content
    // that includes a user message part + an assistant tool-renderUI part.
    expect(appendSpy).toHaveBeenCalledOnce();
    const [sessionId, , messages] = appendSpy.mock.calls[0];
    expect(sessionId).toBe('wall-session-123');
    expect(messages.length).toBeGreaterThanOrEqual(2);
    const assistantMsg = messages.find((m) => m.role === 'assistant');
    expect(assistantMsg).toBeDefined();
    const renderPart = (assistantMsg?.parts as Array<{ type: string }> | undefined)?.find(
      (p) => p.type === 'tool-renderUI',
    );
    expect(renderPart).toBeDefined();

    expect(addUsageToSession).not.toHaveBeenCalled();
  });

  it('does NOT write to the usage ledger on the quota-wall branch', async () => {
    vi.mocked(preflight).mockResolvedValueOnce({ allow: false, reason: 'actorCapReached' });

    const { recordUsage } = await import('@/lib/db/usage-ledger');
    await POST(await chatRequest());
    expect(recordUsage).not.toHaveBeenCalled();
  });
});
