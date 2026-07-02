import { createStateStore } from '@json-render/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEndpointHandlers } from '@/lib/chat/card-handlers';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { toast } from 'sonner';

afterEach(() => vi.clearAllMocks());

// signInWith is a registered endpoint action with oneShot + responseEffect: 'navigate'.
// buildEndpointHandlers reads those fields from ACTION_REGISTRY directly.
const ACTION_NAME = 'signInWith';
const ACTION_SET = new Set([ACTION_NAME]);

function makeRefs() {
  const lockedRef = { current: false };
  const setIsLocked = vi.fn((_v: boolean) => {});
  return { lockedRef, setIsLocked };
}

function makeStore() {
  return createStateStore({});
}

function makeInFlightRef() {
  return { current: new Map<string, symbol>() };
}

describe('buildEndpointHandlers — signInWith (oneShot + navigate responseEffect)', () => {
  it('locks on press BEFORE fetch', async () => {
    const { lockedRef, setIsLocked } = makeRefs();
    const navigate = vi.fn();
    const fetchSpy = vi.fn(async () => {
      // assert lock is already set when fetch is called
      expect(lockedRef.current).toBe(true);
      expect(setIsLocked).toHaveBeenCalledWith(true);
      return new Response(JSON.stringify({ redirectTo: '/api/auth/signin/google' }), {
        status: 200,
      });
    });
    vi.stubGlobal('fetch', fetchSpy);

    const handlers = buildEndpointHandlers({
      store: makeStore(),
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
      lockedRef,
      setIsLocked,
      navigate,
    });
    await handlers[ACTION_NAME]({ provider: 'google' });
    expect(fetchSpy).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it('navigates on 2xx + valid same-origin redirectTo', async () => {
    const { lockedRef, setIsLocked } = makeRefs();
    const navigate = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ redirectTo: '/api/auth/signin/google' }), { status: 200 }),
      ),
    );

    const handlers = buildEndpointHandlers({
      store: makeStore(),
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
      lockedRef,
      setIsLocked,
      navigate,
    });
    await handlers[ACTION_NAME]({ provider: 'google' });
    expect(navigate).toHaveBeenCalledWith('/api/auth/signin/google');

    vi.unstubAllGlobals();
  });

  it('drops second invocation while locked (double-click guard)', async () => {
    const { lockedRef, setIsLocked } = makeRefs();
    const navigate = vi.fn();
    let resolveFetch: (r: Response) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    const handlers = buildEndpointHandlers({
      store: makeStore(),
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
      lockedRef,
      setIsLocked,
      navigate,
    });
    const p1 = handlers[ACTION_NAME]({ provider: 'google' });
    const p2 = handlers[ACTION_NAME]({ provider: 'github' }); // second click while locked
    await Promise.race([p2, new Promise((r) => setTimeout(r, 50))]); // p2 returns immediately
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    resolveFetch(new Response(JSON.stringify({ redirectTo: '/api/auth/signin/google' })));
    await p1;
    expect(navigate).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });

  it('rolls back lock on non-2xx', async () => {
    const { lockedRef, setIsLocked } = makeRefs();
    const navigate = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    );

    const handlers = buildEndpointHandlers({
      store: makeStore(),
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
      lockedRef,
      setIsLocked,
      navigate,
    });
    await handlers[ACTION_NAME]({ provider: 'google' });
    expect(lockedRef.current).toBe(false);
    expect(setIsLocked).toHaveBeenCalledWith(false);
    expect(navigate).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('rolls back lock on 2xx but no redirectTo', async () => {
    const { lockedRef, setIsLocked } = makeRefs();
    const navigate = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
    );

    const handlers = buildEndpointHandlers({
      store: makeStore(),
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
      lockedRef,
      setIsLocked,
      navigate,
    });
    await handlers[ACTION_NAME]({ provider: 'google' });
    expect(lockedRef.current).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('rolls back lock on 2xx but invalid JSON', async () => {
    const { lockedRef, setIsLocked } = makeRefs();
    const navigate = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{not json', { status: 200 })),
    );

    const handlers = buildEndpointHandlers({
      store: makeStore(),
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
      lockedRef,
      setIsLocked,
      navigate,
    });
    await handlers[ACTION_NAME]({ provider: 'google' });
    expect(lockedRef.current).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('rolls back and refuses absolute external URL (open-redirect defense)', async () => {
    const { lockedRef, setIsLocked } = makeRefs();
    const navigate = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ redirectTo: 'https://evil.example/phish' }), {
            status: 200,
          }),
      ),
    );

    const handlers = buildEndpointHandlers({
      store: makeStore(),
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
      lockedRef,
      setIsLocked,
      navigate,
    });
    await handlers[ACTION_NAME]({ provider: 'google' });
    expect(navigate).not.toHaveBeenCalled();
    expect(lockedRef.current).toBe(false);

    vi.unstubAllGlobals();
  });

  it('rolls back and refuses protocol-relative URL', async () => {
    const { lockedRef, setIsLocked } = makeRefs();
    const navigate = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ redirectTo: '//evil.example/phish' }), { status: 200 }),
      ),
    );

    const handlers = buildEndpointHandlers({
      store: makeStore(),
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
      lockedRef,
      setIsLocked,
      navigate,
    });
    await handlers[ACTION_NAME]({ provider: 'google' });
    expect(navigate).not.toHaveBeenCalled();
    expect(lockedRef.current).toBe(false);

    vi.unstubAllGlobals();
  });

  it('rolls back on fetch rejection (network error)', async () => {
    const { lockedRef, setIsLocked } = makeRefs();
    const navigate = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );

    const handlers = buildEndpointHandlers({
      store: makeStore(),
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
      lockedRef,
      setIsLocked,
      navigate,
    });
    await handlers[ACTION_NAME]({ provider: 'google' });
    expect(lockedRef.current).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

// Verify toast.error is called with a message containing the action name on failure
describe('buildEndpointHandlers — signInWith error messages', () => {
  it('includes action name in toast on non-2xx', async () => {
    const { lockedRef, setIsLocked } = makeRefs();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );

    const handlers = buildEndpointHandlers({
      store: makeStore(),
      inFlightRef: makeInFlightRef(),
      actionNames: ACTION_SET,
      lockedRef,
      setIsLocked,
      navigate: vi.fn(),
    });
    await handlers[ACTION_NAME]({ provider: 'google' });
    expect(toast.error).toHaveBeenCalledOnce();
    const msg = vi.mocked(toast.error).mock.calls[0][0] as string;
    expect(msg).toContain(ACTION_NAME);

    vi.unstubAllGlobals();
  });
});
