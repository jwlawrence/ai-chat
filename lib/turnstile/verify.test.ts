import { afterEach, describe, expect, it, vi } from 'vitest';
import { verifyTurnstileToken } from './verify';

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});

describe('verifyTurnstileToken', () => {
  it('returns true when Cloudflare confirms', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    ) as typeof fetch;
    expect(await verifyTurnstileToken('tok', '1.2.3.4', 'secret')).toBe(true);
  });

  it('returns false when Cloudflare rejects', async () => {
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] })),
    ) as typeof fetch;
    expect(await verifyTurnstileToken('tok', '1.2.3.4', 'secret')).toBe(false);
  });

  it('returns false on network error', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network');
    }) as typeof fetch;
    expect(await verifyTurnstileToken('tok', '1.2.3.4', 'secret')).toBe(false);
  });

  it('forwards remoteIp when provided', async () => {
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;
    await verifyTurnstileToken('tok', '9.9.9.9', 'secret');
    const calls = fetchSpy.mock.calls as unknown as [string, RequestInit][];
    const body = calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('remoteip')).toBe('9.9.9.9');
  });

  it('omits remoteIp when null', async () => {
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;
    await verifyTurnstileToken('tok', null, 'secret');
    const calls = fetchSpy.mock.calls as unknown as [string, RequestInit][];
    const body = calls[0]?.[1]?.body as URLSearchParams;
    expect(body.has('remoteip')).toBe(false);
  });
});
