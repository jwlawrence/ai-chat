/**
 * In-memory sliding-window rate limiter for the contact-form submit branch
 * of the chat route. Bounds drive-by DB-write spam from a single actor —
 * the contact branch bypasses both the chip gate and the AI-cap preflight,
 * so without this an authenticated cookie (or pac_trust cookie + valid
 * form shape) could create unlimited sessions and rows.
 *
 * Why in-memory and not a DB table or Redis:
 *   - Portfolio scope. The expected volume is single-digit submits per day.
 *   - Vercel Function instances tend to be warm-pooled; the same actor
 *     usually hits the same instance and gets bounded.
 *   - Multi-instance fan-out gives the actor at most one extra free submit
 *     per cold-started instance, which is acceptable for this threat model.
 *
 * Window: rolling 1-hour bucket. Limit: 5 submits / hour per actor key.
 *
 * Test ergonomics: `resetContactSubmitRateLimit()` clears all state, and
 * `checkContactSubmitRateLimit` accepts an optional `now` for deterministic
 * time travel in tests.
 */

const CONTACT_RATE_LIMIT = 5;
const CONTACT_RATE_WINDOW_MS = 60 * 60 * 1000;

const submitsByActor = new Map<string, number[]>();

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export function checkContactSubmitRateLimit(
  actorKey: string,
  now: number = Date.now(),
): RateLimitDecision {
  const recent = submitsByActor.get(actorKey) ?? [];
  // Drop timestamps that fell out of the trailing window.
  const inWindow = recent.filter((t) => now - t < CONTACT_RATE_WINDOW_MS);
  if (inWindow.length >= CONTACT_RATE_LIMIT) {
    // Earliest in-window timestamp determines when the next slot frees up.
    const oldest = inWindow[0] ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((CONTACT_RATE_WINDOW_MS - (now - oldest)) / 1000),
    );
    // Persist the trimmed window so subsequent checks share the same view.
    submitsByActor.set(actorKey, inWindow);
    return { allowed: false, retryAfterSeconds };
  }
  inWindow.push(now);
  submitsByActor.set(actorKey, inWindow);
  return { allowed: true };
}

export function resetContactSubmitRateLimit(): void {
  submitsByActor.clear();
}

// ---------------------------------------------------------------------------
// Submission-id idempotency
//
// Defends against React StrictMode dev double-fires, double-clicks that race
// the card-lock check, and retries on hung fetches. The browser stamps each
// press with a UUID; the server claims it here on first sight and rejects
// re-claims so we don't create N sessions / persist N card pairs for one
// logical submit.
// ---------------------------------------------------------------------------

const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;
const seenSubmissionIds = new Map<string, number>();

export function claimSubmissionId(
  submissionId: string,
  now: number = Date.now(),
): { fresh: boolean } {
  // Sweep entries that aged out so the map doesn't grow unbounded.
  const cutoff = now - IDEMPOTENCY_WINDOW_MS;
  for (const [id, t] of seenSubmissionIds) {
    if (t < cutoff) seenSubmissionIds.delete(id);
  }
  if (seenSubmissionIds.has(submissionId)) return { fresh: false };
  seenSubmissionIds.set(submissionId, now);
  return { fresh: true };
}

export function resetSubmissionIdClaims(): void {
  seenSubmissionIds.clear();
}

export const __test_internals = {
  CONTACT_RATE_LIMIT,
  CONTACT_RATE_WINDOW_MS,
  IDEMPOTENCY_WINDOW_MS,
};
