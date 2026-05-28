// app/api/turnstile/verify/route.ts
import { signTrust } from '@/lib/turnstile/cookie';
import { verifyTurnstileToken } from '@/lib/turnstile/verify';

export const runtime = 'nodejs';

const TRUST_TTL_MS = 60 * 60 * 1000; // 1 hour — matches the cookie Max-Age

export async function POST(req: Request) {
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  const cookieSecret = process.env.TRUST_COOKIE_SECRET;
  if (!turnstileSecret || !cookieSecret) {
    return new Response(JSON.stringify({ error: 'turnstile_not_configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  let token: string | undefined;
  try {
    const body = (await req.json()) as { token?: string };
    token = body.token;
  } catch {
    return new Response(JSON.stringify({ error: 'bad_request' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (!token || typeof token !== 'string') {
    return new Response(JSON.stringify({ error: 'bad_request' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  // x-forwarded-for can be a comma-separated chain. Cloudflare wants the
  // origin IP — the first entry from the chain.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ok = await verifyTurnstileToken(token, ip, turnstileSecret);
  if (!ok) {
    return new Response(JSON.stringify({ error: 'turnstile_failed' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

  const now = Date.now();
  const cookie = await signTrust({ verifiedAt: now, expiresAt: now + TRUST_TTL_MS }, cookieSecret);
  const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': `pac_trust=${cookie}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600${secureFlag}`,
    },
  });
}
