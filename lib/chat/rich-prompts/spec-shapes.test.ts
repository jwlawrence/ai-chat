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
import { extractSpecShape, SPEC_SHAPE_MARKER } from './extract-spec';
import { RICH_CHIP_PROMPTS } from './index';

const execute = renderUI.execute as (spec: unknown) => Promise<unknown>;

describe('rich-prompt spec shapes', () => {
  it('every rich prompt ends with an extractable spec block', () => {
    for (const [chipId, prompt] of Object.entries(RICH_CHIP_PROMPTS)) {
      expect(prompt, `${chipId} must contain "${SPEC_SHAPE_MARKER}"`).toContain(SPEC_SHAPE_MARKER);
    }
  });

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
      elements: Record<string, { type: string; on?: Record<string, unknown>; visible?: unknown }>;
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

  it('dashboard: the self-portrait numbers match the spec that draws them', () => {
    // The hero states an element count and breaks it down by role, and both
    // are counts OF THIS SPEC — so any element added or removed makes the card
    // lie about itself. Recount from the spec rather than trusting the prose;
    // this assertion already caught one off-by-one (a forgotten Callout).
    const spec = extractSpecShape(RICH_CHIP_PROMPTS.dashboard) as {
      elements: Record<string, { type: string; props: Record<string, unknown> }>;
    };
    const byRole = { Layout: 0, Data: 0, Content: 0, Nav: 0 };
    const role: Record<string, keyof typeof byRole> = {
      Grid: 'Layout',
      GridCell: 'Layout',
      Row: 'Layout',
      KPI: 'Data',
      Chart: 'Data',
      Table: 'Data',
      Card: 'Content',
      Heading: 'Content',
      Text: 'Content',
      Callout: 'Content',
      Tabs: 'Nav',
    };
    for (const el of Object.values(spec.elements)) {
      const r = role[el.type];
      expect(r, `unclassified primitive in the dashboard spec: ${el.type}`).toBeDefined();
      byRole[r] += 1;
    }
    const total = Object.values(byRole).reduce((a, b) => a + b, 0);

    const heading = Object.values(spec.elements).find((el) => el.type === 'Heading');
    expect(heading?.props.text).toBe(`${total} elements`);

    const chart = Object.values(spec.elements).find((el) => el.type === 'Chart');
    expect(chart?.props.data).toEqual([
      { role: 'Layout', count: byRole.Layout },
      { role: 'Data', count: byRole.Data },
      { role: 'Content', count: byRole.Content },
      { role: 'Nav', count: byRole.Nav },
    ]);
  });

  it('dashboard: every KPI value is a measurement, never a sentence', () => {
    // The old dashboard put prose ("Self-correcting", "Secure by design") in
    // the KPI value slot, which renders at 24px semibold — so nothing on the
    // card read as a number and every tile carried identical weight.
    const spec = extractSpecShape(RICH_CHIP_PROMPTS.dashboard) as {
      elements: Record<string, { type: string; props: Record<string, unknown> }>;
    };
    const kpis = Object.values(spec.elements).filter((el) => el.type === 'KPI');
    expect(kpis.length).toBeGreaterThan(0);
    for (const kpi of kpis) {
      const value = kpi.props.value as string;
      expect(value, `KPI value "${value}" should not contain a space`).not.toMatch(/\s/);
      expect(value, `KPI value "${value}" should carry a digit`).toMatch(/\d/);
    }
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
