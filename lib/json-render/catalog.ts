import { defineCatalog, defineSchema } from '@json-render/core';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schema — flat element-map format (root + elements record)
//
// Note: `visible`, `on`, and `state` are NOT in this schema definition because
// the schema builder treats all s.any() fields as required. These fields are
// documented in buildCatalogPrompt() and handled at runtime by the json-render
// Renderer which reads them directly from UIElement (where they're already typed
// as optional). Our catalog.validate() only validates type/props/children.
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

// Shared URL validator that rejects javascript: and other non-http(s) schemes
// to prevent prompt-injection XSS vectors.
const httpsUrl = z
  .string()
  .url()
  .refine((v) => v.startsWith('https://') || v.startsWith('http://'), {
    message: 'Must be an http(s) URL',
  });

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
        src: httpsUrl.describe('Must be an absolute URL starting with https://'),
        alt: z.string().describe('Alternative text for accessibility'),
        caption: z.string().optional(),
      }),
      description: 'An image with an optional caption.',
    },

    Link: {
      props: z.object({
        href: httpsUrl.describe('Must be an absolute URL starting with https://'),
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
        'A clickable button. Wire actions via the element-level `on.press` field (NOT inside props). Example: `"on": { "press": { "action": "setState", "params": { "statePath": "/open", "value": true } } }`.',
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
        'A form container. Form fields are supplied via the element-level `children` array.',
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
// Actions registry — module-scoped lookup for action metadata.
//
// Design note: We use a plain Map rather than json-render's native `actions`
// block in the schema because:
//   1. The current schema definition only declares `components`; extending it
//      would require touching the schema builder and risking runtime coupling.
//   2. The Map gives a single source of truth for resolveActionMode() used by
//      both the registry's button-disable logic and the server-side validator.
// Phase 4 (endpoint mode) can extend this same registry.
// ---------------------------------------------------------------------------

export type ActionMode = 'local' | 'model' | 'endpoint';

interface ActionDef {
  mode: ActionMode;
  description: string;
  params: z.ZodTypeAny;
}

/**
 * Central registry of all catalog actions (built-in + custom).
 * Built-in `setState` is local-mode and is always available at runtime
 * via ActionProvider — no custom handler is required for it.
 */
export const ACTION_REGISTRY = new Map<string, ActionDef>([
  [
    'setState',
    {
      mode: 'local',
      description:
        'Set a value in client-side state. Handled automatically by ActionProvider — no model involvement.',
      params: z.object({
        statePath: z.string().describe('JSON Pointer path, e.g. "/open"'),
        value: z.unknown().describe('New value to assign'),
      }),
    },
  ],
  [
    'sendToModel',
    {
      mode: 'model',
      description:
        'Synthesize a user turn that tells the model the user pressed this button. The model sees the label + optional message/data and responds normally.',
      params: z.object({
        label: z
          .string()
          .describe('Short user-facing label shown in the transcript chip (e.g. "Continue", "Approve").'),
        message: z
          .string()
          .optional()
          .describe('Optional extra context the model should see, in addition to the label.'),
        data: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Optional structured payload echoed back to the model.'),
      }),
    },
  ],
]);

/**
 * Resolve the dispatch mode for a named action.
 *
 * - `'local'`    — handled client-side; model never sees it.
 * - `'model'`    — synthesizes a user turn and sends to the model.
 * - `'endpoint'` — calls a server endpoint (Phase 4, not yet wired).
 * - `undefined`  — action name is not registered; callers decide how to handle.
 *
 * This is the single source of truth consulted by:
 *   - The Button registry component (to decide whether to disable on lock).
 *   - The server-side render-ui validator (to reject unknown action names).
 *   - The RenderUICard action router (to dispatch to the correct handler).
 */
export function resolveActionMode(actionName: string): ActionMode | undefined {
  return ACTION_REGISTRY.get(actionName)?.mode;
}

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

  // -------------------------------------------------------------------------
  // Model-mode actions section
  // -------------------------------------------------------------------------
  lines.push('');
  lines.push('## Model-mode actions (button press → new user turn → model responds)');
  lines.push('');
  lines.push(
    'Model-mode actions send the user\'s press back to the model as a synthetic user turn. The model receives a text message and responds normally — it may call `renderUI` again or reply with text. Once a model-mode button is pressed, ALL model-mode buttons on that card are disabled (greyed out); local-mode buttons on the same card keep working.',
  );
  lines.push('');
  lines.push('**Available model-mode action:**');
  lines.push('');
  lines.push('- `sendToModel` — synthesize a user turn. Params:');
  lines.push(
    '  - `label` (string, required) — Short label shown in the transcript chip. Keep it ≤30 chars (e.g. "Continue", "Approve", "Show more").',
  );
  lines.push(
    '  - `message` (string, optional) — Extra context injected into the model message in addition to the label.',
  );
  lines.push(
    '  - `data` (object, optional) — Structured payload echoed to the model as JSON.',
  );
  lines.push('');
  lines.push('**Example — a card with an Approve / Reject model-mode button pair:**');
  lines.push('```json');
  lines.push(
    JSON.stringify(
      {
        root: 'review-card',
        elements: {
          'review-card': { type: 'Card', props: { title: 'Review required' }, children: ['approve-btn', 'reject-btn'] },
          'approve-btn': {
            type: 'Button',
            props: { label: 'Approve', variant: 'primary' },
            on: { press: { action: 'sendToModel', params: { label: 'Approve', message: 'User approved the request.' } } },
            children: [],
          },
          'reject-btn': {
            type: 'Button',
            props: { label: 'Reject', variant: 'destructive' },
            on: { press: { action: 'sendToModel', params: { label: 'Reject', message: 'User rejected the request.' } } },
            children: [],
          },
        },
      },
      null,
      2,
    ),
  );
  lines.push('```');
  lines.push('');
  lines.push(
    'Use model-mode actions when the user\'s choice should change the conversation — e.g. multi-step flows, approvals, navigation choices. Use local-mode `setState` when state changes should stay on the card.',
  );
  lines.push('');
  lines.push('## Local actions (client-side, no model involvement)');
  lines.push('');
  lines.push(
    'Actions let a Button (or other interactive element) mutate local state. The state change is purely client-side — the model never sees it.',
  );
  lines.push('');
  lines.push('**Built-in actions** (always available, no custom handler required):');
  lines.push(
    '- `setState` — set a value in state. Params: `{ statePath: string, value: any }`. `statePath` is a JSON Pointer path like `"/open"` or `"/count"`.',
  );
  lines.push('');
  lines.push('**Wiring an action to a Button press:**');
  lines.push(
    'Use the element-level `on` field (a sibling of `type`, `props`, `children` — NOT inside `props`):',
  );
  lines.push('```json');
  lines.push(
    '{ "type": "Button", "props": { "label": "Toggle" }, "on": { "press": { "action": "setState", "params": { "statePath": "/open", "value": true } } }, "children": [] }',
  );
  lines.push('```');
  lines.push('');
  lines.push('**Conditional visibility:**');
  lines.push(
    'Use the element-level `visible` field (a sibling of `type`, `props`, `children` — NOT inside `props`) to show/hide based on state:',
  );
  lines.push('```json');
  lines.push(
    '{ "type": "Text", "props": { "text": "Details revealed!" }, "visible": { "$state": "/open" }, "children": [] }',
  );
  lines.push('```');
  lines.push(
    '`visible` accepts: `true`/`false`, `{ "$state": "/path" }` (truthy check), `{ "$state": "/path", "eq": "value" }`, `{ "$state": "/path", "not": true }` (falsy check), `{ "$and": [...] }`, `{ "$or": [...] }`.',
  );
  lines.push('');
  lines.push('**Initial state:**');
  lines.push(
    'Add a top-level `state` field to the spec to seed values (sibling of `root` and `elements`). Use plain (no-slash) keys — the runtime converts them to JSON Pointer paths automatically:',
  );
  lines.push('```json');
  lines.push('{ "root": "...", "elements": { ... }, "state": { "open": false } }');
  lines.push('```');
  lines.push(
    'Note: in `on.press` params and `visible` conditions, paths are JSON Pointers (start with `/`): `statePath: "/open"`, `{ "$state": "/open" }`. But in the top-level `state` seed, keys are plain: `{ "open": false }`.',
  );
  lines.push('');
  lines.push('**Toggle: single button that flips the state on each press.**');
  lines.push(
    'A plain `setState` with a fixed `value: true` only opens — repeated presses are no-ops. For true toggle behavior, use a `$cond` expression so `value` flips based on current state:',
  );
  lines.push('```json');
  lines.push(
    JSON.stringify(
      {
        root: 'card',
        state: { open: false },
        elements: {
          card: { type: 'Card', props: {}, children: ['toggle-btn', 'detail-text'] },
          'toggle-btn': {
            type: 'Button',
            props: { label: 'Toggle details' },
            on: {
              press: {
                action: 'setState',
                params: {
                  statePath: '/open',
                  // $cond evaluates the condition; if truthy → $then, else → $else.
                  // Reads "if open is true, set false; else set true" — i.e. flip.
                  value: { $cond: { $state: '/open' }, $then: false, $else: true },
                },
              },
            },
            children: [],
          },
          'detail-text': {
            type: 'Text',
            props: { text: 'Here are the details.' },
            visible: { $state: '/open' },
            children: [],
          },
        },
      },
      null,
      2,
    ),
  );
  lines.push('```');
  lines.push('');
  lines.push(
    '**Alternative: two buttons** (one labeled "Show", one labeled "Hide") with mirrored `visible` conditions so only the correct one shows at any time. Use this when the labels need to change with the state.',
  );
  lines.push('```json');
  lines.push(
    JSON.stringify(
      {
        'show-btn': {
          type: 'Button',
          props: { label: 'Show details' },
          on: { press: { action: 'setState', params: { statePath: '/open', value: true } } },
          visible: { $state: '/open', not: true },
          children: [],
        },
        'hide-btn': {
          type: 'Button',
          props: { label: 'Hide details' },
          on: { press: { action: 'setState', params: { statePath: '/open', value: false } } },
          visible: { $state: '/open' },
          children: [],
        },
      },
      null,
      2,
    ),
  );
  lines.push('```');
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
    '- CRITICAL: `on`, `visible`, and `state` are element-level or spec-level fields — NEVER put them inside `props`.',
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
