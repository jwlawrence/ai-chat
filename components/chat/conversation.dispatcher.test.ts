/**
 * Behavioral tests for the endpoint dispatcher (I7) and submitForm handler (I8).
 * Uses the exported factory functions so no React/DOM is required.
 */

import { createStateStore } from '@json-render/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildEndpointHandlers, buildSubmitFormHandler } from './conversation';

// ---------------------------------------------------------------------------
// Sonner mock — must be set up before imports above are evaluated in this
// module scope. vitest hoists vi.mock() calls automatically.
// ---------------------------------------------------------------------------

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStore(initial: Record<string, unknown> = {}) {
  return createStateStore(initial);
}

function makeInFlightRef() {
  return { current: new Map<string, symbol>() };
}

const ACTION_NAME = 'fetchWeather';
const ACTION_SET = new Set([ACTION_NAME]);

// ---------------------------------------------------------------------------
// I7 — Endpoint dispatcher behavioral tests
// ---------------------------------------------------------------------------

describe('buildEndpointHandlers — I7: endpoint dispatcher', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(toast.error).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // 1. POSTed body strips _writeResponseTo and _setPendingAt
  it('does not include _writeResponseTo or _setPendingAt in the POST body', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ summary: 'Sunny', mode: 'daily' }),
    });
    const store = makeStore();
    const handlers = buildEndpointHandlers({
      store,
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
    });
    await handlers[ACTION_NAME]({
      mode: 'daily',
      _writeResponseTo: '/weather',
      _setPendingAt: '/loading',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).not.toHaveProperty('_writeResponseTo');
    expect(body).not.toHaveProperty('_setPendingAt');
    expect(body).toEqual({ mode: 'daily' });
  });

  // 2. _setPendingAt is true before fetch and false after
  it('sets _setPendingAt to true before fetch and false after resolution', async () => {
    let pendingDuringFetch: unknown;
    fetchMock.mockImplementation(async () => {
      pendingDuringFetch = store.get('/loading');
      return { ok: true, json: async () => ({}) };
    });
    const store = makeStore({ loading: false });
    const handlers = buildEndpointHandlers({
      store,
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
    });
    await handlers[ACTION_NAME]({ _setPendingAt: '/loading' });
    expect(pendingDuringFetch).toBe(true);
    expect(store.get('/loading')).toBe(false);
  });

  // 3. On res.ok === false, toast.error fires and _writeResponseTo is unchanged
  it('calls toast.error when the response is not ok and does not write _writeResponseTo', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    const store = makeStore({ weather: { summary: 'original' } });
    const handlers = buildEndpointHandlers({
      store,
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
    });
    await handlers[ACTION_NAME]({ _writeResponseTo: '/weather' });
    expect(toast.error).toHaveBeenCalledOnce();
    expect((toast.error as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(ACTION_NAME);
    expect(store.get('/weather')).toEqual({ summary: 'original' });
  });

  // 4. On network error (thrown fetch), finally clears _setPendingAt
  it('clears _setPendingAt in finally even when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const store = makeStore({ loading: false });
    const handlers = buildEndpointHandlers({
      store,
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
    });
    await handlers[ACTION_NAME]({ _setPendingAt: '/loading' });
    expect(store.get('/loading')).toBe(false);
  });

  // 5. On 2xx but malformed JSON, appropriate toast fires and _writeResponseTo is NOT written
  it('fires a distinct toast and skips writing state when res.json() throws (malformed JSON)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    const store = makeStore({ weather: 'original' });
    const handlers = buildEndpointHandlers({
      store,
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
    });
    await handlers[ACTION_NAME]({ _writeResponseTo: '/weather' });
    expect(toast.error).toHaveBeenCalledOnce();
    const msg = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(msg).toContain('invalid response');
    expect(store.get('/weather')).toBe('original');
  });

  // 6. Race coverage: second press wins; first response is discarded
  it('discards stale response when second press resolves before first', async () => {
    // Using unknown-typed resolvers so we can resolve with mock response objects
    // that don't fully satisfy the Response interface.
    // biome-ignore lint/suspicious/noExplicitAny: intentional use for test mock flexibility
    let resolveFirst!: (v: any) => void;
    // biome-ignore lint/suspicious/noExplicitAny: intentional use for test mock flexibility
    let resolveSecond!: (v: any) => void;

    const firstFetch = new Promise<Response>((res) => {
      resolveFirst = res;
    });
    const secondFetch = new Promise<Response>((res) => {
      resolveSecond = res;
    });

    let callCount = 0;
    fetchMock.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? firstFetch : secondFetch;
    });

    const store = makeStore({ weather: null });
    const inFlightRef = makeInFlightRef();
    const handlers = buildEndpointHandlers({
      store,
      inFlightRef,
      actionNames: ACTION_SET,
    });

    // Kick off both presses without awaiting
    const p1 = handlers[ACTION_NAME]({ _writeResponseTo: '/weather' });
    const p2 = handlers[ACTION_NAME]({ _writeResponseTo: '/weather' });

    // Second resolves first with its own data
    resolveSecond({ ok: true, json: async () => ({ summary: 'second' }) } as unknown as Response);
    await p2;

    // Now first resolves with its stale data
    resolveFirst({ ok: true, json: async () => ({ summary: 'STALE' }) } as unknown as Response);
    await p1;

    // Only second's data should be in state
    expect((store.get('/weather') as { summary: string }).summary).toBe('second');
  });
});

