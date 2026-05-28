import { describe, expect, it, vi } from 'vitest';
import { signTrust } from '@/lib/turnstile/cookie';

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn(async () => 'user-1'),
}));

vi.mock('@/lib/budget/preflight', () => ({
  preflight: vi.fn(async () => ({ allow: true })),
  CAPS: { dailyGlobalUsd: 5, monthlyGlobalUsd: 30, anonymousDailyUsd: 0.2, userDailyUsd: 1 },
}));

// Return a dummy object so getModel doesn't throw and the route reaches streamText.
vi.mock('@/lib/ai/providers', () => ({
  getModel: vi.fn(() => ({ _isDummy: true })),
}));

vi.mock('@/lib/db/queries', () => ({
  createSession: vi.fn(async () => ({ id: 'sess-1' })),
  getSession: vi.fn(async () => null),
  countMessages: vi.fn(async () => 0),
  appendMessages: vi.fn(async () => {}),
  touchSession: vi.fn(async () => {}),
  trimTrailingMessages: vi.fn(async () => {}),
  renameSession: vi.fn(async () => {}),
}));

// Mock the ai streaming helpers to return a minimal 200 response so the
// route can complete without a real Azure connection.
vi.mock('ai', async (importOriginal) => {
  const real = await importOriginal<typeof import('ai')>();
  return {
    ...real,
    streamText: vi.fn(() => ({
      toUIMessageStream: () =>
        new ReadableStream({
          start(c) {
            c.close();
          },
        }),
      usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
      finishReason: Promise.resolve('stop'),
    })),
    createUIMessageStream: vi.fn(({ onFinish }) => {
      // Call onFinish with empty state so cleanup logic runs.
      void Promise.resolve().then(async () => {
        if (onFinish) {
          await onFinish({ messages: [], responseMessage: undefined }).catch(() => {});
        }
      });
      return new ReadableStream({
        start(c) {
          c.close();
        },
      });
    }),
    createUIMessageStreamResponse: vi.fn(() => new Response(null, { status: 200 })),
    convertToModelMessages: vi.fn(async () => []),
    stepCountIs: vi.fn(() => () => false),
  };
});

import { getModel } from '@/lib/ai/providers';
import { getUserId } from '@/lib/auth';
import { BYOK_HEADERS } from '@/lib/byok/headers';
import { POST } from './route';

const VALID_BYOK_HEADERS = {
  [BYOK_HEADERS.key]: 'sk-test',
  [BYOK_HEADERS.baseUrl]: 'https://my.azure.com/openai',
  [BYOK_HEADERS.deployments]: JSON.stringify({ 'gpt-5.4': 'my-gpt54' }),
};

async function freshTrustCookie(): Promise<string> {
  const secret = process.env.TRUST_COOKIE_SECRET;
  if (!secret) throw new Error('TRUST_COOKIE_SECRET unset');
  const now = Date.now();
  return signTrust({ verifiedAt: now, expiresAt: now + 60_000 }, secret);
}

describe('chat route — BYOK header parsing', () => {
  it('signed-in user with all 3 BYOK headers → getModel called with override', async () => {
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...VALID_BYOK_HEADERS },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    });
    await POST(req);
    expect(getModel).toHaveBeenCalledWith(
      'gpt-5.4',
      expect.objectContaining({
        apiKey: 'sk-test',
        baseUrl: 'https://my.azure.com/openai',
        deployments: { 'gpt-5.4': 'my-gpt54' },
      }),
    );
  });

  it('anonymous user with BYOK headers → BYOK ignored; getModel called without override', async () => {
    vi.mocked(getUserId).mockResolvedValueOnce(null);
    const trustCookie = await freshTrustCookie();
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `pac_trust=${trustCookie}`,
        'x-anonymous-id': 'anon-test',
        ...VALID_BYOK_HEADERS,
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [
          {
            role: 'user',
            parts: [{ type: 'text', text: 'hi' }],
            metadata: { chipId: 'dashboard' },
          },
        ],
      }),
    });
    await POST(req);
    expect(getModel).toHaveBeenCalledWith('gpt-5.4', undefined);
  });

  it('signed-in user with missing deployments header → BYOK ignored; getModel called without override', async () => {
    const { [BYOK_HEADERS.deployments]: _removed, ...headersNoDeployments } = VALID_BYOK_HEADERS;
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headersNoDeployments },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    });
    await POST(req);
    expect(getModel).toHaveBeenCalledWith('gpt-5.4', undefined);
  });

  it('signed-in user with malformed deployments JSON → BYOK ignored; getModel called without override', async () => {
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...VALID_BYOK_HEADERS,
        [BYOK_HEADERS.deployments]: '{not valid json',
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    });
    await POST(req);
    expect(getModel).toHaveBeenCalledWith('gpt-5.4', undefined);
  });

  it('C2 regression: deployment missing for selected model → 400 byokModelMissing', async () => {
    vi.mocked(getModel).mockImplementationOnce(() => {
      throw new Error('BYOK override is missing a deployment name for model gpt-5.4');
    });
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [BYOK_HEADERS.key]: 'sk-test',
        [BYOK_HEADERS.baseUrl]: 'https://my.azure.com/openai',
        [BYOK_HEADERS.deployments]: JSON.stringify({ 'gpt-5.4-mini': 'mini-dep' }),
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'byokModelMissing', model: 'gpt-5.4' });
  });
});
