import { afterEach, describe, expect, it } from 'vitest';
import {
  __test_internals,
  checkContactSubmitRateLimit,
  claimSubmissionId,
  resetContactSubmitRateLimit,
  resetSubmissionIdClaims,
} from './rate-limit';

const { CONTACT_RATE_LIMIT, CONTACT_RATE_WINDOW_MS, IDEMPOTENCY_WINDOW_MS } = __test_internals;

afterEach(() => {
  resetContactSubmitRateLimit();
  resetSubmissionIdClaims();
});

describe('checkContactSubmitRateLimit', () => {
  it('allows the first submit', () => {
    expect(checkContactSubmitRateLimit('user:1', 0)).toEqual({ allowed: true });
  });

  it('allows up to the limit within the window', () => {
    for (let i = 0; i < CONTACT_RATE_LIMIT; i++) {
      expect(checkContactSubmitRateLimit('user:1', i * 1000)).toEqual({ allowed: true });
    }
  });

  it('rejects the submit immediately past the limit', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < CONTACT_RATE_LIMIT; i++) {
      checkContactSubmitRateLimit('user:1', t0 + i * 1000);
    }
    const decision = checkContactSubmitRateLimit('user:1', t0 + CONTACT_RATE_LIMIT * 1000);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      // retryAfter should be roughly the remaining window after the oldest entry.
      expect(decision.retryAfterSeconds).toBeGreaterThan(0);
      expect(decision.retryAfterSeconds).toBeLessThanOrEqual(CONTACT_RATE_WINDOW_MS / 1000);
    }
  });

  it('allows a new submit once the oldest timestamp falls out of the window', () => {
    const t0 = 0;
    for (let i = 0; i < CONTACT_RATE_LIMIT; i++) {
      checkContactSubmitRateLimit('user:1', t0 + i * 1000);
    }
    // Jump past the window so every timestamp is stale.
    const future = t0 + CONTACT_RATE_WINDOW_MS + 1;
    expect(checkContactSubmitRateLimit('user:1', future)).toEqual({ allowed: true });
  });

  it('tracks distinct actors independently', () => {
    const t = 0;
    for (let i = 0; i < CONTACT_RATE_LIMIT; i++) {
      checkContactSubmitRateLimit('user:1', t + i);
    }
    // user:1 is now at the cap but user:2 starts fresh.
    expect(checkContactSubmitRateLimit('user:1', t + CONTACT_RATE_LIMIT).allowed).toBe(false);
    expect(checkContactSubmitRateLimit('user:2', t + CONTACT_RATE_LIMIT).allowed).toBe(true);
  });

  it('reset wipes the window so callers can restart in tests', () => {
    for (let i = 0; i < CONTACT_RATE_LIMIT; i++) {
      checkContactSubmitRateLimit('user:1', i);
    }
    expect(checkContactSubmitRateLimit('user:1', CONTACT_RATE_LIMIT).allowed).toBe(false);
    resetContactSubmitRateLimit();
    expect(checkContactSubmitRateLimit('user:1', CONTACT_RATE_LIMIT + 1).allowed).toBe(true);
  });
});

describe('claimSubmissionId', () => {
  it('marks the first sight of an id as fresh', () => {
    expect(claimSubmissionId('s-1', 0)).toEqual({ fresh: true });
  });

  it('refuses repeated claims of the same id within the idempotency window', () => {
    claimSubmissionId('s-1', 0);
    expect(claimSubmissionId('s-1', 1)).toEqual({ fresh: false });
  });

  it('allows the same id once it has aged out of the idempotency window', () => {
    claimSubmissionId('s-1', 0);
    expect(claimSubmissionId('s-1', IDEMPOTENCY_WINDOW_MS + 1)).toEqual({ fresh: true });
  });

  it('does not affect unrelated ids', () => {
    claimSubmissionId('s-1', 0);
    expect(claimSubmissionId('s-2', 0)).toEqual({ fresh: true });
  });
});
