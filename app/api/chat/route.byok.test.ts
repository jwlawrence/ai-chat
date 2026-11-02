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
// route can complete without a real gateway connection.
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
  [BYOK_HEADERS.key]: 'vck_test',
};

async function freshTrustCookie(): Promise<string> {
  const secret = process.env.TRUST_COOKIE_SECRET;
  if (!secret) throw new Error('TRUST_COOKIE_SECRET unset');
  const now = Date.now();
  return signTrust({ verifiedAt: now, expiresAt: now + 60_000 }, secret);
}

describe('chat route — BYOK header parsing', () => {
  it('signed-in user with the BYOK key header → getModel called with that key', async () => {
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...VALID_BYOK_HEADERS },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    });
    await POST(req);
    expect(getModel).toHaveBeenCalledWith('gpt-5.4', { apiKey: 'vck_test' });
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

  it('signed-in user with a blank BYOK key header → BYOK ignored; getModel called without override', async () => {
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [BYOK_HEADERS.key]: '   ' },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    });
    await POST(req);
    expect(getModel).toHaveBeenCalledWith('gpt-5.4', undefined);
  });

  it('signed-in user sending only Azure-era BYOK headers → BYOK ignored; getModel called without override', async () => {
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-byok-base-url': 'https://my.azure.com/openai',
        'x-byok-deployments': JSON.stringify({ 'gpt-5.4': 'my-gpt54' }),
      },
      body: JSON.stringify({
        model: 'gpt-5.4',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    });
    await POST(req);
    expect(getModel).toHaveBeenCalledWith('gpt-5.4', undefined);
  });
});
