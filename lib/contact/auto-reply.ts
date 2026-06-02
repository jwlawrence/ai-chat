import type { Spec } from '@json-render/core';
import type { ContactFormSubmission } from './web3forms';

/**
 * Builds the deterministic auto-reply card emitted server-side immediately
 * after a contact-form submission. We do NOT route this through the model:
 *
 *   - The acknowledgement is fully derivable from the submission payload.
 *   - Sending it through the model burns tokens and adds latency for what
 *     should be an instant confirmation.
 *   - The model's variability is undesirable here; recruiters should always
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

function buildSummary(submission: ContactFormSubmission): string {
  const article = /^[aeiou]/i.test(submission.roleType.trim()) ? 'an' : 'a';
  const base = `Got it: you're hiring for ${article} ${submission.roleType} at ${submission.company}`;
  const question = submission.question?.trim();
  if (!question) return `${base}.`;
  return `${base}, and you want to know: ${stripTrailingPunctuation(question)}.`;
}

function stripTrailingPunctuation(text: string): string {
  return text.replace(/[.?!,;:]+\s*$/, '');
}
