import { describe, expect, it, vi } from 'vitest';

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

import { preflight } from '@/lib/budget/preflight';
import { POST } from './route';

function chatRequest(overrides: { messages?: unknown[]; headers?: Record<string, string> } = {}) {
  return new Request('http://test/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-anonymous-id': 'anon-test',
      ...overrides.headers,
    },
    body: JSON.stringify({
      messages: overrides.messages ?? [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
    }),
  });
}

describe('chat route preflight gating', () => {
  it('returns 429 with reason when preflight rejects with dailyCapReached', async () => {
    vi.mocked(preflight).mockResolvedValueOnce({ allow: false, reason: 'dailyCapReached' });
    const res = await POST(chatRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: 'quota', reason: 'dailyCapReached' });
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('returns 429 with actorCapReached when an actor breaches its per-day cap', async () => {
    vi.mocked(preflight).mockResolvedValueOnce({ allow: false, reason: 'actorCapReached' });
    const res = await POST(chatRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: 'quota', reason: 'actorCapReached' });
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('returns 503 with preflightFailure when preflight throws', async () => {
    vi.mocked(preflight).mockRejectedValueOnce(new Error('neon down'));
    // Silence the expected console.error so test output stays clean.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(chatRequest());
    spy.mockRestore();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ error: 'service_unavailable', reason: 'preflightFailure' });
  });

  it('treats x-anonymous-id longer than 128 chars as not-present (graceful degradation)', async () => {
    vi.mocked(preflight).mockResolvedValueOnce({ allow: false, reason: 'dailyCapReached' });
    const res = await POST(chatRequest({ headers: { 'x-anonymous-id': 'a'.repeat(200) } }));
    // Still reaches the quota gate — preflight ran, returned 429
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
  });
});
