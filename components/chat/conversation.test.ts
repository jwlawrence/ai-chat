/**
 * Fix #4: Unit tests for the messageHasRenderUI predicate exported from
 * conversation.tsx.  Pure function — no JSX or DOM required.
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { messageHasRenderUI } from './conversation';

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
