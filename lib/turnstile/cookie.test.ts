import { describe, expect, it } from 'vitest';
import { signTrust, type TrustPayload, verifyTrust } from './cookie';

const S = 'turnstile-test-secret-32-chars-xxx';

describe('trust cookie', () => {
  it('round-trips a fresh payload', async () => {
    const now = Date.now();
    const cookie = await signTrust({ verifiedAt: now, expiresAt: now + 3_600_000 }, S);
    const verified = await verifyTrust(cookie, S);
    expect(verified?.verifiedAt).toBe(now);
    expect(verified?.expiresAt).toBe(now + 3_600_000);
  });

  it('rejects an expired payload', async () => {
    const now = Date.now();
    const cookie = await signTrust({ verifiedAt: now - 10_000_000, expiresAt: now - 1 }, S);
    expect(await verifyTrust(cookie, S)).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const now = Date.now();
    const cookie = await signTrust({ verifiedAt: now, expiresAt: now + 3_600_000 }, S);
    const tampered = `${cookie.slice(0, -3)}xyz`;
    expect(await verifyTrust(tampered, S)).toBeNull();
  });

  it('rejects with a wrong secret', async () => {
    const now = Date.now();
    const cookie = await signTrust({ verifiedAt: now, expiresAt: now + 3_600_000 }, S);
    expect(await verifyTrust(cookie, 'wrong-secret-32-chars-xxxxxxxxxx')).toBeNull();
  });

  it('rejects a malformed cookie (no dot)', async () => {
    expect(await verifyTrust('nodothere', S)).toBeNull();
  });

  it('rejects a cookie with non-numeric expiresAt', async () => {
    const cookie = await signTrust(
      { verifiedAt: 1, expiresAt: 'not-a-number' as unknown as number } as TrustPayload,
      S,
    );
    expect(await verifyTrust(cookie, S)).toBeNull();
  });
});
