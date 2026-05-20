import { tool } from 'ai';
import { z } from 'zod';
import { catalog, catalogPrompt, validateElementProps } from '@/lib/json-render/catalog';

// ---------------------------------------------------------------------------
// Input schema — envelope only; catalog prop schemas run in execute()
// ---------------------------------------------------------------------------

const elementSchema = z.object({
  type: z.string(),
  props: z.record(z.string(), z.unknown()),
  children: z.array(z.string()),
});

const specSchema = z.object({
  root: z.string(),
  elements: z.record(z.string(), elementSchema),
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
