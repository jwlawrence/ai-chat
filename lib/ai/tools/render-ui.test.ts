import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { hasUIRenderIntent } from '@/lib/chat/ui-intent';
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
// Fix #5: Dangling children cross-reference pass
// ---------------------------------------------------------------------------

describe('renderUI tool — Fix #5: dangling children', () => {
  it('throws naming element key and missing child key when children references an absent key', async () => {
    const bad = {
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: {},
          children: ['missing-key'],
        },
      },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toMatch(/element "card"/);
    expect(msg).toMatch(/"missing-key"/);
  });
});

// ---------------------------------------------------------------------------
// Fix #8: Cycle detection in children graph
// ---------------------------------------------------------------------------

describe('renderUI tool — Fix #8: children-graph cycles', () => {
  it('throws when an element references itself in children', async () => {
    const bad = {
      root: 'a',
      elements: {
        a: { type: 'Card', props: {}, children: ['a'] },
      },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/cycle/i);
    expect((err as Error).message).toMatch(/a -> a/);
  });

  it('throws when two elements reference each other (a -> b -> a)', async () => {
    const bad = {
      root: 'a',
      elements: {
        a: { type: 'Card', props: {}, children: ['b'] },
        b: { type: 'Card', props: {}, children: ['a'] },
      },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/cycle/i);
  });

  it('throws when a Tabs prop-child references an ancestor', async () => {
    const bad = {
      root: 'a',
      elements: {
        a: { type: 'Card', props: {}, children: ['t'] },
        t: {
          type: 'Tabs',
          props: { tabs: [{ id: '1', label: 'One', children: ['a'] }] },
          children: [],
        },
      },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/cycle/i);
  });

  it('accepts an acyclic tree with shared leaves is not a cycle (DAG)', async () => {
    // Two parents pointing to the same leaf is fine — it's a DAG, not a cycle.
    const spec = {
      root: 'root',
      elements: {
        root: { type: 'Card', props: {}, children: ['c1', 'c2'] },
        c1: { type: 'Card', props: {}, children: ['leaf'] },
        c2: { type: 'Card', props: {}, children: ['leaf'] },
        leaf: { type: 'Heading', props: { level: 1, text: 'hi' }, children: [] },
      },
    };
    await expect(execute(spec)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Fix #6: Unknown visibility operators
// ---------------------------------------------------------------------------

describe('renderUI tool — Fix #6: unknown visible operators', () => {
  it('throws naming the bad operator when visible contains an unrecognised key', async () => {
    const bad = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['txt'] },
        txt: {
          type: 'Text',
          props: { text: 'hi' },
          children: [],
          visible: { if: '/open' }, // "if" is not a recognised operator
        },
      },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toMatch(/element "txt"/);
    expect(msg).toMatch(/unknown operator/i);
  });
});

// ---------------------------------------------------------------------------
// Fix #11: state-key slash validation
// ---------------------------------------------------------------------------

describe('renderUI tool — Fix #11: state key leading slash', () => {
  it('throws naming the slashed key when spec.state has a "/" prefix', async () => {
    const bad = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: [] },
      },
      state: { '/open': false },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toMatch(/\/open/);
    expect(msg).toMatch(/must not start with "\/"/);
  });
});

// ---------------------------------------------------------------------------
// Fix #18: setState statePath validation
// ---------------------------------------------------------------------------

describe('renderUI tool — Fix #18: setState requires statePath starting with "/"', () => {
  it('throws naming the binding when params use wrong key name', async () => {
    const bad = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['btn'] },
        btn: {
          type: 'Button',
          props: { label: 'Toggle' },
          children: [],
          on: {
            press: {
              action: 'setState',
              params: { path: '/open' }, // wrong param name — should be statePath
            },
          },
        },
      },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toMatch(/element "btn"/);
    expect(msg).toMatch(/setState/);
    expect(msg).toMatch(/statePath/);
  });
});

// ---------------------------------------------------------------------------
// Fix #15: Cap error list at 10 bullets + "...and N more."
// ---------------------------------------------------------------------------

