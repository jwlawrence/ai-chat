/**
 * Regression guard for `AI_APICallError: Item with id 'fc_…' not found` (400).
 *
 * The OpenAI Responses provider that `azure.responses()` is built on has an
 * asymmetry: when building the request `input` it defaults `store` to TRUE
 * (`store: openaiOptions?.store ?? true`), but it forwards `store` to the API
 * verbatim, so leaving it unset sends `store: undefined`. With store believed
 * true, any assistant turn replayed from history is collapsed into a bare
 * `{ type: 'item_reference', id }` — a pointer to an item the server is
 * expected to still hold. Azure does not retain those items, so the second and
 * every later turn of a conversation failed with:
 *
 *   Item with id 'fc_…' not found.      (a tool call, e.g. renderUI)
 *   Item with id 'msg_…' not found.     (a plain assistant message)
 *
 * Verified against the live API: with `store` unset the request input was
 * [developer, user, item_reference, function_call_output, item_reference, user]
 * and returned 400; with `store: false` it was
 * [developer, user, function_call, function_call_output, assistant, user]
 * and succeeded. Sending store:false makes every request self-contained,
 * which is the only correct mode for a stateless deployment.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({
  getUserId: vi.fn(async () => 'user-1'),
}));

vi.mock('@/lib/budget/preflight', () => ({
  preflight: vi.fn(async () => ({ allow: true })),
  CAPS: { dailyGlobalUsd: 5, monthlyGlobalUsd: 30, anonymousDailyUsd: 0.2, userDailyUsd: 1 },
}));

vi.mock('@/lib/ai/providers', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/ai/providers')>();
  return { ...real, getModel: vi.fn(() => ({ _isDummy: true })) };
});

vi.mock('@/lib/db/queries', () => ({
  createSession: vi.fn(async () => ({ id: 'sess-1' })),
  getSession: vi.fn(async () => null),
  countMessages: vi.fn(async () => 0),
  appendMessages: vi.fn(async () => {}),
  touchSession: vi.fn(async () => {}),
  trimTrailingMessages: vi.fn(async () => {}),
  renameSession: vi.fn(async () => {}),
}));

vi.mock('ai', async (importOriginal) => {
  const real = await importOriginal<typeof import('ai')>();
  return {
    ...real,
    streamText: vi.fn(() => ({
      toUIMessageStream: () => new ReadableStream({ start: (c) => c.close() }),
      usage: Promise.resolve({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
      finishReason: Promise.resolve('stop'),
    })),
    // Unlike the sibling route tests, this one must actually RUN `execute`:
    // streamText is called inside it, and its options are what we assert on.
    createUIMessageStream: vi.fn(({ execute, onFinish }) => {
      void Promise.resolve().then(async () => {
        await execute?.({ writer: { write: () => {}, merge: () => {} } }).catch(() => {});
        if (onFinish) {
          await onFinish({ messages: [], responseMessage: undefined }).catch(() => {});
        }
      });
      return new ReadableStream({ start: (c) => c.close() });
    }),
    createUIMessageStreamResponse: vi.fn(() => new Response(null, { status: 200 })),
    convertToModelMessages: vi.fn(async () => []),
    stepCountIs: vi.fn(() => () => false),
  };
});

import { streamText } from 'ai';
import { STATELESS_PROVIDER_OPTIONS } from '@/lib/ai/providers';
import { POST } from './route';

describe('chat route — Responses API statelessness', () => {
  it('passes store:false so replayed history is inlined, never sent as item_reference', async () => {
    const req = new Request('http://test/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-5.4-mini',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
      }),
    });
    await POST(req);
    // createUIMessageStream's execute runs on a microtask; let it land.
    await new Promise((r) => setTimeout(r, 0));

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: expect.objectContaining({ azure: { store: false } }),
      }),
    );
  });

  it('exports the stateless options under the azure key the provider reads', () => {
    // The provider picks its options namespace with
    // `config.provider.includes('azure') ? 'azure' : 'openai'`, and every model
    // this app builds comes from createAzure — so 'azure' is the key that is
    // actually read. Under any other key the option is silently ignored.
    expect(STATELESS_PROVIDER_OPTIONS).toEqual({ azure: { store: false } });
  });
});
