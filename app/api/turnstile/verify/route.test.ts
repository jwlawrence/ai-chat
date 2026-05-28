import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/turnstile/verify', () => ({
  verifyTurnstileToken: vi.fn(),
}));

import { verifyTurnstileToken } from '@/lib/turnstile/verify';
import { POST } from './route';

const ENV_FIXTURE = {
  TURNSTILE_SECRET_KEY: 'cf-secret-fixture',
  TRUST_COOKIE_SECRET: 'trust-cookie-secret-32-bytes-xxx',
};

function withEnv(values: Record<string, string>, fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    const before: Record<string, string | undefined> = {};
    for (const k of Object.keys(values)) before[k] = process.env[k];
    Object.assign(process.env, values);
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(before)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };
}

describe('POST /api/turnstile/verify', () => {
  it('returns 500 when env vars are unset', async () => {
    const before = process.env.TURNSTILE_SECRET_KEY;
    const before2 = process.env.TRUST_COOKIE_SECRET;
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TRUST_COOKIE_SECRET;
    try {
      const res = await POST(
        new Request('http://test/api/turnstile/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: 'foo' }),
        }),
      );
      expect(res.status).toBe(500);
    } finally {
      if (before !== undefined) process.env.TURNSTILE_SECRET_KEY = before;
      if (before2 !== undefined) process.env.TRUST_COOKIE_SECRET = before2;
    }
  });

  it(
    'returns 400 when token missing',
    withEnv(ENV_FIXTURE, async () => {
      const res = await POST(
        new Request('http://test/api/turnstile/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({}),
        }),
      );
      expect(res.status).toBe(400);
    }),
  );

  it(
    'returns 403 when Cloudflare rejects',
    withEnv(ENV_FIXTURE, async () => {
      vi.mocked(verifyTurnstileToken).mockResolvedValueOnce(false);
      const res = await POST(
        new Request('http://test/api/turnstile/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: 'bad' }),
        }),
      );
      expect(res.status).toBe(403);
    }),
  );

  it(
    'returns 200 with pac_trust Set-Cookie on success',
    withEnv(ENV_FIXTURE, async () => {
      vi.mocked(verifyTurnstileToken).mockResolvedValueOnce(true);
      const res = await POST(
        new Request('http://test/api/turnstile/verify', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '1.2.3.4, 5.6.7.8',
          },
          body: JSON.stringify({ token: 'good' }),
        }),
      );
      expect(res.status).toBe(200);
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).toMatch(/^pac_trust=/);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      expect(setCookie).toMatch(/Path=\//);
      expect(setCookie).toMatch(/Max-Age=3600/);
      const body = await res.json();
      expect(body).toEqual({ ok: true });
      // Confirms the first forwarded-for IP was passed to verify, not the second.
      expect(verifyTurnstileToken).toHaveBeenCalledWith('good', '1.2.3.4', 'cf-secret-fixture');
    }),
  );
});
