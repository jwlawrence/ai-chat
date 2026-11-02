import type { ProviderOverride } from '@/lib/ai/providers';
import { type ByokRecord, MAX_GATEWAY_KEY_LENGTH, gatewayKeySchema } from './storage';

export const BYOK_HEADERS = {
  key: 'x-byok-key',
} as const;

/** Serialize a BYOK record into the headers sent with every chat request. */
export function recordToHeaders(record: ByokRecord): Record<string, string> {
  return { [BYOK_HEADERS.key]: record.key };
}

/**
 * Parse the BYOK header from an incoming chat request into a ProviderOverride.
 * Returns undefined when the header is missing, blank, or oversized; the
 * caller then falls back to the app's own Gateway key.
 *
 * The length cap is applied BEFORE trim to defend against pathological
 * whitespace strings (e.g. a 100MB header of spaces).
 */
export function headersToOverride(headers: Headers): ProviderOverride | undefined {
  const raw = headers.get(BYOK_HEADERS.key);
  if (!raw || raw.length > MAX_GATEWAY_KEY_LENGTH) return undefined;
  const parsed = gatewayKeySchema.safeParse(raw);
  return parsed.success ? { apiKey: parsed.data } : undefined;
}
