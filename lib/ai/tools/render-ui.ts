import { validateSpec as jsonRenderValidateSpec } from '@json-render/core';
import { tool } from 'ai';
import { z } from 'zod';
import {
  ACTION_REGISTRY,
  catalog,
  resolveActionMode,
  validateElementProps,
} from '@/lib/json-render/catalog';

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

// onSuccess / onError shapes — json-render's native post-action state mutations.
const onSuccessSchema = z.union([
  z.object({ navigate: z.string() }),
  z.object({ set: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.string() }),
]);

const onErrorSchema = z.union([
  z.object({ set: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.string() }),
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
    onSuccess: onSuccessSchema
      .optional()
      .describe('Optional: state mutations or navigation to apply on a successful response.'),
    onError: onErrorSchema
      .optional()
      .describe('Optional: state mutations to apply when the action fails.'),
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
        'Optional visibility condition. Examples: true | false | { "$state": "/open" } | { "$state": "/mode", "eq": "edit" } | { "$state": "/hidden", "not": true }.',
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

export function formatErrors(failures: string[]): string {
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

export function summariseZodError(error: z.ZodError): string {
  const issues = error.issues;
  const cap = 3;
  const shown = issues.slice(0, cap);
  const rest = issues.length - cap;
  const parts = shown.map((issue) => {
    const path = issue.path.length > 0 ? `props.${issue.path.join('.')}` : 'props';
    return `${path}: ${issue.message}`;
  });
  if (rest > 0) {
    parts.push(`...and ${rest} more.`);
  }
  return parts.join('; ');
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
  description: `Render a structured UI card inline in the chat by emitting a JSON spec. Call this when the user asks for a card, form, dashboard, comparison, or any structured visual layout.

This tool is fully self-contained: the complete component vocabulary, prop shapes, and authoring rules are in the system prompt. Do NOT search the web for "renderUI" or "json-render" — there is no external API to reference; the schema in the system prompt IS the spec.`,

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
    const knownComponents = new Set(
      Object.keys(catalog.data.components as Record<string, unknown>),
    );

    for (const [key, el] of Object.entries(spec.elements)) {
      // Check type is a known catalog component
      if (!knownComponents.has(el.type)) {
        failures.push(
          `element "${key}": unknown component type "${el.type}" — must be one of ${[...knownComponents].join(', ')}`,
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

      // Validate Tabs.valueStatePath starts with "/" when present.
      if (el.type === 'Tabs') {
        const tabsProps = el.props as { valueStatePath?: unknown } | undefined;
        const vsp = tabsProps?.valueStatePath;
        if (vsp !== undefined) {
          if (typeof vsp !== 'string' || !vsp.startsWith('/')) {
            failures.push(
              `element "${key}" (Tabs): props.valueStatePath must be a string starting with "/" (e.g. "/mode"), got: ${JSON.stringify(vsp)}`,
            );
          }
        }
      }

      // Fix #18: setState bindings must have params.statePath starting with "/"
      // Phase 3: also reject unknown action names so the model gets early feedback
      // instead of a silent no-op at runtime.
      if (el.on) {
        const onBindings = el.on as Record<
          string,
          {
            action: string;
            params?: Record<string, unknown>;
            onSuccess?: { set?: Record<string, unknown> };
            onError?: { set?: Record<string, unknown> };
          }
        >;
        for (const [eventName, binding] of Object.entries(onBindings)) {
          const mode = resolveActionMode(binding.action);
          if (mode === undefined) {
            const known = [...ACTION_REGISTRY.keys()].join(', ');
            failures.push(
              `element "${key}": on.${eventName} references unknown action "${binding.action}" — must be one of ${known}`,
            );
            continue;
          }
          // Fix #2: Validate action params against the registered Zod schema.
          // This catches missing required params (e.g. sendToModel without label)
          // at server-side validation time so the model gets an early, actionable
          // error instead of a silent runtime failure.
          const actionDef = ACTION_REGISTRY.get(binding.action);
          if (actionDef) {
            const paramsResult = actionDef.params.safeParse(binding.params ?? {});
            if (!paramsResult.success) {
              const summary = summariseZodError(paramsResult.error);
              failures.push(
                `element "${key}": on.${eventName} action "${binding.action}" has invalid params: ${summary}`,
              );
            }
          }

          if (binding.action === 'setState') {
            const statePath = binding.params?.statePath;
            if (typeof statePath !== 'string' || !statePath.startsWith('/')) {
              failures.push(
                `element "${key}": on.${eventName} setState requires params.statePath to be a non-empty string starting with "/" (e.g. "/open"), got: ${JSON.stringify(statePath)}`,
              );
            }
          }

          // Validate underscore routing keys — endpoint-only, paths must start with "/".
          const writeResponseTo = binding.params?._writeResponseTo;
          const setPendingAt = binding.params?._setPendingAt;
          if (writeResponseTo !== undefined || setPendingAt !== undefined) {
            if (mode !== 'endpoint') {
              failures.push(
                `element "${key}": on.${eventName} _writeResponseTo/_setPendingAt are only valid for endpoint-mode actions, not "${binding.action}" (mode: ${mode})`,
              );
            } else {
              if (writeResponseTo !== undefined) {
                if (typeof writeResponseTo !== 'string' || !writeResponseTo.startsWith('/')) {
                  failures.push(
                    `element "${key}": on.${eventName} _writeResponseTo must be a string starting with "/" (e.g. "/weather"), got: ${JSON.stringify(writeResponseTo)}`,
                  );
                }
              }
              if (setPendingAt !== undefined) {
                if (typeof setPendingAt !== 'string' || !setPendingAt.startsWith('/')) {
                  failures.push(
                    `element "${key}": on.${eventName} _setPendingAt must be a string starting with "/" (e.g. "/loading"), got: ${JSON.stringify(setPendingAt)}`,
                  );
                }
              }
            }
          }

          // Validate onSuccess.set and onError.set paths start with "/".
          if (binding.onSuccess && 'set' in binding.onSuccess && binding.onSuccess.set) {
            for (const path of Object.keys(binding.onSuccess.set)) {
              if (!path.startsWith('/')) {
                failures.push(
                  `element "${key}": on.${eventName} onSuccess.set key "${path}" must start with "/" (e.g. "/loading")`,
                );
              }
            }
          }
          if (binding.onError && 'set' in binding.onError && binding.onError.set) {
            for (const path of Object.keys(binding.onError.set)) {
              if (!path.startsWith('/')) {
                failures.push(
                  `element "${key}": on.${eventName} onError.set key "${path}" must start with "/" (e.g. "/error")`,
                );
              }
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

    // Fix #8 (server-side completion): detect cycles in the children graph.
    // The client-side SpecRenderer.renderChildren has its own cycle guard for
    // Tabs/Accordion prop children, but @json-render/react's upstream Renderer
    // has no guard for standard `el.children` — a circular spec would stack-
    // overflow in the browser. Reject cycles here before the spec leaves the
    // server. Only run if the cross-reference pass found no dangling keys
    // (DFS on a broken graph would be noisy).
    if (failures.length === 0) {
      const cycle = findChildrenCycle(spec);
      if (cycle) {
        failures.push(`children graph contains a cycle: ${cycle.join(' -> ')}`);
      }
    }

    // Structural validation pass — catches misplaced on/visible/repeat/watch
    // that our Zod envelope strips silently. Runs in addition to the failures
    // above so the model sees all classes of error in one retry, not staggered.
    const NOVEL_CODES = new Set([
      'on_in_props',
      'visible_in_props',
      'repeat_in_props',
      'watch_in_props',
      'empty_spec',
    ] as const);
    try {
      const structuralResult = jsonRenderValidateSpec(
        spec as Parameters<typeof jsonRenderValidateSpec>[0],
      );
      for (const issue of structuralResult.issues ?? []) {
        if (issue.severity !== 'error') continue;
        if (!NOVEL_CODES.has(issue.code as never)) continue;
        const prefix = issue.elementKey ? `element "${issue.elementKey}"` : 'spec';
        failures.push(`${prefix}: ${issue.message}`);
      }
    } catch (err) {
      console.warn('[renderUI] jsonRenderValidateSpec threw:', err);
    }

    if (failures.length > 0) {
      throw new Error(formatErrors(failures));
    }

    return spec;
  },
});

/**
 * Returns true when any step in the current turn produced a successful renderUI
 * tool result. Uses toolResults (not toolCalls) so a failed validation attempt
 * (which lands in toolCalls but not toolResults) does not trigger the gate.
 *
 * Exported so both route.ts and tests can import the same predicate without
 * each carrying their own copy.
 */
export function hasRenderUIResult(
  steps: Array<{ toolResults: Array<{ toolName: string }> }>,
): boolean {
  return steps.some((s) => s.toolResults.some((r) => r.toolName === 'renderUI'));
}

/**
 * DFS the spec's children graph (including Tabs/Accordion prop-level child
 * references) and return the cycle path as a list of element keys if one is
 * found, otherwise null. Assumes all referenced keys exist in spec.elements
 * (caller should run the dangling-key pass first).
 */
function findChildrenCycle(spec: Spec): string[] | null {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const colors = new Map<string, number>();
  const stack: string[] = [];

  function childKeysOf(key: string): string[] {
    const el = spec.elements[key];
    if (!el) return [];
    const keys: string[] = [...(el.children ?? [])];
    if (el.type === 'Tabs') {
      const tabs = (el.props as { tabs?: Array<{ children?: string[] }> } | undefined)?.tabs;
      if (Array.isArray(tabs)) for (const t of tabs) keys.push(...(t.children ?? []));
    }
    if (el.type === 'Accordion') {
      const items = (el.props as { items?: Array<{ children?: string[] }> } | undefined)?.items;
      if (Array.isArray(items)) for (const it of items) keys.push(...(it.children ?? []));
    }
    return keys;
  }

  function dfs(key: string): string[] | null {
    const color = colors.get(key) ?? WHITE;
    if (color === BLACK) return null;
    if (color === GRAY) {
      const cycleStart = stack.indexOf(key);
      return [...stack.slice(cycleStart), key];
    }
    colors.set(key, GRAY);
    stack.push(key);
    for (const child of childKeysOf(key)) {
      const found = dfs(child);
      if (found) return found;
    }
    stack.pop();
    colors.set(key, BLACK);
    return null;
  }

  return dfs(spec.root);
}
