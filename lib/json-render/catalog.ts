import { defineCatalog, defineSchema } from '@json-render/core';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema — flat element-map format (root + elements record)
// ---------------------------------------------------------------------------

const schema = defineSchema((s) => ({
  spec: s.object({
    root: s.string(),
    elements: s.record(
      s.object({
        type: s.ref('catalog.components'),
        props: s.propsOf('catalog.components'),
        children: s.array(s.string()),
      }),
    ),
  }),
  catalog: s.object({
    components: s.map({
      props: s.zod(),
      description: s.string(),
    }),
  }),
}));

// ---------------------------------------------------------------------------
// Prop schemas — 15 primitives
// ---------------------------------------------------------------------------

// Shared option shape for Select
const selectOption = z.object({
  value: z.string(),
  label: z.string(),
});

// Shared tab shape for Tabs
const tabItem = z.object({
  id: z.string(),
  label: z.string(),
  children: z.array(z.string()).describe('Element keys rendered inside this tab'),
});

// Shared accordion item shape
const accordionItem = z.object({
  id: z.string(),
  label: z.string(),
  children: z.array(z.string()).describe('Element keys rendered inside this panel'),
});

// ---------------------------------------------------------------------------
// Catalog definition
// ---------------------------------------------------------------------------

export const catalog = defineCatalog(schema, {
  components: {
    Card: {
      props: z.object({
        title: z.string().optional().describe('Optional heading displayed at the top of the card'),
        footer: z.string().optional().describe('Optional text rendered in the card footer'),
      }),
      description:
        'A surface that groups related content. Body content is supplied via the element-level `children` array.',
    },

    Heading: {
      props: z.object({
        level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).describe('h1–h4'),
        text: z.string(),
      }),
      description: 'A semantic heading at levels 1–4.',
    },

    Text: {
      props: z.object({
        text: z.string(),
        muted: z.boolean().optional().describe('Render in a subdued/muted colour'),
      }),
      description: 'A paragraph of text.',
    },

    Image: {
      props: z.object({
        src: z.string().url().describe('Must be an absolute URL starting with https://'),
        alt: z.string().describe('Alternative text for accessibility'),
        caption: z.string().optional(),
      }),
      description: 'An image with an optional caption.',
    },

    Link: {
      props: z.object({
        href: z.string().url().describe('Must be an absolute URL starting with https://'),
        text: z.string().describe('Link label shown to the user'),
      }),
      description: 'A navigable hyperlink.',
    },

    Button: {
      props: z.object({
        label: z.string(),
        variant: z
          .enum(['primary', 'secondary', 'ghost', 'destructive'])
          .optional()
          .describe('Visual style of the button'),
        disabled: z.boolean().optional(),
      }),
      description:
        'A clickable button. Action wiring is not yet supported; omit onClick/onSubmit props.',
    },

    List: {
      props: z.object({
        ordered: z.boolean().optional().describe('True for <ol>, false/omitted for <ul>'),
        items: z.array(z.string()).min(1).describe('Text items to display'),
      }),
      description: 'An ordered or unordered list of text items.',
    },

    Input: {
      props: z.object({
        name: z.string().describe('Field name, used as the form key'),
        label: z.string().optional(),
        placeholder: z.string().optional(),
        kind: z
          .enum(['text', 'email', 'number', 'password'])
          .optional()
          .describe('HTML input type; defaults to text'),
      }),
      description: 'A single-line text input field.',
    },

    Select: {
      props: z.object({
        name: z.string().describe('Field name, used as the form key'),
        label: z.string().optional(),
        options: z.array(selectOption).min(1).describe('Available choices'),
      }),
      description: 'A dropdown select field.',
    },

    Checkbox: {
      props: z.object({
        name: z.string().describe('Field name, used as the form key'),
        label: z.string().describe('Label displayed next to the checkbox'),
      }),
      description: 'A boolean checkbox with a label.',
    },

    Form: {
      props: z.object({
        name: z.string().describe('Identifier for the form; used when submitting'),
      }),
      description:
        'A form container. Form fields are supplied via the element-level `children` array. Action wiring is not yet supported; omit onClick/onSubmit props.',
    },

    Tabs: {
      props: z.object({
        tabs: z
          .array(tabItem)
          .min(1)
          .describe('Tab definitions; each tab contains its own children'),
      }),
      description: 'A tabbed panel. Each tab has an id, a label, and an array of element keys.',
    },

    Accordion: {
      props: z.object({
        items: z
          .array(accordionItem)
          .min(1)
          .describe('Accordion sections; each section has an id, a label, and element keys'),
      }),
      description: 'A collapsible accordion. Each item has an id, a label, and child element keys.',
    },

    Callout: {
      props: z.object({
        tone: z
          .enum(['info', 'success', 'warning', 'danger'])
          .describe('Semantic colour of the callout'),
        title: z.string().optional().describe('Bold heading displayed above the callout text'),
        text: z.string().describe('Main callout message'),
      }),
      description: 'A highlighted notice block in one of four semantic tones.',
    },

    Badge: {
      props: z.object({
        label: z.string(),
        tone: z
          .enum(['default', 'success', 'warning', 'danger'])
          .optional()
          .describe('Colour variant of the badge'),
      }),
      description: 'A small inline label used to convey status or category.',
    },

    Divider: {
      props: z.object({}),
      description: 'A horizontal rule that visually separates content.',
    },
  },
});

