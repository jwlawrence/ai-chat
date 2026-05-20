import type { ModelId } from './models';

/**
 * Per-model pricing + capacity. Update these as Azure Foundry pricing changes.
 * Rates are USD per 1,000,000 tokens. `maxContextTokens` is the model's full window.
 */
export type ModelPricing = {
  inputPer1M: number;
  outputPer1M: number;
  /** Cached/reused input tokens are usually billed at a discount. */
  cachedInputPer1M: number;
  /** Total context window the model accepts (input + output). */
  maxContextTokens: number;
};

export const MODEL_PRICING: Record<ModelId, ModelPricing> = {
  'gpt-5.4': {
    inputPer1M: 2.5,
    outputPer1M: 15.0,
    cachedInputPer1M: 0.25,
    maxContextTokens: 400_000,
  },
  'gpt-5.4-mini': {
    inputPer1M: 0.75,
    outputPer1M: 4.5,
    cachedInputPer1M: 0.08,
    maxContextTokens: 400_000,
  },
  'gpt-5.3-codex': {
    inputPer1M: 1.75,
    outputPer1M: 14.0,
    cachedInputPer1M: 0.18,
    maxContextTokens: 400_000,
  },
  'o4-mini': {
    inputPer1M: 1.1,
    outputPer1M: 4.4,
    cachedInputPer1M: 0.28,
    maxContextTokens: 200_000,
  },
};

export function estimateCostUSD(
  modelId: ModelId,
  usage: { tokensIn: number; tokensOut: number; tokensCached: number },
): number {
  const p = MODEL_PRICING[modelId];
  // Cached tokens are a subset of input tokens billed at the cached rate; charge
  // the remainder at the full input rate.
  const billableInput = Math.max(0, usage.tokensIn - usage.tokensCached);
  return (
    (billableInput * p.inputPer1M) / 1_000_000 +
    (usage.tokensCached * p.cachedInputPer1M) / 1_000_000 +
    (usage.tokensOut * p.outputPer1M) / 1_000_000
  );
}