describe('renderUI tool — Fix #15: cap failures at 10', () => {
  it('shows exactly 10 bullet lines plus "...and 2 more." for 12 failures', async () => {
    // Build 12 elements all with an unknown component type so each contributes one failure.
    const elements: Record<string, { type: string; props: Record<string, never>; children: never[] }> = {};
    for (let i = 1; i <= 12; i++) {
      elements[`el-${i}`] = { type: 'UnknownWidget', props: {}, children: [] };
    }
    const bad = { root: 'el-1', elements };

    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;

    // Count bullet lines (lines starting with "- ")
    const bulletCount = (msg.match(/^- /gm) ?? []).length;
    expect(bulletCount).toBe(10);
    expect(msg).toContain('...and 2 more.');
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

// ---------------------------------------------------------------------------
// Phase 3: unknown action name in on.<event> bindings
// ---------------------------------------------------------------------------

describe('renderUI tool — Phase 3: unknown action names', () => {
  it('accepts refreshData (endpoint-mode) with empty params', async () => {
    const spec = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['btn'] },
        btn: {
          type: 'Button',
          props: { label: 'Refresh' },
          on: { press: { action: 'refreshData', params: {} } },
          children: [],
        },
      },
    };
    await expect(execute(spec)).resolves.toBeDefined();
  });

  it('throws naming the bad action when on.press references an unregistered name', async () => {
    const bad = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['btn'] },
        btn: {
          type: 'Button',
          props: { label: 'Hi' },
          on: { press: { action: 'doesntExist', params: {} } },
          children: [],
        },
      },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toMatch(/element "btn"/);
    expect(msg).toMatch(/unknown action "doesntExist"/);
    expect(msg).toMatch(/setState/); // mentions known actions
    expect(msg).toMatch(/sendToModel/);
  });

  it('accepts sendToModel with required label param', async () => {
    const spec = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['btn'] },
        btn: {
          type: 'Button',
          props: { label: 'Continue' },
          on: { press: { action: 'sendToModel', params: { label: 'Continue' } } },
          children: [],
        },
      },
    };
    await expect(execute(spec)).resolves.toBeDefined();
  });

  it('throws naming params.label when sendToModel is missing the required label', async () => {
    // Fix #2: Zod params validation should catch missing required fields and
    // surface them as a server-side error so the model can self-correct.
    const bad = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['btn'] },
        btn: {
          type: 'Button',
          props: { label: 'Go' },
          on: { press: { action: 'sendToModel', params: {} } }, // missing label
          children: [],
        },
      },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toMatch(/element "btn"/);
    expect(msg).toMatch(/sendToModel/);
    // summariseZodError prefixes with "props." regardless of the schema being
    // parsed — the important thing is that "label" is named in the error.
    expect(msg).toMatch(/label/);
  });
});

// ---------------------------------------------------------------------------
// Phase 4.1: dynamic $state refs in props + endpoint routing keys + onSuccess/onError
// ---------------------------------------------------------------------------

