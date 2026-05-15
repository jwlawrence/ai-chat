import { describe, expect, it } from 'vitest';
import { MODEL_IDS } from './models';
import { estimateCostUSD, MODEL_PRICING } from './pricing';

describe('MODEL_PRICING', () => {
  it('has an entry for every model id', () => {
    for (const id of MODEL_IDS) {
      expect(MODEL_PRICING[id]).toBeDefined();
      expect(MODEL_PRICING[id].maxContextTokens).toBeGreaterThan(0);
    }
  });
});

describe('estimateCostUSD', () => {
  it('returns 0 for an unused session', () => {
    expect(estimateCostUSD('gpt-5.4', { tokensIn: 0, tokensOut: 0, tokensCached: 0 })).toBe(0);
  });

  it('charges input + output at full rate when nothing is cached', () => {
    // Compute expected from the actual table so test stays correct as rates evolve.
    const p = MODEL_PRICING['gpt-5.4'];
    const cost = estimateCostUSD('gpt-5.4', {
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
      tokensCached: 0,
    });
    expect(cost).toBeCloseTo(p.inputPer1M + p.outputPer1M, 6);
  });

  it('discounts the cached portion of input', () => {
    // 1M input of which 800k is cached.
    const p = MODEL_PRICING['gpt-5.4'];
    const cost = estimateCostUSD('gpt-5.4', {
      tokensIn: 1_000_000,
      tokensOut: 0,
      tokensCached: 800_000,
    });
    const expected = 0.2 * p.inputPer1M + 0.8 * p.cachedInputPer1M;
    expect(cost).toBeCloseTo(expected, 6);
  });

  it('handles cachedInput >= tokensIn gracefully (clamps billable input to 0)', () => {
    // Defensive: should never happen, but the formula shouldn't go negative on us.
    const cost = estimateCostUSD('gpt-5.4', {
      tokensIn: 100,
      tokensOut: 0,
      tokensCached: 999_999,
    });
    expect(cost).toBeGreaterThanOrEqual(0);
  });
});