// ---------------------------------------------------------------------------
// I8 — submitForm behavioral tests
// ---------------------------------------------------------------------------

describe('buildSubmitFormHandler — I8: submitForm', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  // All contact-form tests need all required fields to pass the client-side
  // validation gate introduced in Part B. Using a complete valid fixture.
  const validContactData = {
    name: 'Alice Smith',
    email: 'alice@bigcorp.com',
    topic: 'Say hello',
    message: 'hi',
  };

  it('calls sendMessage with correct parts and locks the card', async () => {
    const store = makeStore({ contact: { ...validContactData } });
    const lockedRef = { current: false };
    const isLockedValues: boolean[] = [];
    const setIsLocked = (v: boolean) => {
      isLockedValues.push(v);
    };
    const sendMessage = vi.fn().mockResolvedValue(undefined);

    const handler = buildSubmitFormHandler({
      store,
      lockedRef,
      setIsLocked,
      sendMessage: sendMessage as unknown as Parameters<
        typeof buildSubmitFormHandler
      >[0]['sendMessage'],
      specRoot: 'form-card',
    });

    await handler({ formName: 'contact', label: 'Submitted contact form' });

    expect(sendMessage).toHaveBeenCalledOnce();
    const arg = sendMessage.mock.calls[0][0] as {
      role: string;
      parts: Array<{ type: string; data?: Record<string, unknown>; text?: string }>;
    };
    expect(arg.role).toBe('user');
    const chipPart = arg.parts.find((p) => p.type === 'data-press');
    expect(chipPart).toBeDefined();
    expect(chipPart?.data?.action).toBe('submitForm');
    expect(chipPart?.data?.mode).toBe('model');
    expect(chipPart?.data?.sourceRootId).toBe('form-card');
    expect(chipPart?.data?.data).toMatchObject(validContactData);

    // Card should be locked after successful send
    expect(lockedRef.current).toBe(true);
    expect(isLockedValues).toContain(true);
  });

  it('locks the card immediately on press before sendMessage resolves', async () => {
    const store = makeStore({ contact: { ...validContactData } });
    const lockedRef = { current: false };
    let lockedDuringSend = false;
    const setIsLocked = vi.fn();
    const sendMessage = vi.fn().mockImplementation(async () => {
      lockedDuringSend = lockedRef.current;
    });

    const handler = buildSubmitFormHandler({
      store,
      lockedRef,
      setIsLocked,
      sendMessage: sendMessage as unknown as Parameters<
        typeof buildSubmitFormHandler
      >[0]['sendMessage'],
      specRoot: 'form-card',
    });

    await handler({ formName: 'contact' });
    expect(lockedDuringSend).toBe(true);
  });

  it('rolls back lock when sendMessage rejects', async () => {
    const store = makeStore({ contact: { ...validContactData } });
    const lockedRef = { current: false };
    const isLockedValues: boolean[] = [];
    const setIsLocked = (v: boolean) => {
      isLockedValues.push(v);
    };
    const sendMessage = vi.fn().mockRejectedValue(new Error('network failure'));

    const handler = buildSubmitFormHandler({
      store,
      lockedRef,
      setIsLocked,
      sendMessage: sendMessage as unknown as Parameters<
        typeof buildSubmitFormHandler
      >[0]['sendMessage'],
      specRoot: 'form-card',
    });

    await handler({ formName: 'contact' });

    // Lock should have been set then rolled back
    expect(isLockedValues).toEqual([true, false]);
    expect(lockedRef.current).toBe(false);
  });

  it('does not call sendMessage and never locks for empty formName', async () => {
    const store = makeStore({});
    const lockedRef = { current: false };
    const isLockedValues: boolean[] = [];
    const setIsLocked = (v: boolean) => {
      isLockedValues.push(v);
    };
    const sendMessage = vi.fn();

    const handler = buildSubmitFormHandler({
      store,
      lockedRef,
      setIsLocked,
      sendMessage: sendMessage as unknown as Parameters<
        typeof buildSubmitFormHandler
      >[0]['sendMessage'],
      specRoot: 'form-card',
    });

    await handler({ formName: '' });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(lockedRef.current).toBe(false);
    // Lock is not acquired for a missing formName — early return before locking.
    expect(isLockedValues).toEqual([]);
  });
});
