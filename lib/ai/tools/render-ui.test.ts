import { describe, expect, it } from 'vitest';
import { renderUI } from './render-ui';

// AI SDK tool() places execute at `.execute`. We call it directly as the SDK would.
const execute = renderUI.execute as (spec: unknown) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const validSpec = {
  root: 'hero',
  elements: {
    hero: {
      type: 'Card',
      props: { title: 'Hello World' },
      children: ['heading'],
    },
    heading: {
      type: 'Heading',
      props: { level: 1, text: 'Welcome' },
      children: [],
    },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('renderUI tool', () => {
  it('returns the spec unchanged when it is fully valid', async () => {
    const result = await execute(validSpec);
    expect(result).toEqual(validSpec);
  });

  it('throws when root key is missing from elements', async () => {
    const bad = {
      root: 'does-not-exist',
      elements: {
        hero: { type: 'Card', props: {}, children: [] },
      },
    };
    await expect(execute(bad)).rejects.toThrow(/root "does-not-exist"/);
  });

  it('throws with an actionable message when catalog props are invalid (Heading level: 5)', async () => {
    const bad = {
      root: 'h',
      elements: {
        h: { type: 'Heading', props: { level: 5, text: 'bad' }, children: [] },
      },
    };
    await expect(execute(bad)).rejects.toThrow(/element "h" \(type "Heading"\)/);
    // Error should also mention the offending field path
    await expect(execute(bad)).rejects.toThrow(/props\.level/);
  });

  it('throws with an actionable message naming the unknown component type', async () => {
    const bad = {
      root: 'x',
      elements: {
        x: { type: 'SuperWidget', props: {}, children: [] },
      },
    };
    await expect(execute(bad)).rejects.toThrow(/unknown component type "SuperWidget"/);
  });

  it('collects multiple failures and lists them together', async () => {
    const bad = {
      root: 'missing',
      elements: {
        h: { type: 'Heading', props: { level: 5, text: 'bad' }, children: [] },
        x: { type: 'Ghost', props: {}, children: [] },
      },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    // root failure
    expect(msg).toMatch(/root "missing"/);
    // bad props failure
    expect(msg).toMatch(/element "h"/);
    // unknown type failure
    expect(msg).toMatch(/unknown component type "Ghost"/);
    // instruction to fix
    expect(msg).toMatch(/Fix these fields/);
  });

  it('throws when required props are missing (Button missing label)', async () => {
    const bad = {
      root: 'btn',
      elements: {
        btn: { type: 'Button', props: {}, children: [] },
      },
    };
    await expect(execute(bad)).rejects.toThrow(/element "btn" \(type "Button"\)/);
  });
});

// ---------------------------------------------------------------------------
// prepareStep behaviour
//
// prepareStep is an inline callback in route.ts and cannot be imported without
// spinning up the entire route module (which pulls in DB, env vars, etc.).
// Instead we test the "already rendered?" detection logic directly here,
// mirroring the exact predicate used in the route.
// ---------------------------------------------------------------------------

describe('prepareStep already-rendered detection (logic unit test)', () => {
  // Mirrors the predicate in app/api/chat/route.ts prepareStep callback.
  function alreadyRendered(steps: Array<{ toolCalls: Array<{ toolName: string }> }>): boolean {
    return steps.some((s) => s.toolCalls.some((c) => c.toolName === 'renderUI'));
  }

  it('returns false when no steps have a renderUI call', () => {
    expect(alreadyRendered([])).toBe(false);
    expect(alreadyRendered([{ toolCalls: [{ toolName: 'webSearch' }] }])).toBe(false);
  });

  it('returns true when any step contains a renderUI call', () => {
    expect(alreadyRendered([{ toolCalls: [{ toolName: 'renderUI' }] }])).toBe(true);
    expect(
      alreadyRendered([
        { toolCalls: [{ toolName: 'webSearch' }] },
        { toolCalls: [{ toolName: 'renderUI' }] },
      ]),
    ).toBe(true);
  });

  it('returns false when toolCalls is empty on all steps', () => {
    expect(alreadyRendered([{ toolCalls: [] }, { toolCalls: [] }])).toBe(false);
  });
});
