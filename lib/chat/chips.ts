import type { UIMessage } from 'ai';
import { RICH_CHIP_PROMPTS } from './rich-prompts';

export type ChipId = 'dashboard' | 'composition' | 'charts' | 'interactive';

export interface ChipPrompt {
  id: ChipId;
  label: string;
  /**
   * Short text sent as the user message and shown verbatim in the chat
   * transcript. Kept tight so the chat transcript stays clean.
   * The chat route swaps this for RICH_CHIP_PROMPTS[id] before the model
   * call, so the model always sees the full spec-grade prompt.
   */
  prompt: string;
}

// Order encodes the narrative arc: how it is built (dashboard) -> what powers
// it (composition) -> why caching makes it cheap (charts) -> get in touch
// (interactive). The chip deck renders in this order. IDs stay stable so
// isChipId, route metadata, and any downstream chip-keyed maps keep working.
export const CHIP_PROMPTS: ChipPrompt[] = [
  {
    id: 'dashboard',
    label: 'Show a dashboard',
    prompt: 'Show a dashboard.',
  },
  {
    id: 'composition',
    label: 'Compose a card layout',
    prompt: 'Compose a card layout.',
  },
  {
    id: 'charts',
    label: 'Plot some data in a graph',
    prompt: 'Plot some data in a graph.',
  },
  {
    id: 'interactive',
    label: 'Build a form',
    prompt: 'Build a form.',
  },
];

// Re-export so existing imports of `RICH_CHIP_PROMPTS` from '@/lib/chat/chips'
// keep working without churn. New code should prefer importing from
// '@/lib/chat/rich-prompts' directly.
export { RICH_CHIP_PROMPTS } from './rich-prompts';

export function isChipId(value: unknown): value is ChipId {
  return typeof value === 'string' && CHIP_PROMPTS.some((c) => c.id === value);
}

/**
 * Returns a new message list where the LAST user message has its text
 * parts replaced with `prompts[id]` when that message carries a known
 * metadata.chipId. All other messages are passed through by reference.
 * The original `messages` array is never mutated, so persistence still
 * sees the short transcript text.
 *
 * Only the last user message is swapped because past chip turns were
 * already answered by the model on their own turn — replaying their rich
 * prompts every subsequent turn would balloon model context with stale
 * guardrails.
 *
 * Form-submit follow-ups (built by buildSubmitFormHandler) do not set
 * metadata.chipId, so the contact form's submitForm turn keeps its data
 * intact and is not clobbered by this swap.
 *
 * `prompts` is injectable so tests can pass a local map without mutating
 * the production-shared RICH_CHIP_PROMPTS. Production callers pass nothing.
 */
export function applyRichChipPrompts(
  messages: UIMessage[],
  prompts: Record<ChipId, string> = RICH_CHIP_PROMPTS,
): UIMessage[] {
  if (messages.length === 0) return messages;
  const lastIdx = messages.length - 1;
  const last = messages[lastIdx];
  if (last.role !== 'user') return messages;

  const chipId = (last as UIMessage & { metadata?: { chipId?: unknown } }).metadata?.chipId;
  if (!isChipId(chipId)) return messages;

  const rich = prompts[chipId];
  if (!rich) return messages;

  const parts = last.parts ?? [];
  const hasText = parts.some((p) => isTextPart(p));
  const swappedParts = hasText
    ? parts.map((p) => (isTextPart(p) ? { ...p, text: rich } : p))
    : [...parts, { type: 'text' as const, text: rich } as UIMessage['parts'][number]];

  const swapped = { ...last, parts: swappedParts } as UIMessage;
  return [...messages.slice(0, lastIdx), swapped];
}

function isTextPart(p: unknown): p is { type: 'text'; text: string } {
  return (
    typeof p === 'object' &&
    p !== null &&
    (p as { type?: unknown }).type === 'text' &&
    typeof (p as { text?: unknown }).text === 'string'
  );
}