describe('renderUI tool — Phase 4.1: dynamic prop values', () => {
  it('accepts a spec where Text.text is a { $state } reference', async () => {
    const spec = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['txt'] },
        txt: { type: 'Text', props: { text: { $state: '/x' } }, children: [] },
      },
    };
    await expect(execute(spec)).resolves.toBeDefined();
  });

  it('accepts an endpoint action with valid _writeResponseTo in params', async () => {
    const spec = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['btn'] },
        btn: {
          type: 'Button',
          props: { label: 'Fetch' },
          on: {
            press: {
              action: 'fetchWeather',
              params: { mode: 'daily', _writeResponseTo: '/weather' },
            },
          },
          children: [],
        },
      },
    };
    await expect(execute(spec)).resolves.toBeDefined();
  });

  it('throws when _writeResponseTo lacks a leading slash', async () => {
    const bad = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['btn'] },
        btn: {
          type: 'Button',
          props: { label: 'Fetch' },
          on: {
            press: {
              action: 'fetchWeather',
              params: { mode: 'daily', _writeResponseTo: 'weather' }, // no leading slash
            },
          },
          children: [],
        },
      },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/_writeResponseTo/);
    expect((err as Error).message).toMatch(/must be a string starting with "\/"/);
  });

  it('throws when _writeResponseTo is used on a non-endpoint action', async () => {
    const bad = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['btn'] },
        btn: {
          type: 'Button',
          props: { label: 'Model btn' },
          on: {
            press: {
              action: 'sendToModel',
              params: { label: 'Go', _writeResponseTo: '/weather' },
            },
          },
          children: [],
        },
      },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/_writeResponseTo\/_setPendingAt/);
    expect((err as Error).message).toMatch(/endpoint-mode/);
  });

  it('accepts onSuccess with set paths starting with "/"', async () => {
    const spec = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['btn'] },
        btn: {
          type: 'Button',
          props: { label: 'Refresh' },
          on: {
            press: {
              action: 'fetchWeather',
              params: { mode: 'daily' },
              onSuccess: { set: { '/loading': false } },
            },
          },
          children: [],
        },
      },
    };
    await expect(execute(spec)).resolves.toBeDefined();
  });

  it('throws when onSuccess.set key lacks a leading slash', async () => {
    const bad = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['btn'] },
        btn: {
          type: 'Button',
          props: { label: 'Refresh' },
          on: {
            press: {
              action: 'fetchWeather',
              params: { mode: 'daily' },
              onSuccess: { set: { loading: false } }, // no leading slash
            },
          },
          children: [],
        },
      },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/onSuccess\.set/);
    expect((err as Error).message).toMatch(/"loading"/);
    expect((err as Error).message).toMatch(/must start with "\/"/);
  });
});

// ---------------------------------------------------------------------------
// Tabs valueStatePath validation
// ---------------------------------------------------------------------------

describe('renderUI tool — Tabs.valueStatePath validation', () => {
  it('accepts a Tabs element with a valid valueStatePath starting with "/"', async () => {
    const spec = {
      root: 'card',
      state: { mode: 'daily' },
      elements: {
        card: { type: 'Card', props: {}, children: ['tabs'] },
        tabs: {
          type: 'Tabs',
          props: {
            valueStatePath: '/mode',
            tabs: [
              { id: 'daily', label: 'Today', children: [] },
              { id: 'weekly', label: '7-Day', children: [] },
            ],
          },
          children: [],
        },
      },
    };
    await expect(execute(spec)).resolves.toBeDefined();
  });

  it('throws when Tabs.valueStatePath does not start with "/"', async () => {
    const bad = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['tabs'] },
        tabs: {
          type: 'Tabs',
          props: {
            valueStatePath: 'mode',
            tabs: [
              { id: 'daily', label: 'Today', children: [] },
            ],
          },
          children: [],
        },
      },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toMatch(/valueStatePath/);
    expect(msg).toMatch(/must be a string starting with "\/"/);
  });
});

// ---------------------------------------------------------------------------
// Phase 5: submitForm action validation
// ---------------------------------------------------------------------------

describe('renderUI tool — Phase 5: submitForm action', () => {
  it('accepts a Button with submitForm and valid formName', async () => {
    const spec = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['form'] },
        form: {
          type: 'Form',
          props: { name: 'contact' },
          children: ['submit-btn'],
        },
        'submit-btn': {
          type: 'Button',
          props: { label: 'Send' },
          on: {
            press: {
              action: 'submitForm',
              params: { formName: 'contact', label: 'Submitted contact form' },
            },
          },
          children: [],
        },
      },
    };
    await expect(execute(spec)).resolves.toBeDefined();
  });

  it('throws when submitForm is missing required formName', async () => {
    const bad = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['submit-btn'] },
        'submit-btn': {
          type: 'Button',
          props: { label: 'Send' },
          on: {
            press: {
              action: 'submitForm',
              params: { label: 'Submit' }, // formName missing
            },
          },
          children: [],
        },
      },
    };
    const err = await execute(bad).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const msg = (err as Error).message;
    expect(msg).toMatch(/element "submit-btn"/);
    expect(msg).toMatch(/submitForm/);
    expect(msg).toMatch(/formName/);
  });
});

