/**
 * Fix #4: Unit tests for the messageHasRenderUI predicate exported from
 * conversation.tsx.  Pure function — no JSX or DOM required.
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { hasPressForRoot, messageHasPressChip, messageHasRenderUI } from './conversation';

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
        { type: 'data-press', data: { action: 'sendToModel', label: 'Continue', params: {} } },
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
// Phase 3 follow-up: hasPressForRoot — reload-survivable lock derivation
// ---------------------------------------------------------------------------

describe('hasPressForRoot — Phase 3', () => {
  function makePressMsg(sourceRootId: string): UIMessage {
    return makeMessage(
      [
        {
          type: 'data-press',
          data: { action: 'sendToModel', label: 'Approve', params: {}, sourceRootId },
        } as unknown as UIMessage['parts'][number],
        { type: 'text', text: '[User pressed: Approve]' },
      ] as UIMessage['parts'],
      'user',
    );
  }

  it('returns true when any message carries a press chip for the given root', () => {
    const messages: UIMessage[] = [
      makeMessage([{ type: 'text', text: 'hi' }] as UIMessage['parts'], 'user'),
      makePressMsg('card-1'),
    ];
    expect(hasPressForRoot(messages, 'card-1')).toBe(true);
  });

  it('returns false when no message references the given root', () => {
    const messages: UIMessage[] = [makePressMsg('card-1')];
    expect(hasPressForRoot(messages, 'card-2')).toBe(false);
  });

  it('returns false for an empty transcript', () => {
    expect(hasPressForRoot([], 'card-1')).toBe(false);
  });

  it('returns false when a chip exists but has no sourceRootId (legacy chip)', () => {
    const legacy = makeMessage(
      [
        {
          type: 'data-press',
          data: { action: 'sendToModel', label: 'Old', params: {} },
        } as unknown as UIMessage['parts'][number],
      ] as UIMessage['parts'],
      'user',
    );
    expect(hasPressForRoot([legacy], 'card-1')).toBe(false);
  });

  it('distinguishes chips for different cards in the same transcript', () => {
    const messages: UIMessage[] = [makePressMsg('card-a'), makePressMsg('card-b')];
    expect(hasPressForRoot(messages, 'card-a')).toBe(true);
    expect(hasPressForRoot(messages, 'card-b')).toBe(true);
    expect(hasPressForRoot(messages, 'card-c')).toBe(false);
  });
});
