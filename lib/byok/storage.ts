import { z } from 'zod';

const KEY = 'pac.byok.v1';

export const byokDeploymentsSchema = z.record(z.string(), z.string().trim().min(1));

export const byokRecordSchema = z.object({
  key: z.string().trim().min(1),
  baseUrl: z.string().url(),
  deployments: byokDeploymentsSchema,
  apiVersion: z.string().trim().min(1).optional(),
});
export type ByokRecord = z.infer<typeof byokRecordSchema>;

export function loadByok(): ByokRecord | null {
  // SSR guard: localStorage is undefined during Next.js server render.
  if (typeof localStorage === 'undefined') return null;
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