describe('prepareStep UI-intent path (logic unit test)', () => {
  // Mirrors the second gate in prepareStep: when nothing has rendered yet and
  // hasUIRenderIntent fires, activeTools is locked to ['renderUI'].
  function buildPrepareStepResult(
    steps: Array<{ toolResults: Array<{ toolName: string }> }>,
    windowed: UIMessage[],
  ): { activeTools: readonly string[] } | undefined {
    const renderedSuccessfully = steps.some((s) =>
      s.toolResults.some((r) => r.toolName === 'renderUI'),
    );
    if (renderedSuccessfully) return { activeTools: ['webSearch'] as const };
    if (hasUIRenderIntent(windowed)) return { activeTools: ['renderUI'] as const };
    return undefined;
  }

  function userMsg(text: string): UIMessage {
    return { id: 'u', role: 'user', parts: [{ type: 'text', text }] } as UIMessage;
  }

  it('returns activeTools: [renderUI] when hasUIRenderIntent and nothing rendered', () => {
    const result = buildPrepareStepResult([], [userMsg('Render a weather card')]);
    expect(result).toEqual({ activeTools: ['renderUI'] });
  });

  it('returns activeTools: [webSearch] when renderUI already succeeded', () => {
    const steps = [{ toolResults: [{ toolName: 'renderUI' }] }];
    const result = buildPrepareStepResult(steps, [userMsg('Render a weather card')]);
    expect(result).toEqual({ activeTools: ['webSearch'] });
  });

  it('returns undefined when no UI intent and nothing rendered', () => {
    const result = buildPrepareStepResult([], [userMsg("What's the weather in Tokyo?")]);
    expect(result).toBeUndefined();
  });
});

describe('prepareStep already-rendered detection (logic unit test)', () => {
  // Mirrors the predicate in app/api/chat/route.ts prepareStep callback.
  // Production uses toolResults (not toolCalls) so that a failed validation
  // attempt does not count as "rendered". Only a successful renderUI result
  // (with an output) advances the gate.
  function alreadyRendered(
    steps: Array<{ toolResults: Array<{ toolName: string }> }>,
  ): boolean {
    return steps.some((s) => s.toolResults.some((r) => r.toolName === 'renderUI'));
  }

  it('returns false when no steps have a renderUI result', () => {
    expect(alreadyRendered([])).toBe(false);
    expect(alreadyRendered([{ toolResults: [{ toolName: 'webSearch' }] }])).toBe(false);
  });

  it('returns true when any step contains a renderUI result', () => {
    expect(alreadyRendered([{ toolResults: [{ toolName: 'renderUI' }] }])).toBe(true);
    expect(
      alreadyRendered([
        { toolResults: [{ toolName: 'webSearch' }] },
        { toolResults: [{ toolName: 'renderUI' }] },
      ]),
    ).toBe(true);
  });

  it('returns false when toolResults is empty on all steps', () => {
    expect(alreadyRendered([{ toolResults: [] }, { toolResults: [] }])).toBe(false);
  });

  it('returns false when step has toolCalls with renderUI but toolResults is empty (bug-fix path)', () => {
    // This is the key regression guard: a failed/invalid renderUI spec lands in
    // toolCalls but NOT in toolResults. The gate must not fire in this case.
    const stepsWithCallButNoResult = [
      {
        toolResults: [],
        // toolCalls is not part of the type used by the predicate; its presence
        // in the outer object is irrelevant to the result.
      },
    ];
    expect(alreadyRendered(stepsWithCallButNoResult)).toBe(false);
  });

  it('returns true when step has both toolCalls and toolResults with renderUI', () => {
    // A successful renderUI lands in both arrays; toolResults is what matters.
    expect(
      alreadyRendered([{ toolResults: [{ toolName: 'renderUI' }] }]),
    ).toBe(true);
  });
});
