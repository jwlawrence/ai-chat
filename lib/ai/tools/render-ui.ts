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
// .passthrough() ensures unknown fields from the model aren't silently stripped
// so future action shapes survive the parse and reach execute() intact.
const actionBindingSchema = z
  .object({
    action: z.string().describe('Action name. Built-in: "setState".'),
    params: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Action params; shape depends on the action.'),
  })
  .passthrough();

// .passthrough() on elementSchema ensures future element-level fields (e.g.
// new json-render directives) survive the Zod parse rather than being silently
// stripped before execute() runs its secondary validation.
const elementSchema = z
  .object({
    type: z.string().describe('Component name from the catalog (e.g. "Card", "Heading").'),
    props: z
      .record(z.string(), z.unknown())
      .describe('Props object whose shape matches the component.'),
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
  })
  .passthrough();

export const specSchema = z.object({
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
// Fix #6: Visibility operator validation
// ---------------------------------------------------------------------------

// Recognised top-level keys in an object visibility condition. Any object
// lacking at least one of these is an unknown/unsupported operator.
const VISIBILITY_KEYS = new Set([
  '$state',
  '$and',
  '$or',
  '$item',
  '$index',
  'not',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
]);

/**
 * Validate a visibility condition tree. Pushes a failure string for every
 * object whose top-level keys don't include any recognised operator.
 * Walks $and/$or arrays and `not` recursively.
 */
function validateVisibility(cond: unknown, context: string, failures: string[]): void {
  if (typeof cond === 'boolean') return;
  if (Array.isArray(cond)) {
    for (const item of cond) validateVisibility(item, context, failures);
    return;
  }
  if (cond !== null && typeof cond === 'object') {
    const keys = Object.keys(cond as Record<string, unknown>);
    const hasRecognised = keys.some((k) => VISIBILITY_KEYS.has(k));
    if (!hasRecognised) {
      failures.push(
        `${context}: visible condition contains unknown operator(s): ${keys.join(', ')} — allowed keys are ${[...VISIBILITY_KEYS].join(', ')}`,
      );
      return;
    }
    const obj = cond as Record<string, unknown>;
    if (Array.isArray(obj.$and)) {
      for (const item of obj.$and) validateVisibility(item, context, failures);
    }
    if (Array.isArray(obj.$or)) {
      for (const item of obj.$or) validateVisibility(item, context, failures);
    }
    if ('not' in obj && typeof obj.not === 'object' && obj.not !== null) {
      validateVisibility(obj.not, context, failures);
    }
  }
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

    // Fix #11: Reject state keys that start with "/" — they're JSON Pointers
    // and should be plain keys (the runtime adds the "/" automatically).
    if (spec.state) {
      for (const key of Object.keys(spec.state)) {
        if (key.startsWith('/')) {
          failures.push(
            `state key "${key}" must not start with "/". Use plain keys (e.g. "open" not "/open"); statePath and $state references use the "/" prefix.`,
          );
        }
      }
    }

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

      // Fix #6: Validate visibility condition operators
      if (el.visible !== undefined) {
        validateVisibility(el.visible, `element "${key}"`, failures);
      }

      // Fix #18: setState bindings must have params.statePath starting with "/"
      if (el.on) {
        const onBindings = el.on as Record<string, { action: string; params?: Record<string, unknown> }>;
        for (const [eventName, binding] of Object.entries(onBindings)) {
          if (binding.action === 'setState') {
            const statePath = binding.params?.statePath;
            if (typeof statePath !== 'string' || !statePath.startsWith('/')) {
              failures.push(
                `element "${key}": on.${eventName} setState requires params.statePath to be a non-empty string starting with "/" (e.g. "/open"), got: ${JSON.stringify(statePath)}`,
              );
            }
          }
        }
      }
    }

    // Fix #5: Cross-reference pass — check that all children[] keys exist in elements.
    // Also checks Tabs props.tabs[i].children and Accordion props.items[i].children.
    for (const [key, el] of Object.entries(spec.elements)) {
      // Check element.children
      for (const childKey of el.children ?? []) {
        if (!(childKey in spec.elements)) {
          failures.push(
            `element "${key}": children references unknown key "${childKey}" — add it to elements or remove it from children`,
          );
        }
      }

      // Check Tabs prop children
      if (el.type === 'Tabs') {
        const props = el.props as { tabs?: Array<{ children?: string[] }> } | undefined;
        if (Array.isArray(props?.tabs)) {
          for (const tab of props.tabs) {
            for (const childKey of tab.children ?? []) {
              if (!(childKey in spec.elements)) {
                failures.push(
                  `element "${key}" (Tabs): tab children references unknown key "${childKey}" — add it to elements or remove it from the tab children`,
                );
              }
            }
          }
        }
      }

      // Check Accordion prop children
      if (el.type === 'Accordion') {
        const props = el.props as { items?: Array<{ children?: string[] }> } | undefined;
        if (Array.isArray(props?.items)) {
          for (const item of props.items) {
            for (const childKey of item.children ?? []) {
              if (!(childKey in spec.elements)) {
                failures.push(
                  `element "${key}" (Accordion): item children references unknown key "${childKey}" — add it to elements or remove it from the item children`,
                );
              }
            }
          }
        }
      }
    }

    if (failures.length > 0) {
      throw new Error(formatErrors(failures));
    }

    return spec;
  },
});
