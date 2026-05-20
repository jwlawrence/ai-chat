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
 * A concise string describing all catalog components and their props.
 * Generated by json-render from the catalog definition; append this to the
 * renderUI tool's description so the model knows the available vocabulary.
 */
export const catalogPrompt: string = catalog.prompt({
  system:
    'You are a UI generator. Output only a valid JSON spec — no markdown, no prose, no code fences.',
  customRules: [
    'Use element keys that are short, kebab-case, and unique within a spec (e.g. "hero-heading", "submit-btn").',
    'Always set `root` to the key of the top-level element.',
    'Place child element keys in the element-level `children` array, not inside `props`. Children arrays contain element keys, not inline element objects.',
    'Action wiring is not yet supported; omit onClick/onSubmit props and any event handlers.',
    'Omit optional props when the default behaviour is sufficient.',
  ],
});
