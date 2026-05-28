import type { PreflightResult } from './preflight';

const TTL_MS = 60_000;

interface CachedEntry {
  result: PreflightResult;
  expiresAt: number;
}

const cache = new Map<string, CachedEntry>();

/** Read a non-expired deny decision for this actor, or null. */
export function getCachedDeny(actorId: string): PreflightResult | null {
  const entry = cache.get(actorId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(actorId);
    return null;
  }
  return entry.result;
}

/** Cache an actor-cap deny for TTL_MS. Allow-decisions are NOT cached (we want
 *  fresh reads to track spend accurately). */
export function cacheDeny(actorId: string, result: PreflightResult): void {
  if (result.allow) return;
  if (result.reason !== 'actorCapReached') return;
  cache.set(actorId, { result, expiresAt: Date.now() + TTL_MS });
}

/** Test-only: clear the cache. Exported for vitest beforeEach hygiene. */
export function _clearCapCache(): void {
  cache.clear();
}
