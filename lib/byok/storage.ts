import { z } from 'zod';

const KEY = 'pac.byok.v2';
/** Azure-era record (key + base URL + deployment map). Unusable now; purged on load. */
const LEGACY_KEY = 'pac.byok.v1';

/** Longest Gateway key we accept anywhere: header, validate body, browser record. */
export const MAX_GATEWAY_KEY_LENGTH = 512;

/** A Gateway key as the app accepts it: non-blank once trimmed, bounded. */
export const gatewayKeySchema = z.string().trim().min(1).max(MAX_GATEWAY_KEY_LENGTH);

export const byokRecordSchema = z.object({
  key: gatewayKeySchema,
});
export type ByokRecord = z.infer<typeof byokRecordSchema>;

export function loadByok(): ByokRecord | null {
  // SSR guard: localStorage is undefined during Next.js server render.
  if (typeof localStorage === 'undefined') return null;
  // A stale Azure key is a secret that can never work again; don't keep it.
  localStorage.removeItem(LEGACY_KEY);
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = byokRecordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveByok(record: ByokRecord): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(record));
}

export function clearByok(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(KEY);
}
