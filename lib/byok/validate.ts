import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import { DEFAULT_AZURE_API_VERSION } from '@/lib/ai/providers';

export interface ValidateInput {
  key: string;
  baseUrl: string;
  deploymentName: string;
  apiVersion?: string;
}

export type ValidateResult = { ok: true } | { ok: false; error: string };

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object') {
    const o = err as { message?: unknown; status?: unknown; cause?: { message?: unknown } };
    if (typeof o.message === 'string' && o.message) return o.message;
    if (typeof o.cause?.message === 'string' && o.cause.message) return o.cause.message;
    if (typeof o.status === 'number') return `HTTP ${o.status}`;
  }
  return 'Azure rejected the credentials (no details)';
}

export async function validateByokCredentials(input: ValidateInput): Promise<ValidateResult> {
  try {
    const azure = createAzure({
      baseURL: input.baseUrl,
      apiKey: input.key,
      apiVersion: input.apiVersion ?? DEFAULT_AZURE_API_VERSION,
    });
    const model = azure.responses(input.deploymentName);
    await generateText({
      model,
      prompt: 'Reply with the single word: ok',
      maxOutputTokens: 5,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: extractErrorMessage(err) };
  }
}
