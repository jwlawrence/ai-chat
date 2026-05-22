import { describe, expect, it } from 'vitest';
import { catalogPrompt } from './catalog';

// ---------------------------------------------------------------------------
// Token-budget assertion for catalogPrompt.
//
// `lib/json-render/catalog.test.ts` also asserts a char-level upper bound
// (~20_500). This test enforces a TOKEN-level budget — the metric that maps
// to per-turn cost on the renderUI tool description.
//
// Approximate token count via chars / 4 (standard rough heuristic). Precise
// tokenization would require running the model's tokenizer; overkill for CI.
//
// Ceiling = 5500 (chosen to give ~6 components of headroom over the current
// ~4988-token baseline). If you raise this, audit the cost model in
// plans/public-hosting.md (per-turn input-token math assumes ~5K catalog).
// ---------------------------------------------------------------------------

describe('catalogPrompt size', () => {
  it('stays under the 5500-token budget', () => {
    const approxTokens = Math.ceil(catalogPrompt.length / 4);
    console.log(`catalogPrompt: ${catalogPrompt.length} chars, ~${approxTokens} tokens`);
    expect(
      approxTokens,
      'catalogPrompt is spliced into the renderUI tool description on every turn; keep under 5500 to bound per-turn cost. See plans/public-hosting.md cost model.',
    ).toBeLessThan(5500);
  });
});
