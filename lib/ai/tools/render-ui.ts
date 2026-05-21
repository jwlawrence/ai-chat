import { tool } from 'ai';
import { z } from 'zod';
import { catalog, catalogPrompt, validateElementProps } from '@/lib/json-render/catalog';

// ---------------------------------------------------------------------------
// Input schema — envelope only; catalog prop schemas run in execute()
// ---------------------------------------------------------------------------

// Visibility condition — accepts boolean, `{ $state: "/path" }`, and the
// composite forms json-render's evaluateVisibility recognises. Kept loose
// (z.unknown() inside object shapes) so future condition operators don't
// require a schema bump.
const visibilityConditionSchema: z.ZodType = z.union([
  z.boolean(),
  z.record(z.string(), z.unknown()),
]);

// Action binding for element-level `on.<event>` handlers. The only built-in
// action right now is `setState` ({ statePath: "/key", value: <any> }).
const actionBindingSchema = z.object({
  action: z.string().describe('Action name. Built-in: "setState".'),
  params: z.record(z.string(), z.unknown()).optional().describe('Action params; shape depends on the action.'),
});

const elementSchema = z.object({
  type: z.string().describe('Component name from the catalog (e.g. "Card", "Heading").'),
  props: z.record(z.string(), z.unknown()).describe('Props object whose shape matches the component.'),
  children: z
    .array(z.string())
    .describe('Array of child element keys. Use [] for leaf elements.'),
  visible: visibilityConditionSchema
    .optional()
    .describe(
      'Optional visibility condition. Examples: true | false | { "$state": "/open" } | { "eq": ["/mode", "edit"] } | { "not": { "$state": "/hidden" } }.',
    ),
  on: z
    .record(z.string(), actionBindingSchema)
    .optional()
    .describe(
      'Optional event bindings. The key is the event name (e.g. "press" on a Button); the value is { action, params }. Example: { "press": { "action": "setState", "params": { "statePath": "/open", "value": true } } }.',
    ),
});

const specSchema = z.object({
  root: z.string().describe('REQUIRED. Key of the top-level element in `elements`.'),
  elements: z
    .record(z.string(), elementSchema)
    .describe(
      'REQUIRED. Map from element key (string) to its definition. Must include the `root` key. Pass the full elements map in the same call as `root` — never call with only `root`.',
    ),
  state: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Optional initial state. Use plain keys without leading slashes (e.g. { "open": false }); the `statePath` and `$state` references then use leading slashes (e.g. "/open").',
    ),
});

type Spec = z.infer<typeof specSchema>;

// ---------------------------------------------------------------------------
// Error formatting helpers
// ---------------------------------------------------------------------------

function formatErrors(failures: string[]): string {
  const cap = 10;
  const shown = failures.slice(0, cap);
  const rest = failures.length - cap;
  let msg = `Spec validation failed:\n${shown.map((f) => `- ${f}`).join('\n')}`;
  if (rest > 0) {
    msg += `\n...and ${rest} more.`;
  }
  msg += '\nFix these fields and re-emit the spec.';
  return msg;
}

function summariseZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.length > 0 ? `props.${issue.path.join('.')}` : 'props';
      return `${path}: ${issue.message}`;
    })
    .join('; ');
}

// ---------------------------------------------------------------------------
// renderUI tool
// ---------------------------------------------------------------------------

export const renderUI = tool({
  description: [
    'Render a structured UI card inline in the chat by emitting a JSON spec. Call this when the user asks for a card, form, dashboard, comparison, or any structured visual layout.',
    'This tool is fully self-contained: the complete component vocabulary, prop shapes, and authoring rules are documented below. Do NOT search the web for "renderUI" or "json-render" — there is no external API to reference; the schema below IS the spec.',
    catalogPrompt,
  ].join('\n\n'),

  inputSchema: specSchema,

  execute: async (spec: Spec): Promise<Spec> => {
    const failures: string[] = [];

    // 1. Confirm root key exists in elements
    if (!(spec.root in spec.elements)) {
      failures.push(`root "${spec.root}" is not a key in elements`);
    }

    // 2. Validate each element
    const knownComponents = catalog.data.components as Record<string, unknown>;

    for (const [key, el] of Object.entries(spec.elements)) {
      // Check type is a known catalog component
      if (!(el.type in knownComponents)) {
        failures.push(
          `element "${key}": unknown component type "${el.type}" — must be one of ${Object.keys(knownComponents).join(', ')}`,
        );
        continue; // can't validate props without a schema
      }

      // Validate props against catalog schema
      const result = validateElementProps(el.type, el.props);
      if (!result.success) {
        const summary = summariseZodError(result.error);
        failures.push(`element "${key}" (type "${el.type}"): ${summary}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(formatErrors(failures));
    }

    return spec;
  },
});
