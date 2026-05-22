/**
 * Fix #4: Unit tests for the messageHasRenderUI predicate exported from
 * conversation.tsx.  Pure function — no JSX or DOM required.
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import type { PressData } from './conversation';
import { messageHasPressChip, messageHasRenderUI, messageHasVisibleOutput } from './conversation';

// ---------------------------------------------------------------------------
// Helper: build a minimal UIMessage with the given parts
// ---------------------------------------------------------------------------

function makeMessage(parts: UIMessage['parts'], role: UIMessage['role'] = 'assistant'): UIMessage {
  return {
    id: 'test-id',
    role,
    parts,
    content: '',
    createdAt: new Date(),
  } as UIMessage;
}

// ---------------------------------------------------------------------------
// Tests — Fix #4
// ---------------------------------------------------------------------------

describe('messageHasRenderUI — Fix #4', () => {
  it('returns true for a message with a tool-renderUI part in output-available state', () => {
    const m = makeMessage([
      {
        type: 'tool-renderUI',
        state: 'output-available',
        toolCallId: 'tc1',
        input: {},
        output: {},
      },
    ] as UIMessage['parts']);
    expect(messageHasRenderUI(m)).toBe(true);
  });

  it('returns true for a message with a tool-renderUI part in input-streaming state', () => {
    const m = makeMessage([
      { type: 'tool-renderUI', state: 'input-streaming', toolCallId: 'tc1', input: {} },
    ] as unknown as UIMessage['parts']);
    expect(messageHasRenderUI(m)).toBe(true);
  });

  it('returns true for a message with a tool-renderUI part in input-available state', () => {
    const m = makeMessage([
      { type: 'tool-renderUI', state: 'input-available', toolCallId: 'tc1', input: {} },
    ] as unknown as UIMessage['parts']);
    expect(messageHasRenderUI(m)).toBe(true);
  });

  it('returns false for a message with only text parts', () => {
    const m = makeMessage([{ type: 'text', text: 'Hello!' }] as UIMessage['parts']);
    expect(messageHasRenderUI(m)).toBe(false);
  });

  it('returns false for a message with a tool-webSearch part', () => {
    const m = makeMessage([
      {
        type: 'tool-webSearch',
        state: 'output-available',
        toolCallId: 'tc2',
        input: { query: 'cats' },
        output: { results: [] },
      },
    ] as UIMessage['parts']);
    expect(messageHasRenderUI(m)).toBe(false);
  });

  it('returns false for a message with no parts', () => {
    const m = makeMessage([] as UIMessage['parts']);
    expect(messageHasRenderUI(m)).toBe(false);
  });

  it('returns true when tool-renderUI is mixed with other part types', () => {
    const m = makeMessage([
      { type: 'text', text: 'Some text' },
      {
        type: 'tool-renderUI',
        state: 'output-available',
        toolCallId: 'tc3',
        input: {},
        output: {},
      },
    ] as UIMessage['parts']);
    expect(messageHasRenderUI(m)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 3: messageHasPressChip
// ---------------------------------------------------------------------------

describe('messageHasPressChip — Phase 3', () => {
  it('returns true when a user message has a data-press part', () => {
    const m = makeMessage(
      [
        {
          type: 'data-press',
          data: { action: 'sendToModel', label: 'Continue', mode: 'model' } satisfies PressData,
        },
        { type: 'text', text: '[User pressed: Continue]' },
      ] as unknown as UIMessage['parts'],
      'user',
    );
    expect(messageHasPressChip(m)).toBe(true);
  });

  it('returns false for a normal user text message', () => {
    const m = makeMessage([{ type: 'text', text: 'hello' }] as UIMessage['parts'], 'user');
    expect(messageHasPressChip(m)).toBe(false);
  });

  it('returns false for an assistant message with a tool-renderUI part', () => {
    const m = makeMessage([
      {
        type: 'tool-renderUI',
        state: 'output-available',
        toolCallId: 'tc',
        input: {},
        output: {},
      },
    ] as UIMessage['parts']);
    expect(messageHasPressChip(m)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Fix #3 (perf) + Fix #12: lockedRoots derivation — inline useMemo logic
//
// hasPressForRoot was a standalone exported function called per card inside the
// message-map loop (O(cards × messages)). It has been replaced by a useMemo
// that computes lockedRoots once per render (O(messages)).
//
// We test the derivation logic directly here as a pure unit test (no React
// rendering required) by mirroring the useMemo body.
// ---------------------------------------------------------------------------

// Mirror of the lockedRoots useMemo body from ChatConversation.
function deriveLockedRoots(messages: UIMessage[]): Set<string> {
  const s = new Set<string>();
  for (const m of messages) {
    for (const p of m.parts ?? []) {
      if (p.type !== 'data-press') continue;
      const chipData = (p as { data?: PressData }).data;
      if (chipData?.sourceRootId && chipData.mode === 'model') {
        s.add(chipData.sourceRootId);
      }
    }
  }
  return s;
}

describe('lockedRoots derivation — Fix #3 + Fix #12', () => {
  function makePressMsg(sourceRootId: string, mode?: PressData['mode']): UIMessage {
    return makeMessage(
      [
        {
          type: 'data-press',
          data: { action: 'sendToModel', label: 'Approve', sourceRootId, mode } satisfies PressData,
        } as unknown as UIMessage['parts'][number],
        { type: 'text', text: '[User pressed: Approve]' },
      ] as UIMessage['parts'],
      'user',
    );
  }

  it('adds root id when chip has mode: "model"', () => {
    const messages: UIMessage[] = [makePressMsg('card-1', 'model')];
    expect(deriveLockedRoots(messages).has('card-1')).toBe(true);
  });

  it('does not add root id when chip has no mode (legacy graceful degradation)', () => {
    const messages: UIMessage[] = [makePressMsg('card-1', undefined)];
    expect(deriveLockedRoots(messages).has('card-1')).toBe(false);
  });

  it('does not add root id when chip has mode: "endpoint" (Phase 4 — card stays unlocked)', () => {
    const messages: UIMessage[] = [makePressMsg('card-1', 'endpoint')];
    expect(deriveLockedRoots(messages).has('card-1')).toBe(false);
  });

  it('does not add root id when chip has mode: "local"', () => {
    const messages: UIMessage[] = [makePressMsg('card-1', 'local')];
    expect(deriveLockedRoots(messages).has('card-1')).toBe(false);
  });

  it('returns empty set for an empty transcript', () => {
    expect(deriveLockedRoots([]).size).toBe(0);
  });

  it('does not add root id when chip has no sourceRootId', () => {
    const legacy = makeMessage(
      [
        {
          type: 'data-press',
          data: { action: 'sendToModel', label: 'Old', mode: 'model' } satisfies PressData,
        } as unknown as UIMessage['parts'][number],
      ] as UIMessage['parts'],
      'user',
    );
    expect(deriveLockedRoots([legacy]).size).toBe(0);
  });

  it('accumulates multiple model-mode chips from different cards', () => {
    const messages: UIMessage[] = [
      makePressMsg('card-a', 'model'),
      makePressMsg('card-b', 'model'),
    ];
    const roots = deriveLockedRoots(messages);
    expect(roots.has('card-a')).toBe(true);
    expect(roots.has('card-b')).toBe(true);
    expect(roots.has('card-c')).toBe(false);
  });

  it('does not lock a card whose chip exists with non-matching root', () => {
    const messages: UIMessage[] = [makePressMsg('card-x', 'model')];
    expect(deriveLockedRoots(messages).has('card-y')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 5: submitForm chip lock behaviour
//
// submitForm chips use mode: 'model' so they should lock the originating card
// on reload — same as sendToModel chips.
// ---------------------------------------------------------------------------

describe('lockedRoots — Phase 5: submitForm chips lock cards', () => {
  function makeSubmitMsg(sourceRootId: string): UIMessage {
    return makeMessage(
      [
        {
          type: 'data-press',
          data: {
            action: 'submitForm',
            label: 'Submitted contact',
            data: { email: 'a@b.com' },
            sourceRootId,
            mode: 'model',
          } satisfies PressData,
        } as unknown as UIMessage['parts'][number],
        { type: 'text', text: '[Submitted form contact: {"email":"a@b.com"}]' },
      ] as UIMessage['parts'],
      'user',
    );
  }

  it('adds root id when submitForm chip has mode: "model"', () => {
    const messages: UIMessage[] = [makeSubmitMsg('form-card-1')];
    expect(deriveLockedRoots(messages).has('form-card-1')).toBe(true);
  });

  it('does not add root id for a submitForm chip without sourceRootId', () => {
    const m = makeMessage(
      [
        {
          type: 'data-press',
          data: {
            action: 'submitForm',
            label: 'Submitted',
            mode: 'model',
            // no sourceRootId
          } satisfies PressData,
        } as unknown as UIMessage['parts'][number],
      ] as UIMessage['parts'],
      'user',
    );
    expect(deriveLockedRoots([m]).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// I4: messageHasVisibleOutput — spinner predicate
// ---------------------------------------------------------------------------

describe('messageHasVisibleOutput — I4', () => {
  it('returns true for a text part with content', () => {
    const m = makeMessage([{ type: 'text', text: 'Hello' }] as UIMessage['parts']);
    expect(messageHasVisibleOutput(m)).toBe(true);
  });

  it('returns false for a text part with empty text', () => {
    const m = makeMessage([{ type: 'text', text: '' }] as UIMessage['parts']);
    expect(messageHasVisibleOutput(m)).toBe(false);
  });

  it('returns false for a tool-* part with state=input-streaming', () => {
    const m = makeMessage([
      { type: 'tool-renderUI', state: 'input-streaming', toolCallId: 'tc', input: {} },
    ] as unknown as UIMessage['parts']);
    expect(messageHasVisibleOutput(m)).toBe(false);
  });

  it('returns false for a tool-* part with state=input-available', () => {
    const m = makeMessage([
      { type: 'tool-renderUI', state: 'input-available', toolCallId: 'tc', input: {} },
    ] as unknown as UIMessage['parts']);
    expect(messageHasVisibleOutput(m)).toBe(false);
  });

  it('returns true for a tool-* part with state=output-available', () => {
    const m = makeMessage([
      { type: 'tool-renderUI', state: 'output-available', toolCallId: 'tc', input: {}, output: {} },
    ] as unknown as UIMessage['parts']);
    expect(messageHasVisibleOutput(m)).toBe(true);
  });

  it('returns true for a tool-* part with state=output-error', () => {
    const m = makeMessage([
      { type: 'tool-renderUI', state: 'output-error', toolCallId: 'tc', input: {} },
    ] as unknown as UIMessage['parts']);
    expect(messageHasVisibleOutput(m)).toBe(true);
  });

  it('returns false for a tool-* part with no state', () => {
    const m = makeMessage([
      { type: 'tool-renderUI', toolCallId: 'tc', input: {} },
    ] as unknown as UIMessage['parts']);
    expect(messageHasVisibleOutput(m)).toBe(false);
  });
});
