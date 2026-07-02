/**
 * Guard for the literal "Spec shape:" JSON blocks embedded in the four rich
 * chip prompts. The model is instructed to reproduce these near-verbatim, so
 * if a block ever stops being valid JSON, or stops passing the renderUI
 * validator (catalog props, state-path prefixes, visible operators,
 * children cross-refs, cycles), the chip degrades into a retry loop at
 * runtime. This test runs each embedded spec through the exact same
 * `renderUI.execute` gate the model's output hits in production.
 *
 * Convention this test enforces: the JSON block is the LAST thing in every
 * rich prompt string, immediately after a "Spec shape:" line.
 */
import { describe, expect, it } from 'vitest';
import { renderUI } from '@/lib/ai/tools/render-ui';
import { RICH_CHIP_PROMPTS } from './index';

const execute = renderUI.execute as (spec: unknown) => Promise<unknown>;

const MARKER = 'Spec shape:';

function extractSpecShape(prompt: string): unknown {
  const idx = prompt.lastIndexOf(MARKER);
  expect(idx, `prompt must contain a "${MARKER}" marker`).toBeGreaterThan(-1);
  const jsonBlock = prompt.slice(idx + MARKER.length).trim();
  return JSON.parse(jsonBlock);
}

describe('rich-prompt spec shapes', () => {
  for (const [chipId, prompt] of Object.entries(RICH_CHIP_PROMPTS)) {
    it(`${chipId}: embedded spec shape is valid JSON and passes the renderUI validator`, async () => {
      const spec = extractSpecShape(prompt);
      await expect(execute(spec)).resolves.toEqual(spec);
    });
  }

  it('charts: turn values are strings so the annotation x matches the category axis', () => {
    const prompt = RICH_CHIP_PROMPTS.charts;
    expect(prompt).toContain('{"turn":"1","uncached":100,"cached":100}');
    expect(prompt).toContain('"annotations": [{ "x": "2", "label": "Cache warms" }]');
  });

  it('charts: tabs are state-bound for the client-side chart switcher', () => {
    const spec = extractSpecShape(RICH_CHIP_PROMPTS.charts) as {
      state?: Record<string, unknown>;
      elements: Record<string, { type: string; props: Record<string, unknown> }>;
    };
    expect(spec.state).toEqual({ view: 'trend' });
    const tabs = Object.values(spec.elements).find((el) => el.type === 'Tabs');
    expect(tabs?.props.valueStatePath).toBe('/view');
  });

  it('composition: the demo button flips /pressed and the callout mirrors it', () => {
    const spec = extractSpecShape(RICH_CHIP_PROMPTS.composition) as {
      state?: Record<string, unknown>;
      elements: Record<
        string,
        { type: string; on?: Record<string, unknown>; visible?: unknown }
      >;
    };
    expect(spec.state).toEqual({ cap: 'search', pressed: false });
    const button = Object.values(spec.elements).find((el) => el.type === 'Button');
    expect(button?.on?.press).toEqual({
      action: 'setState',
      params: { statePath: '/pressed', value: true },
    });
    // Runtime form: json-render's evaluateVisibility supports `not: true` as a
    // flag on a $state condition, NOT a nested { not: { ... } } wrapper (the
    // nested form silently evaluates as always-visible).
    expect(button?.visible).toEqual({ $state: '/pressed', not: true });
    const callout = Object.values(spec.elements).find(
      (el) => el.type === 'Callout' && el.visible !== undefined,
    );
    expect(callout?.visible).toEqual({ $state: '/pressed' });
  });

  it('interactive: the contact form block is untouched by the FAQ additions', () => {
    const spec = extractSpecShape(RICH_CHIP_PROMPTS.interactive) as {
      elements: Record<string, { type: string; props: Record<string, unknown> }>;
    };
    const form = spec.elements.form;
    expect(form?.props.name).toBe('contact');
    const send = spec.elements['f-send'];
    expect(send?.type).toBe('Button');
    // The FAQ layer must come AFTER the form so the submit flow is unchanged.
    expect(spec.elements['form-card']?.props).toEqual({ title: 'Get in touch.' });
  });
});
