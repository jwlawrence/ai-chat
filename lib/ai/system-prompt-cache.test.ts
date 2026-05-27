import { describe, expect, it } from 'vitest';
import { catalogPrompt } from '@/lib/json-render/catalog';
import { SYSTEM_PROMPT } from './system-prompt';
import { renderUI } from './tools/render-ui';

describe('SYSTEM_PROMPT structure for prompt caching', () => {
  it('catalogPrompt sits at position 0 and exceeds the Azure auto-cache threshold', () => {
    expect(SYSTEM_PROMPT.startsWith(catalogPrompt)).toBe(true);
    // Azure auto-cache fires at 1024 tokens (~4096 chars). Require ~6000 chars
    // (~1500 tokens) of headroom so a small catalog trim doesn't silently drop
    // us below. See plans/public-hosting.md cost model.
    expect(
      catalogPrompt.length,
      'catalogPrompt is the cacheable prefix in SYSTEM_PROMPT. Must exceed 6000 chars (~1500 tokens) so Azure auto-cache (1024-token min) fires with headroom. Below this, every turn re-bills the prefix.',
    ).toBeGreaterThan(6000);
  });

  it('renderUI tool description does NOT contain catalogPrompt (avoid double-billing)', () => {
    expect(renderUI.description).not.toContain(catalogPrompt);
    expect(renderUI.description?.length).toBeLessThan(2000);
  });
});
