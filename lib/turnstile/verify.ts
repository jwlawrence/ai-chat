const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Verify a Turnstile token against Cloudflare. Returns false on any failure
 * (network error, rejected token, malformed response) — caller decides whether
 * to fail-closed or fail-open.
 */
export async function verifyTurnstileToken(
  token: string,
  remoteIp: string | null,
  secret: string,
): Promise<boolean> {
  try {
    const body = new URLSearchParams({ secret, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);
    const r = await fetch(TURNSTILE_URL, { method: 'POST', body });
    const json = (await r.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}