// ---------------------------------------------------------------------------
// Per-component prop validation helper
// ---------------------------------------------------------------------------

/**
 * Validate the props object for a single element against its component's Zod
 * schema.  Used by the renderUI tool's secondary validation pass (Task 1.3).
 *
 * Returns `{ success: true, data }` or `{ success: false, error: ZodError }`.
 *
 * @example
 * ```ts
 * const result = validateElementProps('Heading', { level: 5, text: 'Bad' });
 * // result.success === false; result.error has the Zod issues
 * ```
 */
export function validateElementProps(
  componentName: string,
  props: unknown,
): z.ZodSafeParseResult<unknown> {
  const components = catalog.data.components as Record<string, { props: z.ZodTypeAny } | undefined>;
  const entry = components[componentName];
  if (!entry) {
    return z.never().safeParse(props);
  }
  return entry.props.safeParse(props);
}

// ---------------------------------------------------------------------------
// catalogPrompt — splice into the renderUI tool description
// ---------------------------------------------------------------------------

/**
 * Format a Zod v4 type def into a compact TypeScript-ish label.
 * Handles string, boolean, number, literal, union of literals, enum,
 * array of primitives, and array of objects (shallow).  Anything more
 * exotic falls back to `'<value>'`.
 */
function formatZodDef(def: Record<string, unknown> | null): string {
  if (!def) return '<value>';
  switch (def.type) {
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'number';
    case 'literal':
      return JSON.stringify((def.values as unknown[])?.[0]);
    case 'union':
      return (def.options as Array<{ _zod?: { def?: Record<string, unknown> } }>)
        .map((o) => formatZodDef(o._zod?.def ?? null))
        .join(' | ');
    case 'enum':
      return Object.keys(def.entries as Record<string, unknown>)
        .map((k) => JSON.stringify(k))
        .join(' | ');
    case 'array': {
      const elemDef = (
        def.element as { _zod?: { def?: Record<string, unknown> } } | undefined
      )?._zod?.def;
      if (!elemDef) return '<value>[]';
      if (elemDef.type === 'object') {
        const pairs = Object.entries(
          elemDef.shape as Record<string, { _zod?: { def?: Record<string, unknown> } }>,
        ).map(([k, v]) => `${k}: ${formatZodDef(v._zod?.def ?? null)}`);
        return `{ ${pairs.join(', ')} }[]`;
      }
      return `${formatZodDef(elemDef)}[]`;
    }
    case 'optional': {
      const inner = (
        def.innerType as { _zod?: { def?: Record<string, unknown> } } | undefined
      )?._zod?.def;
      return inner ? formatZodDef(inner) : '<value>';
    }
    default:
      return '<value>';
  }
}

