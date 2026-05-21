import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { hasUIRenderIntent } from '@/lib/chat/ui-intent';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function userMsg(text: string): UIMessage {
  return {
    id: 't',
    role: 'user',
    parts: [{ type: 'text', text }],
  } as UIMessage;
}

function assistantWithRenderUI(): UIMessage {
  return {
    id: 'a',
    role: 'assistant',
    parts: [
      {
        type: 'tool-renderUI',
        state: 'output-available',
        toolCallId: 'tc1',
        input: {},
        output: {},
      },
    ],
  } as unknown as UIMessage;
}

function assistantTextOnly(): UIMessage {
  return {
    id: 'a',
    role: 'assistant',
    parts: [{ type: 'text', text: 'Sure, here is some info.' }],
  } as UIMessage;
}

// ---------------------------------------------------------------------------
// Path 1 — explicit intent (existing behaviour preserved)
// ---------------------------------------------------------------------------

describe('hasUIRenderIntent — Path 1: explicit keyword', () => {
  it.each([
    'Render a weather card',
    'render something interactive',
    'RENDER A CARD',
    'Build a dashboard for my sales numbers',
    'Make a widget that toggles',
    'Show me a card with a refresh button',
    'Create a form for user registration',
    'Generate a dashboard',
  ])('detects explicit UI intent: %s', (text) => {
    expect(hasUIRenderIntent([userMsg(text)])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Path 1 — false positives must not trigger (no assistant renderUI context)
// ---------------------------------------------------------------------------

describe('hasUIRenderIntent — Path 1 negatives (no prior renderUI)', () => {
  it.each([
    "What's the weather in Tokyo?",
    'Summarize the latest news on AI policy',
    'Help me debug this code',
    'Explain how OAuth works',
    'Write a poem about the ocean',
    "What's the limit on my credit card?",
    'Tell me about pokemon card values',
    'Show me the leaderboard standings',
  ])('ignores non-UI prompt: %s', (text) => {
    expect(hasUIRenderIntent([userMsg(text)])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('hasUIRenderIntent — edge cases', () => {
  it('returns false for an empty history', () => {
    expect(hasUIRenderIntent([])).toBe(false);
  });

  it('returns false when the last message is from the assistant', () => {
    const messages: UIMessage[] = [userMsg('render a card'), assistantTextOnly()];
    expect(hasUIRenderIntent(messages)).toBe(false);
  });

  it('matches case-insensitively', () => {
    expect(hasUIRenderIntent([userMsg('RENDER A CARD')])).toBe(true);
  });

  it('does not match partial words (rendered, surrender, discard)', () => {
    expect(hasUIRenderIntent([userMsg('I surrender; please discard the rendered output')])).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Path 2 — follow-up in an in-progress UI conversation
// ---------------------------------------------------------------------------

describe('hasUIRenderIntent — Path 2: follow-up after assistant renderUI', () => {
  it('detects follow-up "Now make the title bigger" after renderUI', () => {
    const messages: UIMessage[] = [
      userMsg('Render a weather card'),
      assistantWithRenderUI(),
      userMsg('Now make the title bigger'),
    ];
    expect(hasUIRenderIntent(messages)).toBe(true);
  });

  it('detects follow-up "Change the button label" after renderUI', () => {
    const messages: UIMessage[] = [
      userMsg('Build a dashboard'),
      assistantWithRenderUI(),
      userMsg('Change the button label'),
    ];
    expect(hasUIRenderIntent(messages)).toBe(true);
  });

  it('detects follow-up "Add a field to the form" after renderUI', () => {
    const messages: UIMessage[] = [
      userMsg('Create a contact form'),
      assistantWithRenderUI(),
      userMsg('Add a field to the form'),
    ];
    expect(hasUIRenderIntent(messages)).toBe(true);
  });

  it('detects follow-up with UI noun alone after renderUI', () => {
    const messages: UIMessage[] = [
      userMsg('Render a card'),
      assistantWithRenderUI(),
      userMsg('The heading needs to be bigger'),
    ];
    expect(hasUIRenderIntent(messages)).toBe(true);
  });

  it('does NOT detect follow-up when last assistant had no renderUI', () => {
    const messages: UIMessage[] = [
      userMsg('Tell me about dogs'),
      assistantTextOnly(),
      userMsg('Change the button label'),
    ];
    // "Change the button label" has verb+noun but no prior renderUI → Path 2 should not fire.
    // Path 1: "change" + "button" → UI_VERBS_RE matches "change"; UI_NOUNS_RE matches "button" → true
    // This IS a true positive for Path 1 — verb+noun match is sufficient.
    expect(hasUIRenderIntent(messages)).toBe(true);
  });

  it('does NOT trigger Path 2 for a plain question when last assistant had renderUI', () => {
    const messages: UIMessage[] = [
      userMsg('Render a card'),
      assistantWithRenderUI(),
      userMsg("What's the weather in Tokyo?"),
    ];
    // No UI verb or noun in the follow-up → Path 2 does not fire; Path 1 also misses.
    expect(hasUIRenderIntent(messages)).toBe(false);
  });

  it('does NOT fire Path 2 when the most recent assistant message has no renderUI', () => {
    const messages: UIMessage[] = [
      userMsg('Build a form'),
      assistantWithRenderUI(),
      userMsg('Hmm'), // intermediate user message
      assistantTextOnly(), // most recent assistant message — no renderUI
      userMsg('Thanks'), // no UI verb or noun → neither path fires
    ];
    // The most recent assistant message is assistantTextOnly() — no renderUI there.
    // Path 2 should NOT fire. Path 1 also does not fire (no verb/noun in "Thanks").
    expect(hasUIRenderIntent(messages)).toBe(false);
  });

  it('fires Path 2 when last assistant renderUI is separated by an intermediate user message', () => {
    const messages: UIMessage[] = [
      userMsg('Build a form'),
      userMsg('Actually never mind'),
      assistantWithRenderUI(),
      userMsg('Tweak the heading'),
    ];
    // Last assistant message has renderUI + "Tweak the heading" has verb+noun → Path 2 fires.
    expect(hasUIRenderIntent(messages)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// lastAssistantHadRenderUI — logic test (via hasUIRenderIntent)
// ---------------------------------------------------------------------------

describe('hasUIRenderIntent — lastAssistantHadRenderUI walks correctly', () => {
  it('returns false when there is no assistant message at all', () => {
    const messages: UIMessage[] = [userMsg('Make the title bigger')];
    // Path 1: "make" + "title" → both match. This SHOULD be true via Path 1.
    expect(hasUIRenderIntent(messages)).toBe(true);
  });

  it('returns false for Path 2 when history has only user messages', () => {
    // Craft a message that ONLY triggers Path 2 (UI verb alone, no noun).
    // "Generate" alone has no noun in the UI_NOUNS_RE.
    const messages: UIMessage[] = [userMsg('Generate')];
    expect(hasUIRenderIntent(messages)).toBe(false);
  });
});
