import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetContactSubmitRateLimit, resetSubmissionIdClaims } from '@/lib/contact/rate-limit';
import { signTrust } from '@/lib/turnstile/cookie';

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn(async () => null),
}));

vi.mock('@/lib/budget/preflight', () => ({
  preflight: vi.fn(async () => ({ allow: true, reason: 'ok' })),
  CAPS: { dailyGlobalUsd: 5, monthlyGlobalUsd: 30, anonymousDailyUsd: 0.2, userDailyUsd: 1 },
}));

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
  createSession: vi.fn(async () => ({ id: 'contact-session-123' })),
  countMessages: vi.fn(async () => 0),
  appendMessages: vi.fn(async () => {}),
  touchSession: vi.fn(async () => {}),
  trimTrailingMessages: vi.fn(async () => {}),
  renameSession: vi.fn(async () => {}),
  addUsageToSession: vi.fn(async () => {}),
}));

import { getUserId } from '@/lib/auth';
import { appendMessages, createSession } from '@/lib/db/queries';
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

type SubmitOverrides = {
  fields?: Record<string, unknown>;
  anonymousId?: string;
  skipTrust?: boolean;
  /** Omit the preceding interactive-chip turn from the message history to
   *  exercise the chain guard. Default: include it. */
  skipChipChain?: boolean;
  /** Override the submissionId stamped on the press (idempotency tests). */
  submissionId?: string;
};

async function contactSubmitRequest(overrides: SubmitOverrides = {}) {
  const trustCookie = overrides.skipTrust ? '' : `pac_trust=${await freshTrustCookie()}`;
  const fields = overrides.fields ?? {
    name: 'Jane Doe',
    company: 'Acme',
    roleType: 'Engineering Manager',
    question: 'How fast can you ship?',
  };
  const submissionId = overrides.submissionId ?? `s-${Math.random().toString(36).slice(2)}`;
  const chipTurn = {
    role: 'user',
    parts: [{ type: 'text', text: 'Build a form.' }],
    metadata: { chipId: 'interactive' },
  };
  const submitTurn = {
    role: 'user',
    parts: [
      {
        type: 'data-press',
        data: {
          action: 'submitForm',
          label: 'Submitted contact',
          formName: 'contact',
          submissionId,
          data: fields,
          mode: 'model',
        },
      },
      { type: 'text', text: '[Submitted form contact]' },
    ],
  };
  const messages = overrides.skipChipChain ? [submitTurn] : [chipTurn, submitTurn];
  return new Request('http://test/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-anonymous-id': overrides.anonymousId ?? 'anon-contact-test',
      ...(trustCookie ? { cookie: trustCookie } : {}),
    },
    body: JSON.stringify({ messages }),
  });
}

describe('chat route — contact form submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetContactSubmitRateLimit();
    resetSubmissionIdClaims();
  });

  it('returns a 200 stream containing the deterministic auto-reply card spec', async () => {
    const res = await POST(await contactSubmitRequest());
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('tool-input-available');
    expect(body).toContain('tool-output-available');
    expect(body).toContain('Thanks, Jane.');
    expect(body).toContain("Got it: you're hiring for an Engineering Manager at Acme");
    expect(body).toContain('Josh will follow up within one business day.');
  });

  it('persists the user message + an assistant tool-renderUI part to the session', async () => {
    const res = await POST(await contactSubmitRequest());
    // Drain the stream so onFinish (which runs appendMessages) actually fires.
    await res.text();
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(appendMessages).toHaveBeenCalledTimes(1);
    const [, , messages] = vi.mocked(appendMessages).mock.calls[0];
    // Fixture now sends two user turns (chip click + submit) so we persist
    // both followed by the server-emitted assistant card.
    expect(messages.length).toBeGreaterThanOrEqual(2);
    const assistantMsg = messages[messages.length - 1];
    expect(assistantMsg.role).toBe('assistant');
    const renderPart = assistantMsg.parts.find(
      (p) => (p as { type?: string }).type === 'tool-renderUI',
    ) as { type: string; output: { root: string } } | undefined;
    expect(renderPart).toBeDefined();
    expect(renderPart?.output.root).toBe('reply');
  });

  it('omits the question summary when the question field is absent', async () => {
    const res = await POST(
      await contactSubmitRequest({
        fields: { name: 'Sam Lee', company: 'Beta', roleType: 'Staff Engineer' },
      }),
    );
    const body = await res.text();
    expect(body).toContain('Thanks, Sam.');
    expect(body).toContain("Got it: you're hiring for a Staff Engineer at Beta.");
    expect(body).not.toContain('and you want to know');
  });

  it('bypasses the chip gate (no metadata.chipId on the submit message)', async () => {
    // The chip gate would normally reject anonymous messages without chipId.
    // The contact branch runs first, so this submit should succeed.
    const res = await POST(await contactSubmitRequest());
    expect(res.status).toBe(200);
  });

  it('rate-limits the 6th submit from the same anonymous actor within an hour', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await POST(await contactSubmitRequest());
      expect(ok.status).toBe(200);
    }
    const blocked = await POST(await contactSubmitRequest());
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body).toMatchObject({ error: 'rate_limit', reason: 'contactSubmitRateLimitExceeded' });
    expect(blocked.headers.get('retry-after')).toBeDefined();
  });

  it('rate-limit is per-actor — a different anon visitor is not affected', async () => {
    for (let i = 0; i < 5; i++) {
      await POST(await contactSubmitRequest({ anonymousId: 'anon-A' }));
    }
    const otherActor = await POST(await contactSubmitRequest({ anonymousId: 'anon-B' }));
    expect(otherActor.status).toBe(200);
  });

  it('rejects with 403 chainRequired when an anonymous submit lacks a preceding interactive chip turn', async () => {
    const res = await POST(await contactSubmitRequest({ skipChipChain: true }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: 'chainRequired',
      reason: 'interactiveChipMissing',
    });
  });

  it('rejects with 401 when neither userId nor anonymousId is present', async () => {
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `pac_trust=${await freshTrustCookie()}`,
      },
      body: JSON.stringify({
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
                  formName: 'contact',
                  data: { name: 'X', company: 'Y', roleType: 'Z' },
                },
              },
              { type: 'text', text: 'submit' },
            ],
          },
        ],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized', reason: 'noActor' });
  });

  it('signed-in users skip the chip chain check', async () => {
    vi.mocked(getUserId).mockResolvedValueOnce('user-fixture');
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          // No preceding interactive chip turn — would be rejected for an
          // anonymous visitor, but signed-in users have a stable userId and
          // skip the chain guard.
          {
            role: 'user',
            parts: [
              {
                type: 'data-press',
                data: {
                  action: 'submitForm',
                  formName: 'contact',
                  data: { name: 'Pat', company: 'Co', roleType: 'TLM' },
                },
              },
              { type: 'text', text: 'submit' },
            ],
          },
        ],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Thanks, Pat.');
  });

  it('replays the same submissionId as ok=true without creating a second session', async () => {
    const submissionId = 'replay-test-1';
    const first = await POST(await contactSubmitRequest({ submissionId }));
    await first.text(); // drain so onFinish runs
    expect(createSession).toHaveBeenCalledTimes(1);
    const second = await POST(await contactSubmitRequest({ submissionId }));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, replay: true });
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});
