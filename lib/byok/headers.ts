import type { ModelId } from '@/lib/ai/models';
import type { ProviderOverride } from '@/lib/ai/providers';
import { type ByokRecord, byokDeploymentsSchema } from './storage';

export const BYOK_HEADERS = {
  key: 'x-byok-key',
  baseUrl: 'x-byok-base-url',
  deployments: 'x-byok-deployments',
  apiVersion: 'x-byok-api-version',
} as const;

const MAX = {
  key: 512,
  baseUrl: 512,
  deployments: 2048,
  apiVersion: 64,
} as const;

/** Serialize a BYOK record into the headers sent with every chat request. */
export function recordToHeaders(record: ByokRecord): Record<string, string> {
  const headers: Record<string, string> = {
    [BYOK_HEADERS.key]: record.key,
    [BYOK_HEADERS.baseUrl]: record.baseUrl,
    [BYOK_HEADERS.deployments]: JSON.stringify(record.deployments),
  };
  if (record.apiVersion) headers[BYOK_HEADERS.apiVersion] = record.apiVersion;
  return headers;
}

/**
 * Parse BYOK headers from an incoming chat request into a ProviderOverride.
 * Returns undefined when ANY header is missing, malformed, oversized, or fails
 * URL/https/schema validation — caller falls back to env credentials.
 *
 * Defensively applies length caps BEFORE trim to defend against pathological
 * whitespace strings (e.g. a 100MB header of spaces).
 */
export function headersToOverride(headers: Headers): ProviderOverride | undefined {
  const rawKey = headers.get(BYOK_HEADERS.key);
  const rawBase = headers.get(BYOK_HEADERS.baseUrl);
  const rawDeployments = headers.get(BYOK_HEADERS.deployments);
  const rawApiVersion = headers.get(BYOK_HEADERS.apiVersion);

  const key = rawKey && rawKey.length <= MAX.key ? rawKey.trim() : null;
  const baseUrl = rawBase && rawBase.length <= MAX.baseUrl ? rawBase.trim() : null;
  const deploymentsRaw =
    rawDeployments && rawDeployments.length <= MAX.deployments ? rawDeployments.trim() : null;
  const apiVersion =
    rawApiVersion && rawApiVersion.length <= MAX.apiVersion ? rawApiVersion.trim() : null;

  if (!key || !baseUrl || !deploymentsRaw) return undefined;

  try {
    const parsedUrl = new URL(baseUrl);
    if (parsedUrl.protocol !== 'https:') return undefined;
  } catch {
    return undefined;
  }

  let parsedDeployments: unknown;
  try {
    parsedDeployments = JSON.parse(deploymentsRaw);
  } catch {
    return undefined;
  }
  const deployments = byokDeploymentsSchema.safeParse(parsedDeployments);
  if (!deployments.success) return undefined;

  return {
    apiKey: key,
    baseUrl,
    deployments: deployments.data as Partial<Record<ModelId, string>>,
    ...(apiVersion ? { apiVersion } : {}),
  };
}
