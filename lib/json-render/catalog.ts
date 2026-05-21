import { defineCatalog, defineSchema } from '@json-render/core';
import { z } from 'zod';
import { dynBool, dynParam, dynStr } from './dynamic-value';

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
// value and label are plain strings — dynStr() would accept { $state: "/path" } refs,
// but resolvePropValue only resolves $state at the TOP level of a component's props.
// Nested fields inside array-of-object props are not recursed into, so refs here
// would render as [object Object]. Keep as z.string() until deep resolution lands.
const selectOption = z.object({
  value: z.string(),
  label: z.string(),
});

// Shared tab shape for Tabs
// label is plain string for the same reason as selectOption above.
const tabItem = z.object({
  id: z.string(),
  label: z.string(),
  children: z.array(z.string()).describe('Element keys rendered inside this tab'),
});

// Shared accordion item shape
// label is plain string for the same reason as selectOption above.
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
        title: dynStr('Optional heading displayed at the top of the card').optional(),
        footer: dynStr('Optional text rendered in the card footer').optional(),
      }),
      description:
        'A surface that groups related content. Body content is supplied via the element-level `children` array.',
    },

    Heading: {
      props: z.object({
        level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).describe('h1–h4'),
        text: dynStr(),
      }),
      description: 'A semantic heading at levels 1–4.',
    },

    Text: {
      props: z.object({
        text: dynStr(),
        muted: dynBool('Render in a subdued/muted colour').optional(),
      }),
      description: 'A paragraph of text.',
    },

    Image: {
      props: z.object({
        src: httpsUrl.describe('Must be an absolute URL starting with https://'),
        alt: dynStr('Alternative text for accessibility'),
        caption: dynStr().optional(),
      }),
      description: 'An image with an optional caption.',
    },

    Link: {
      props: z.object({
        href: httpsUrl.describe('Must be an absolute URL starting with https://'),
        text: dynStr('Link label shown to the user'),
      }),
      description: 'A navigable hyperlink.',
    },

    Button: {
      props: z.object({
        label: dynStr(),
        variant: z
          .enum(['primary', 'secondary', 'ghost', 'destructive'])
          .optional()
          .describe('Visual style of the button'),
        disabled: dynBool().optional(),
      }),
      description:
        'A clickable button. Wire actions via the element-level `on.press` field (NOT inside props). Example: `"on": { "press": { "action": "setState", "params": { "statePath": "/open", "value": true } } }`.',
    },

    List: {
      props: z.object({
        ordered: dynBool('True for <ol>, false/omitted for <ul>').optional(),
        // items uses plain z.string() — resolvePropValue does not recurse into
        // array elements, so { $state: "/path" } refs here would render as
        // [object Object]. Dynamic state refs only resolve at the top level of
        // a component's props.
        items: z.array(z.string()).min(1).describe('Text items to display'),
      }),
      description: 'An ordered or unordered list of text items.',
    },

    Input: {
      props: z.object({
        name: z.string().describe('Field name, used as the form key'),
        label: dynStr().optional(),
        placeholder: dynStr().optional(),
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
        label: dynStr().optional(),
        options: z.array(selectOption).min(1).describe('Available choices'),
      }),
      description: 'A dropdown select field.',
    },

    Checkbox: {
      props: z.object({
        name: z.string().describe('Field name, used as the form key'),
        label: dynStr('Label displayed next to the checkbox'),
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
        valueStatePath: z
          .string()
          .optional()
          .describe(
            'Optional JSON Pointer path (starts with "/"). When set, the Tabs become controlled: the active tab is read from this state path, and clicking a tab writes the new tab id to it. Pair with elements elsewhere in the spec that bind to the same path (e.g. via `{ "$state": "/path" }`) to react to tab changes.',
          ),
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
        title: dynStr('Bold heading displayed above the callout text').optional(),
        text: dynStr('Main callout message'),
      }),
      description: 'A highlighted notice block in one of four semantic tones.',
    },

    Badge: {
      props: z.object({
        label: dynStr(),
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
          .describe(
            'Short user-facing label shown in the transcript chip (e.g. "Continue", "Approve").',
          ),
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
  [
    'submitForm',
    {
      mode: 'model',
      description:
        'Submit a form. Gathers all field values from state at /<formName>/* and sends them to the model as a structured payload along with a transcript chip. The card locks the moment submit is pressed (same lock semantics as sendToModel). Use this when the user fills a form whose values the model should reason about.',
      params: z.object({
        formName: z
          .string()
          .describe("The Form element's `name` prop. Used to read /{name}/* from state."),
        label: z
          .string()
          .optional()
          .describe('Transcript chip label. Defaults to "Submitted <formName>".'),
        message: z
          .string()
          .optional()
          .describe('Optional extra context the model should see in addition to the form data.'),
      }),
    },
  ],
  [
    'refreshData',
    {
      mode: 'endpoint',
      description:
        'Fire a backend POST to /api/actions/refreshData. The model never sees this press and the card stays interactive so the user can press again. Use endpoint-mode actions for refresh, save, mark-done, and delete-style operations where no model response is needed.',
      params: z.object({}),
    },
  ],
  [
    'fetchWeather',
    {
      mode: 'endpoint',
      description:
        'Fetch current weather data from the backend. Returns { summary, mode } in the response body. Pair with _writeResponseTo to update a display Text prop reactively. Use _setPendingAt to show a loading indicator while the request is in flight.',
      params: z.object({
        mode: dynParam(z.union([z.literal('daily'), z.literal('weekly')])).describe(
          'Which forecast view: "daily" or "weekly". Required — read from state using { "$state": "/mode" } so it reacts to the user\'s tab selection.',
        ),
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
      const elemDef = (def.element as { _zod?: { def?: Record<string, unknown> } } | undefined)
        ?._zod?.def;
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
      const inner = (def.innerType as { _zod?: { def?: Record<string, unknown> } } | undefined)
        ?._zod?.def;
      return inner ? formatZodDef(inner) : '<value>';
    }
    default:
      return '<value>';
  }
}

function formatZodType(schema: z.ZodType): string {
  return formatZodDef(
    (schema as unknown as { _zod?: { def?: Record<string, unknown> } })._zod?.def ?? null,
  );
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
      (def.props as unknown as { _zod?: { def?: { shape?: Record<string, z.ZodType> } } })._zod?.def
        ?.shape ?? {};
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
  // Dynamic prop values section
  // -------------------------------------------------------------------------

  lines.push('');
  lines.push('## Dynamic prop values');
  lines.push('');
  lines.push(
    'Top-level user-facing display props (text, label, title, footer, caption, alt, placeholder, callout/badge/heading text, button label, image caption/alt, link text, muted, disabled, ordered) accept either a literal value OR `{ "$state": "/path" }`, which reactively resolves to the current state value at render time.',
  );
  lines.push('');
  lines.push(
    'URL props (`src`, `href`) and enum props (`variant`, `tone`, `kind`, `level`) stay literal-only.',
  );
  lines.push('');
  lines.push(
    "Dynamic state refs only resolve at the top level of a component's props. Nested fields inside array-of-object props (List items, Tab/Accordion labels, Select options) must be literal strings.",
  );
  lines.push('');
  lines.push('Example — Text whose content comes from state:');
  lines.push('```json');
  lines.push(
    JSON.stringify(
      { type: 'Text', props: { text: { $state: '/weather/summary' } }, children: [] },
      null,
      2,
    ),
  );
  lines.push('```');

  // -------------------------------------------------------------------------
  // Mode sections — driven by ACTION_REGISTRY so endpoint actions
  // auto-appear here once registered (no manual prompt updates needed).
  // -------------------------------------------------------------------------

  /**
   * Render a heading + param table for all actions of a given mode.
   * Returns an empty array when no actions are registered for that mode,
   * so the section simply does not appear in the prompt yet.
   */
  function modeSection(mode: ActionMode, title: string, intro: string): string[] {
    const entries = [...ACTION_REGISTRY.entries()].filter(([, def]) => def.mode === mode);
    if (entries.length === 0) return [];
    const sectionLines: string[] = ['', `## ${title}`, '', intro, ''];
    for (const [name, def] of entries) {
      sectionLines.push(`### \`${name}\``);
      sectionLines.push(def.description);
      sectionLines.push('Params:');
      const shape =
        (def.params as unknown as { _zod?: { def?: { shape?: Record<string, z.ZodType> } } })._zod
          ?.def?.shape ?? {};
      for (const [paramName, paramSchema] of Object.entries(shape)) {
        const isOpt =
          (paramSchema as unknown as { _zod?: { def?: { type?: string } } })._zod?.def?.type ===
          'optional';
        const desc = (paramSchema as { description?: string }).description;
        sectionLines.push(
          `  - \`${paramName}\`${isOpt ? '?' : ''} — ${desc ?? '(no description)'}`,
        );
      }
      sectionLines.push('');
    }
    return sectionLines;
  }

  lines.push(
    ...modeSection(
      'model',
      'Model-mode actions (button press → new user turn → model responds)',
      "Model-mode actions send the user's press back to the model as a synthetic user turn. The model receives a text message and responds normally — it may call `renderUI` again or reply with text. Once a model-mode button is pressed, ALL model-mode buttons on that card are disabled (greyed out); local-mode buttons on the same card keep working.",
    ),
  );

  lines.push('**Example — a card with an Approve / Reject model-mode button pair:**');
  lines.push('```json');
  lines.push(
    JSON.stringify(
      {
        root: 'review-card',
        elements: {
          'review-card': {
            type: 'Card',
            props: { title: 'Review required' },
            children: ['approve-btn', 'reject-btn'],
          },
          'approve-btn': {
            type: 'Button',
            props: { label: 'Approve', variant: 'primary' },
            on: {
              press: {
                action: 'sendToModel',
                params: { label: 'Approve', message: 'User approved the request.' },
              },
            },
            children: [],
          },
          'reject-btn': {
            type: 'Button',
            props: { label: 'Reject', variant: 'destructive' },
            on: {
              press: {
                action: 'sendToModel',
                params: { label: 'Reject', message: 'User rejected the request.' },
              },
            },
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
    "Use model-mode actions when the user's choice should change the conversation — e.g. multi-step flows, approvals, navigation choices. Use local-mode `setState` when state changes should stay on the card.",
  );

  // -------------------------------------------------------------------------
  // Form submission section
  // -------------------------------------------------------------------------

  lines.push('');
  lines.push('## Form submission');
  lines.push('');
  lines.push(
    'Use a `Form` element (with a `name` prop) to group `Input`, `Select`, and `Checkbox` fields. The `Form` name is the state subtree key — fields inside the form **auto-bind** to `/{formName}/{field.name}` in state. You do NOT need to add `$bindState` or `$state` refs to field props manually; the Form auto-binding handles it.',
  );
  lines.push('');
  lines.push(
    'To submit, add a `Button` with `on.press.action = "submitForm"` and `params.formName = "<the form name>"`. The card locks on submit (same as `sendToModel`); the form values reach the model as a chip + text injection.',
  );
  lines.push('');
  lines.push(
    'Optionally seed initial field values in the top-level `state` object: `{ "<formName>": { "<fieldName>": <value>, ... } }`. This ensures consistent initial display.',
  );
  lines.push('');
  lines.push('**Example — a contact form with email, topic, and a subscribe checkbox:**');
  lines.push('```json');
  lines.push(
    JSON.stringify(
      {
        root: 'contact-card',
        state: { contact: { email: '', topic: 'general', subscribe: false } },
        elements: {
          'contact-card': {
            type: 'Card',
            props: { title: 'Contact us' },
            children: ['contact-form'],
          },
          'contact-form': {
            type: 'Form',
            props: { name: 'contact' },
            children: ['email-input', 'topic-select', 'subscribe-check', 'submit-btn'],
          },
          'email-input': {
            type: 'Input',
            props: { name: 'email', label: 'Email', kind: 'email', placeholder: 'you@example.com' },
            children: [],
          },
          'topic-select': {
            type: 'Select',
            props: {
              name: 'topic',
              label: 'Topic',
              options: [
                { value: 'general', label: 'General' },
                { value: 'support', label: 'Support' },
                { value: 'billing', label: 'Billing' },
              ],
            },
            children: [],
          },
          'subscribe-check': {
            type: 'Checkbox',
            props: { name: 'subscribe', label: 'Subscribe to updates' },
            children: [],
          },
          'submit-btn': {
            type: 'Button',
            props: { label: 'Send', variant: 'primary' },
            on: {
              press: {
                action: 'submitForm',
                params: { formName: 'contact', label: 'Submitted contact form' },
              },
            },
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
    'Common mistake: do NOT add `$bindState` or `$state` refs to `Input`, `Select`, or `Checkbox` props manually — Form auto-binding handles it. Manual binding would conflict with the auto-binding and produce unexpected behavior.',
  );
  lines.push('');

  lines.push(
    ...modeSection(
      'endpoint',
      'Endpoint-mode actions (backend call, no model involvement)',
      'Endpoint-mode actions POST to a backend route when the button is pressed. The model never sees the press and the card stays interactive — the user can press again (useful for refetch-style operations). Use endpoint-mode for refresh, save, mark-done, and delete-style operations where no model response is needed.',
    ),
  );

  lines.push('**Response binding** — endpoint action params support two optional routing keys:');
  lines.push(
    '- `_writeResponseTo: "/path"` — on success, the parsed JSON response body is written to this state path.',
  );
  lines.push(
    '- `_setPendingAt: "/path"` — set to `true` while the request is in flight, `false` when it settles (success or error).',
  );
  lines.push('');
  lines.push(
    'These routing keys are stripped before the POST reaches the server; the action handler only sees the remaining params.',
  );
  lines.push('');
  lines.push(
    "You may also use json-render's native `onSuccess` / `onError` siblings on the binding for static state mutations after the call:",
  );
  lines.push('- `onSuccess: { set: { "/path": value } }` — write static values on a 2xx response.');
  lines.push('- `onError: { set: { "/path": value } }` — write static values on failure.');
  lines.push('');
  lines.push(
    'Two-way tabs binding pattern: set `props.valueStatePath` on the Tabs element to a JSON Pointer (e.g. `/mode`). The Tabs read/write that state path automatically; no per-tab `on.*` wiring is needed.',
  );
  lines.push('');
  lines.push('**Example — weather card with tabs, refresh button, and reactive display:**');
  lines.push('```json');
  lines.push(
    JSON.stringify(
      {
        root: 'weather-card',
        state: { mode: 'daily', loading: false, weather: { summary: 'Press refresh to load.' } },
        elements: {
          'weather-card': {
            type: 'Card',
            props: { title: 'Weather' },
            children: ['mode-tabs', 'refresh-btn', 'loading-text', 'weather-text'],
          },
          'mode-tabs': {
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
          'refresh-btn': {
            type: 'Button',
            props: { label: 'Refresh', variant: 'secondary' },
            on: {
              press: {
                action: 'fetchWeather',
                params: {
                  mode: { $state: '/mode' },
                  _writeResponseTo: '/weather',
                  _setPendingAt: '/loading',
                },
              },
            },
            children: [],
          },
          'loading-text': {
            type: 'Text',
            props: { text: 'Loading…', muted: true },
            visible: { $state: '/loading' },
            children: [],
          },
          'weather-text': {
            type: 'Text',
            props: { text: { $state: '/weather/summary' } },
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
    'Common mistake: do NOT nest `on.<event>` inside individual tabs[i] entries — tabs[i] only carries `id`, `label`, and `children`. The Tabs primitive is bound through `props.valueStatePath`, not per-tab event handlers.',
  );
  lines.push('');
  lines.push(
    'Endpoint-action params with dynamic values from state MUST use `{ "$state": "/path" }` syntax. Example: `mode: { "$state": "/mode" }`. Hardcoding `mode: "daily"` will not react to the user\'s tab choice.',
  );
  lines.push('');

  lines.push(
    ...modeSection(
      'local',
      'Local actions (client-side, no model involvement)',
      'Actions let a Button (or other interactive element) mutate local state. The state change is purely client-side — the model never sees it. Built-in local actions are always available without a custom handler.',
    ),
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
