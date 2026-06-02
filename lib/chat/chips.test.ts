import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { applyRichChipPrompts, CHIP_PROMPTS, type ChipId, isChipId } from '@/lib/chat/chips';

function userMsg(text: string, opts?: { chipId?: ChipId | string }): UIMessage {
  return {
    id: 'u',
    role: 'user',
    parts: [{ type: 'text', text }],
    ...(opts?.chipId ? { metadata: { chipId: opts.chipId } } : {}),
  } as UIMessage;
}

function assistantMsg(): UIMessage {
  return { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'ok' }] } as UIMessage;
}

/**
 * Build a fresh per-test prompts map so cases stay isolated. Previously
 * tests mutated the exported RICH_CHIP_PROMPTS and restored it in afterEach,
 * which was brittle under parallel runs and obscured intent. The injectable
 * `prompts` parameter on applyRichChipPrompts makes the mutation unnecessary.
 */
function buildPrompts(overrides: Partial<Record<ChipId, string>> = {}): Record<ChipId, string> {
  return {
    dashboard: 'RICH DASHBOARD',
    composition: 'RICH COMPOSITION',
    charts: 'RICH CHARTS',
    interactive: 'RICH INTERACTIVE',
    ...overrides,
  };
}

describe('CHIP_PROMPTS shape', () => {
  it('exposes exactly the four expected chip ids in narrative order', () => {
    expect(CHIP_PROMPTS.map((c) => c.id)).toEqual([
      'dashboard',
      'composition',
      'charts',
      'interactive',
    ]);
  });
});

describe('isChipId', () => {
  it('accepts every CHIP_PROMPTS id', () => {
    for (const chip of CHIP_PROMPTS) {
      expect(isChipId(chip.id)).toBe(true);
    }
  });

  it('rejects unknown values', () => {
    expect(isChipId('not-a-chip')).toBe(false);
    expect(isChipId(undefined)).toBe(false);
    expect(isChipId(42)).toBe(false);
  });
});

describe('applyRichChipPrompts', () => {
  it('returns the same array when there are no messages', () => {
    const msgs: UIMessage[] = [];
    expect(applyRichChipPrompts(msgs, buildPrompts())).toBe(msgs);
  });

  it('returns the same array when the last message is not from the user', () => {
    const msgs = [userMsg('hi', { chipId: 'dashboard' }), assistantMsg()];
    expect(applyRichChipPrompts(msgs, buildPrompts())).toBe(msgs);
  });

  it('returns the same array when the last user message has no chipId', () => {
    const msgs = [userMsg('hi')];
    expect(applyRichChipPrompts(msgs, buildPrompts())).toBe(msgs);
  });

  it('returns the same array when the chipId is unknown', () => {
    const msgs = [userMsg('hi', { chipId: 'bogus' })];
    expect(applyRichChipPrompts(msgs, buildPrompts())).toBe(msgs);
  });

  it('swaps the text of the last user message when chipId resolves', () => {
    const prompts = buildPrompts({ dashboard: 'RICH DASHBOARD PROMPT' });
    const original = userMsg('Show a dashboard.', { chipId: 'dashboard' });
    const result = applyRichChipPrompts([original], prompts);
    const swappedParts = (result[0].parts ?? []) as { type: string; text?: string }[];
    expect(swappedParts).toHaveLength(1);
    expect(swappedParts[0]).toMatchObject({ type: 'text', text: 'RICH DASHBOARD PROMPT' });
    // Original message must not be mutated.
    const originalParts = (original.parts ?? []) as { type: string; text?: string }[];
    expect(originalParts[0]).toMatchObject({ text: 'Show a dashboard.' });
  });

  it('preserves prior messages by reference', () => {
    const a = assistantMsg();
    const u = userMsg('older', { chipId: 'dashboard' });
    const last = userMsg('Plot some data in a graph.', { chipId: 'charts' });
    const result = applyRichChipPrompts([a, u, last], buildPrompts());
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(u);
    expect(result[2]).not.toBe(last);
  });

  it('preserves non-text parts (e.g. data-press) when swapping text', () => {
    const last = {
      id: 'u',
      role: 'user',
      parts: [
        { type: 'data-press', data: { action: 'sendToModel' } },
        { type: 'text', text: 'Build a form.' },
      ],
      metadata: { chipId: 'interactive' },
    } as unknown as UIMessage;
    const result = applyRichChipPrompts([last], buildPrompts({ interactive: 'RICH FORM' }));
    const parts = (result[0].parts ?? []) as { type: string; text?: string }[];
    expect(parts).toHaveLength(2);
    expect(parts[0]).toMatchObject({ type: 'data-press' });
    expect(parts[1]).toMatchObject({ type: 'text', text: 'RICH FORM' });
  });

  it('appends a text part when the last message has none', () => {
    const last = {
      id: 'u',
      role: 'user',
      parts: [{ type: 'data-press', data: { action: 'sendToModel' } }],
      metadata: { chipId: 'dashboard' },
    } as unknown as UIMessage;
    const result = applyRichChipPrompts([last], buildPrompts());
    const parts = (result[0].parts ?? []) as { type: string; text?: string }[];
    expect(parts).toHaveLength(2);
    expect(parts[1]).toMatchObject({ type: 'text', text: 'RICH DASHBOARD' });
  });

  it('uses the production RICH_CHIP_PROMPTS map by default when no prompts arg is given', () => {
    // Smoke test that the default-arg path resolves a real prompt body rather
    // than the pending sentinel. Exact content is exercised by the per-chip
    // browser dogfood; here we just check that "something rich got swapped".
    const last = userMsg('Show a dashboard.', { chipId: 'dashboard' });
    const result = applyRichChipPrompts([last]);
    const text = ((result[0].parts ?? [])[0] as { text?: string }).text ?? '';
    expect(text.length).toBeGreaterThan(50);
    expect(text).not.toBe('Show a dashboard.');
  });
});
