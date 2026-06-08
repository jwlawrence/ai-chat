/**
 * Fix #4: Unit tests for the messageHasRenderUI predicate exported from
 * conversation.tsx.  Pure function — no JSX or DOM required.
 */

import { createStateStore } from '@json-render/core';
import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import type { PressData } from './conversation';
import {
  buildSubmitFormHandler,
  messageHasPressChip,
  messageHasRenderableContent,
  messageHasRenderUI,
  messageHasVisibleOutput,
} from './conversation';

// ---------------------------------------------------------------------------
// R — client Web3Forms dispatch spy
//
// Asserts that conversation.tsx's submitForm path (via buildSubmitFormHandler)
// calls sendContactFormToEmail with the expected accessKey and parsed fields
// when formName === 'contact'. Mocks the helper at the module boundary so no
// real HTTP call is made.
// ---------------------------------------------------------------------------

vi.mock('@/lib/contact/web3forms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/contact/web3forms')>();
  return {
    ...actual,
    sendContactFormToEmail: vi.fn(async () => ({ ok: true })),
  };
});

// Mock sonner so we can assert on the toast surfaced when the client-side
// Web3Forms send fails. Only the methods conversation.tsx calls need stubbing.
vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

describe('R — submitForm: calls web3forms with accessKey + parsed fields', () => {
  it('invokes sendContactFormToEmail with NEXT_PUBLIC key and contact fields', async () => {
    const { sendContactFormToEmail } = await import('@/lib/contact/web3forms');
    const mockSend = vi.mocked(sendContactFormToEmail);
    mockSend.mockClear();

    const store = createStateStore({
      contact: {
        name: 'Alice Smith',
        email: 'alice@bigcorp.com',
        topic: 'Say hello',
        message: 'Can you ship fast?',
      },
    });
    const lockedRef = { current: false };
    const sendMessage = vi.fn(async () => {});
    const handler = buildSubmitFormHandler({
      store,
      lockedRef,
      setIsLocked: () => {},
      sendMessage,
      specRoot: 'form-card',
    });

    await handler({ formName: 'contact', label: 'Submit contact' });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [submission, opts] = mockSend.mock.calls[0];
    // The accessKey must be the NEXT_PUBLIC env var (may be undefined in test
    // env, but the call itself must happen with the right shape).
    expect(opts).toHaveProperty('accessKey');
    expect(submission).toMatchObject({
      name: 'Alice Smith',
      email: 'alice@bigcorp.com',
      topic: 'Say hello',
      message: 'Can you ship fast?',
    });
  });

  it('does not call sendContactFormToEmail for non-contact forms', async () => {
    const { sendContactFormToEmail } = await import('@/lib/contact/web3forms');
    const mockSend = vi.mocked(sendContactFormToEmail);
    mockSend.mockClear();

    const store = createStateStore({ newsletter: { email: 'x@y.com' } });
    const handler = buildSubmitFormHandler({
      store,
      lockedRef: { current: false },
      setIsLocked: () => {},
      sendMessage: vi.fn(async () => {}),
      specRoot: 'news-card',
    });

    await handler({ formName: 'newsletter', label: 'Subscribe' });

    expect(mockSend).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// R2 — contact form client-side validation (Part B)
//
// Valid contact submit proceeds to sendContactFormToEmail + sendMessage.
// Invalid contact submit (missing/bad email) blocks send, leaves lock open,
// and writes the error into /_errors/contact/<field>.
// ---------------------------------------------------------------------------

describe('R2 — submitForm: client-side contact validation', () => {
  it('INVALID: does not call sendContactFormToEmail or sendMessage when email is missing', async () => {
    const { sendContactFormToEmail } = await import('@/lib/contact/web3forms');
    const mockSend = vi.mocked(sendContactFormToEmail);
    mockSend.mockClear();

    const store = createStateStore({
      contact: {
        name: 'Alice Smith',
        topic: 'Say hello',
        message: 'hi',
        // email intentionally absent
      },
    });
    const lockedRef = { current: false };
    const sendMessage = vi.fn(async () => {});
    const handler = buildSubmitFormHandler({
      store,
      lockedRef,
      setIsLocked: () => {},
      sendMessage,
      specRoot: 'form-card',
    });

    await handler({ formName: 'contact', label: 'Submit contact' });

    expect(mockSend).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
    expect(lockedRef.current).toBe(false);
    const emailError = store.get('/_errors/contact/email');
    expect(typeof emailError).toBe('string');
    expect((emailError as string).length).toBeGreaterThan(0);
  });

  it('VALID: clears all /_errors/contact/* and calls sendContactFormToEmail + sendMessage', async () => {
    const { sendContactFormToEmail } = await import('@/lib/contact/web3forms');
    const mockSend = vi.mocked(sendContactFormToEmail);
    mockSend.mockClear();

    // Seed a pre-existing error to confirm it gets cleared on valid submit.
    const store = createStateStore({
      contact: {
        name: 'Alice Smith',
        email: 'alice@bigcorp.com',
        topic: 'Say hello',
        message: 'hi',
      },
      _errors: {
        contact: { email: 'Enter your email' },
      },
    });
    const lockedRef = { current: false };
    const sendMessage = vi.fn(async () => {});
    const handler = buildSubmitFormHandler({
      store,
      lockedRef,
      setIsLocked: () => {},
      sendMessage,
      specRoot: 'form-card',
    });

    await handler({ formName: 'contact', label: 'Submit contact' });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    // All error paths must be cleared (undefined) after valid submit.
    expect(store.get('/_errors/contact/email')).toBeUndefined();
    expect(store.get('/_errors/contact/name')).toBeUndefined();
    expect(store.get('/_errors/contact/topic')).toBeUndefined();
    expect(store.get('/_errors/contact/message')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// R3 — contact submit: surfaces a toast when the client-side send fails
//
// The Web3Forms POST is fired fire-and-forget (`void send(...).then(...)`), so
// the failure toast lands in a detached microtask after the handler resolves.
// vi.waitFor polls across microtasks until the .then callback runs.
// ---------------------------------------------------------------------------

describe('R3 — submitForm: toasts on a failed client-side send', () => {
  it('fires toast.warning("Email delivery failed", …) when send resolves ok=false', async () => {
    const { sendContactFormToEmail } = await import('@/lib/contact/web3forms');
    const { toast } = await import('sonner');
    vi.mocked(sendContactFormToEmail).mockClear();
    vi.mocked(toast.warning).mockClear();
    vi.mocked(sendContactFormToEmail).mockResolvedValueOnce({ ok: false, reason: 'send_failed' });

    const store = createStateStore({
      contact: {
        name: 'Alice Smith',
        email: 'alice@bigcorp.com',
        topic: 'Say hello',
        message: 'Can you ship fast?',
      },
    });
    const handler = buildSubmitFormHandler({
      store,
      lockedRef: { current: false },
      setIsLocked: () => {},
      sendMessage: vi.fn(async () => {}),
      specRoot: 'form-card',
    });

    await handler({ formName: 'contact', label: 'Submit contact' });

    await vi.waitFor(() =>
      expect(toast.warning).toHaveBeenCalledWith('Email delivery failed', expect.anything()),
    );
  });
});

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

// ---------------------------------------------------------------------------
// Bug 3: messageHasRenderableContent — empty-bubble guard
// ---------------------------------------------------------------------------

describe('messageHasRenderableContent', () => {
  it('returns false for a contact-submit user message (data-press hideTranscriptChip + text)', () => {
    // THE bug case: both parts render nothing, so the enclosing <Message> should be skipped.
    const m = makeMessage(
      [
        {
          type: 'data-press',
          data: {
            action: 'submitForm',
            label: 'Submitted contact',
            hideTranscriptChip: true,
            mode: 'model',
          } satisfies PressData,
        } as unknown as UIMessage['parts'][number],
        { type: 'text', text: '[Submitted form contact: {}]' },
      ] as UIMessage['parts'],
      'user',
    );
    expect(messageHasRenderableContent(m)).toBe(false);
  });

  it('returns true for a press chip without hideTranscriptChip', () => {
    const m = makeMessage(
      [
        {
          type: 'data-press',
          data: { action: 'sendToModel', label: 'Continue', mode: 'model' } satisfies PressData,
        } as unknown as UIMessage['parts'][number],
        { type: 'text', text: '[User pressed: Continue]' },
      ] as UIMessage['parts'],
      'user',
    );
    expect(messageHasRenderableContent(m)).toBe(true);
  });

  it('returns true for an assistant message with tool-renderUI output-available', () => {
    const m = makeMessage(
      [
        {
          type: 'tool-renderUI',
          state: 'output-available',
          toolCallId: 'tc',
          input: {},
          output: {},
        },
      ] as unknown as UIMessage['parts'],
      'assistant',
    );
    expect(messageHasRenderableContent(m)).toBe(true);
  });

  it('returns true for a message with non-empty text', () => {
    const m = makeMessage([{ type: 'text', text: 'hi' }] as UIMessage['parts'], 'user');
    expect(messageHasRenderableContent(m)).toBe(true);
  });

  it('returns false for a message with empty text only', () => {
    const m = makeMessage([{ type: 'text', text: '' }] as UIMessage['parts'], 'user');
    expect(messageHasRenderableContent(m)).toBe(false);
  });

  it('returns false for an assistant message with tool-renderUI input-streaming (not yet visible)', () => {
    const m = makeMessage(
      [
        { type: 'tool-renderUI', state: 'input-streaming', toolCallId: 'tc', input: {} },
      ] as unknown as UIMessage['parts'],
      'assistant',
    );
    expect(messageHasRenderableContent(m)).toBe(false);
  });
});
