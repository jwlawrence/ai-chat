import type { UIMessage } from 'ai';

// UI nouns that signal the user is talking about a rendered component.
const UI_NOUNS_RE =
  /\b(card|dashboard|widget|form|button|tab|input|select|checkbox|field|title|heading|callout|badge|list|section|column)\b/i;

// Verbs that suggest the user wants to create or mutate something on screen.
const UI_VERBS_RE =
  /\b(render|build|make|create|show|generate|change|update|edit|tweak|modify|add|remove|adjust)\b/i;

/**
 * Walk backwards through the message history and return true if the most recent
 * ASSISTANT message contained a tool-renderUI part (any state).  Intermediate
 * user messages between here and the last assistant message are skipped so that
 * follow-up exchanges like "that looks good" → "now tweak the title" still match.
 */
function lastAssistantHadRenderUI(messages: UIMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant') continue;
    return (m.parts ?? []).some((p) => p.type === 'tool-renderUI');
  }
  return false;
}

/**
 * True when the most recent user message looks like a "render me a UI" request,
 * OR when it is a follow-up edit to an in-progress UI conversation.
 *
 * Path 1 — explicit intent: the message contains "render" alone, OR a UI verb
 * paired with a UI noun (e.g. "make a dashboard", "show a form").
 *
 * Path 2 — follow-up: the most recent assistant message contained a renderUI
 * tool part AND the current user message contains any UI verb or noun.
 *
 * Conservative on purpose: false negatives are acceptable (model still has
 * webSearch as a fallback).  False positives strip webSearch from legitimate
 * non-UI queries, which is worse.
 */
export function hasUIRenderIntent(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== 'user') return false;
  const text = (last.parts ?? [])
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text: string }).text)
    .join(' ');

  // Path 1: "render" alone is sufficient.
  if (/\brender\b/i.test(text)) return true;

  // Path 1: any UI verb paired with a UI noun.
  if (UI_VERBS_RE.test(text) && UI_NOUNS_RE.test(text)) return true;

  // Path 2: follow-up in an active UI conversation.
  if (lastAssistantHadRenderUI(messages) && (UI_NOUNS_RE.test(text) || UI_VERBS_RE.test(text))) {
    return true;
  }

  return false;
}
