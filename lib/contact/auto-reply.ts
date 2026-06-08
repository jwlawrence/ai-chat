import type { Spec } from '@json-render/core';
import type { ContactFormSubmission } from './web3forms';

/**
 * Builds the deterministic auto-reply card emitted server-side immediately
 * after a contact-form submission. We do NOT route this through the model:
 *
 *   - The acknowledgement is fully derivable from the submission payload.
 *   - Sending it through the model burns tokens and adds latency for what
 *     should be an instant confirmation.
 *   - The model's variability is undesirable here; every visitor should
 *     see the same calm "got it" tone, and Josh's commitment should never
 *     drift.
 *
 * The chat route consumes this via writeServerCard (the same seam Phase 6
 * uses for the anonymous-quota sign-in wall).
 */
export function buildAutoReplySpec(submission: ContactFormSubmission): Spec {
  const firstName = firstNameOf(submission.name);
  const summary = buildSummary(submission);
  return {
    root: 'reply',
    elements: {
      reply: {
        type: 'Card',
        props: { title: `Thanks, ${firstName}.` },
        children: ['summary', 'commitment'],
      },
      summary: {
        type: 'Text',
        props: { text: summary },
        children: [],
      },
      commitment: {
        type: 'Text',
        props: { text: 'Josh will follow up within one business day.' },
        children: [],
      },
    },
  };
}

function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return 'there';
  const first = trimmed.split(/\s+/)[0];
  // Capitalize the first letter and any letter that follows a hyphen or
  // apostrophe so "mary-jane" → "Mary-Jane" and "o'brien" → "O'Brien".
  // Leaves an already-formatted "MacIntyre" alone (we only TitleCase the
  // boundary characters, never lowercase the interior).
  return first.replace(/(^|[-'])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

const SUMMARY_OPENERS: Record<string, string> = {
  'Say hello': 'Great to hear from you.',
  'Question about the build': 'Happy to talk about the build.',
  'Work together': 'Glad you want to explore working together.',
};

function buildSummary(submission: ContactFormSubmission): string {
  const opener = SUMMARY_OPENERS[submission.topic.trim()] ?? 'Got your note.';
  const message = submission.message.trim();
  // Defensive: message is a required, non-blank field (parseContactFormFields
  // rejects a blank message), so this guard never fires for a valid submission.
  if (!message) return opener;
  return `${opener} You wrote: ${stripTrailingPunctuation(message)}.`;
}

function stripTrailingPunctuation(text: string): string {
  return text.replace(/[.?!,;:]+\s*$/, '');
}