function formatZodType(schema: z.ZodType): string {
  return formatZodDef((schema as unknown as { _zod?: { def?: Record<string, unknown> } })._zod?.def ?? null);
}

/**
 * Build a compact, tool-calling-friendly catalog reference string.
 *
 * Unlike `catalog.prompt()` (which targets a streaming JSONL-patch protocol),
 * this output is designed for single-shot AI SDK tool calling where the model
 * returns one complete JSON object.  It enumerates every component with its
 * props and appends the authoring rules — no "You are a UI generator" framing,
 * no JSONL or JSON Patch instructions.
 */
function buildCatalogPrompt(): string {
  const comps = catalog.data.components as Record<
    string,
    { props: z.ZodTypeAny; description: string }
  >;
  const lines: string[] = [];

  lines.push(
    'The spec is ALWAYS a single JSON object with TWO required top-level fields: `root` (string) AND `elements` (object). Both must be present in the same tool call — do not call with only `root`.',
  );
  lines.push('');
  lines.push('Minimum valid spec (a card containing one heading):');
  lines.push('```json');
  lines.push(
    JSON.stringify(
      {
        root: 'main',
        elements: {
          main: { type: 'Card', props: {}, children: ['title'] },
          title: { type: 'Heading', props: { level: 1, text: 'Hello' }, children: [] },
        },
      },
      null,
      2,
    ),
  );
  lines.push('```');
  lines.push('');
  lines.push(
    'Each element is `{ type, props, children }`. `type` is one of the component names below. `props` is an object whose shape depends on the component. `children` is an array of element keys (strings); use `[]` for leaf elements.',
  );
  lines.push('');
  lines.push('Available components:');

  for (const [name, def] of Object.entries(comps)) {
    lines.push('');
    lines.push(`### ${name}`);
    lines.push(def.description);
    const shape =
      (def.props as unknown as { _zod?: { def?: { shape?: Record<string, z.ZodType> } } })._zod
        ?.def?.shape ?? {};
    const propEntries = Object.entries(shape);
    if (propEntries.length === 0) {
      lines.push('Props: (none)');
    } else {
      lines.push('Props:');
      for (const [propName, propSchema] of propEntries) {
        const isOpt =
          (propSchema as unknown as { _zod?: { def?: { type?: string } } })._zod?.def?.type ===
          'optional';
        const typeStr = formatZodType(propSchema);
        const desc = (propSchema as { description?: string }).description;
        const descPart = desc ? ` — ${desc}` : '';
        lines.push(`  - ${propName}${isOpt ? '?' : ''}: ${typeStr}${descPart}`);
      }
    }
  }

  lines.push('');
  lines.push('Rules:');
  lines.push('- Set `root` to the key of the top-level element.');
  lines.push(
    '- Element keys are short, kebab-case, and unique within a spec (e.g. "hero-heading", "submit-btn").',
  );
  lines.push(
    '- Place child element keys in the element-level `children` array, NOT inside `props`. Children arrays contain element keys (strings), not inline element objects.',
  );
  lines.push('- Omit optional props when defaults are sufficient.');
  lines.push(
    '- Action wiring is not yet supported; omit onClick/onSubmit props and any event handlers.',
  );

  return lines.join('\n');
}

/**
 * A concise string describing all catalog components and their props.
 * Built from the catalog definition at module load time; spliced into the
 * renderUI tool description so the model knows the available vocabulary.
 *
 * Uses single-shot tool-calling format (one complete JSON object) rather than
 * the streaming JSONL-patch protocol that `catalog.prompt()` targets.
 */
export const catalogPrompt: string = buildCatalogPrompt();
