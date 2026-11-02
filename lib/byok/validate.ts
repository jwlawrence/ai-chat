import { generateText } from 'ai';
import { DEFAULT_MODEL } from '@/lib/ai/models';
import { getModel } from '@/lib/ai/providers';

export interface ValidateInput {
  key: string;
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
  return 'AI Gateway rejected the key (no details)';
}

/**
 * Prove a user's Gateway key works by making the smallest possible call on
 * the default model through the same seam chat turns use.
 */
export async function validateByokCredentials(input: ValidateInput): Promise<ValidateResult> {
  try {
    await generateText({
      model: getModel(DEFAULT_MODEL, { apiKey: input.key }),
      prompt: 'Reply with the single word: ok',
      maxOutputTokens: 5,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: extractErrorMessage(err) };
  }
}
