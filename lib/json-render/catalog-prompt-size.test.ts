import { describe, expect, it } from 'vitest';
import { catalogPrompt } from './catalog';

// ---------------------------------------------------------------------------
// Token-budget assertion for catalogPrompt.
//
// `lib/json-render/catalog.test.ts` also asserts a char-level upper bound.
// This test enforces the TOKEN-level architectural ceiling — the metric that
// maps directly to per-turn cost on the renderUI tool description.
//
// Approximate token count via chars / 4 (standard rough heuristic). Precise
// tokenization would require running the model's tokenizer; overkill for CI.
//
// Architectural ceiling = 6000 tokens.
// Policy: catalogPrompt() must stay under 6000 tokens. No growth past this:
// the next primitive addition forces a removal first. This guards the
// per-turn prompt cost since catalog.prompt() is spliced into the renderUI
// tool description on every model turn.
//
// History: 5500 baseline → 5750 across Phase 7 (Textarea, Chart annotations
// + endpointLabel, Grid/GridCell, Icon, Card.icon) → ~5350 after Icon +
// Card.icon removal in Phase 7 precheck hardening. Ceiling raised to 6000
// to reflect the committed architectural limit rather than the current count.
// If the count ever approaches 6000, remove a primitive before adding one.
// ---------------------------------------------------------------------------

describe('catalogPrompt size', () => {
  it('stays under the 6000-token architectural ceiling', () => {
    const approxTokens = Math.ceil(catalogPrompt.length / 4);
    console.log(`catalogPrompt: ${catalogPrompt.length} chars, ~${approxTokens} tokens`);
    expect(
      approxTokens,
      'Architectural ceiling — catalog.prompt() must stay under 6000 tokens. No growth past this: the next primitive addition forces a removal first. This guards the per-turn prompt cost since catalog.prompt() is spliced into the renderUI tool description on every model turn.',
    ).toBeLessThan(6000);
  });
});
