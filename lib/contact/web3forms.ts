/**
 * Web3Forms submission helper for the contact form in chip 4.
 *
 * Why it lives here: keeping the Web3Forms call behind a tiny helper makes
 * the contact submit site obvious (one function call) and gives us a
 * single seam for tests + future provider swaps.
 *
 * Usage is browser-side: imported by conversation.tsx's submitForm handler
 * and called with `accessKey: process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY`.
 * The browser passes Cloudflare's managed bot challenge that 403s
 * server-side fetches to api.web3forms.com.
 *
 * `accessKey` is a required parameter — callers (and tests) must supply it
 * explicitly. Web3Forms keys are public by design (they identify a delivery
 * destination, not the caller); the NEXT_PUBLIC_ prefix reflects this.
 *
 * Field-validation helpers (parseContactFormFields, detectContactFormSubmit)
 * are exported so the chat route and the client-side handler share one
 * source of truth for "what counts as a valid contact submission".
 */

export const CONTACT_TOPICS = [
  'Say hello',
  'Question about the build',
  'Work together',
  'Other',
] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export type ContactFormSubmission = {
  name: string;
  email: string;
  topic: ContactTopic;
  message: string;
};

/**
 * Length ceilings applied to every parsed submission. Bounding here defends
 * the persistence layer (we serialize submissions into DB message rows),
 * the auto-reply spec (we interpolate values into a card title + body), and
 * the Web3Forms POST body from adversarial 10MB inputs.
 *
 * Values were picked to be generous for legitimate visitors (a long name,
 * a multi-paragraph message) while flagging anything that looks like a
 * paste-bomb. Submissions exceeding any cap are rejected as invalid — the
 * client never sees an "input too long" error, the submit just silently
 * fails to match the contact-submit shape and falls through to the normal
 * model path (which the chip gate will reject for anonymous users anyway).
 */
export const CONTACT_FIELD_MAX = 200;
export const CONTACT_MESSAGE_MAX = 2000;

export type Web3FormsResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'missing_access_key' | 'network_error' | 'send_failed';
      status?: number;
      /** Response body from Web3Forms when the send failed. Often contains the
       *  human-readable reason (e.g. "Required Email field is empty"). Kept
       *  separately from `reason` so the log carries actionable detail without
       *  having to add a new discriminator value. */
      body?: string;
    };

const ENDPOINT = 'https://api.web3forms.com/submit';

export async function sendContactFormToEmail(
  submission: ContactFormSubmission,
  options: { accessKey: string; fetchImpl?: typeof fetch },
): Promise<Web3FormsResult> {
  const accessKey = options.accessKey;
  if (!accessKey?.trim()) return { ok: false, reason: 'missing_access_key' };

  const fetcher = options.fetchImpl ?? fetch;
  const subject = `Portfolio contact: ${submission.topic} (from ${submission.name})`;
  const messageLines = [
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    `Topic: ${submission.topic}`,
    '',
    'Message:',
    submission.message,
  ];

  try {
    const res = await fetcher(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        access_key: accessKey,
        subject,
        // Web3Forms's canonical sender-name field is `name`. We also pass
        // `from_name` for compatibility with templates that key off it.
        name: submission.name,
        from_name: submission.name,
        // The visitor's email — used as the Web3Forms reply-to address and
        // for spam scoring. Also set as `replyto` for explicitness.
        email: submission.email,
        replyto: submission.email,
        message: messageLines.join('\n'),
        // Honeypot anti-spam field stays empty for a legitimate submission.
        botcheck: '',
      }),
    });
    if (!res.ok) {
      // Surface Web3Forms's own error text so the operator can fix the root
      // cause (invalid key, restricted domain, etc.) without guessing.
      const body = await res.text().catch(() => '');
      return { ok: false, reason: 'send_failed', status: res.status, body };
    }
    return { ok: true };
  } catch (err) {
    // Preserve the underlying cause (DNS failure, CORS rejection, fetch abort,
    // AbortError) so the operator can triage from the single console.error
    // line we emit at the call site.
    return {
      ok: false,
      reason: 'network_error',
      body: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Single source of truth for validating raw form data into a typed
 * ContactFormSubmission. Both detectContactFormSubmit (server, message-shape
 * input) and the client-side submitForm handler (raw store payload input)
 * delegate to this so the validation rules cannot drift between them.
 *
 * Returns null if any required field is missing, blank, or exceeds the
 * per-field length cap. Length caps are enforced here, not at the call
 * site, because both callers want the same defensive behaviour.
 */
export function parseContactFormFields(raw: Record<string, unknown>): ContactFormSubmission | null {
  const name = boundedStrOrNull(raw.name, CONTACT_FIELD_MAX);
  const email = boundedEmailOrNull(raw.email, CONTACT_FIELD_MAX);
  const topic = boundedStrOrNull(raw.topic, CONTACT_FIELD_MAX);
  const message = boundedStrOrNull(raw.message, CONTACT_MESSAGE_MAX);
  if (!name || !email || !topic || !message) return null;
  if (!isContactTopic(topic)) return null;
  return { name, email, topic, message };
}

/**
 * Inspects a UIMessage to see whether it carries a contact-form submission
 * press. Returns the validated payload (typed for Web3Forms) when found.
 */
export function detectContactFormSubmit(
  message: { parts?: ReadonlyArray<unknown> } | undefined,
): ContactFormSubmission | null {
  if (!message?.parts) return null;
  for (const raw of message.parts) {
    if (!raw || typeof raw !== 'object') continue;
    const part = raw as { type?: unknown; data?: unknown };
    if (part.type !== 'data-press') continue;
    const data = part.data as { action?: unknown; formName?: unknown; data?: unknown } | undefined;
    if (!data || data.action !== 'submitForm' || data.formName !== 'contact') continue;
    const fields = data.data as Record<string, unknown> | undefined;
    if (!fields) continue;
    const parsed = parseContactFormFields(fields);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Returns true when the incoming history contains a USER message tagged
 * `metadata.chipId === 'interactive'` BEFORE the latest message. We require
 * this lineage on anonymous contact submits so an attacker rotating their
 * pac_anon cookie can't bypass the per-actor rate limit by hand-crafting
 * a single submit message — they would also need to forge a preceding
 * chip-click turn, which the chip gate audits on its own turn.
 *
 * Signed-in users skip this check at the call site; their submission is
 * already attributed to a stable userId.
 */
export function hasInteractiveChipChain(
  incoming: ReadonlyArray<{
    role?: unknown;
    metadata?: unknown;
  }>,
): boolean {
  // Walk backwards from the second-to-last message. The latest is the submit
  // itself; we're looking for evidence that the visitor went through the
  // chip-click path at some earlier point in the conversation.
  for (let i = incoming.length - 2; i >= 0; i--) {
    const m = incoming[i];
    if (m.role !== 'user') continue;
    const chipId = (m.metadata as { chipId?: unknown } | undefined)?.chipId;
    if (chipId === 'interactive') return true;
  }
  return false;
}

/**
 * Pull the optional client-stamped submission id off a contact-form press.
 * The chat route uses it to dedupe double-fire requests so we don't create
 * N sessions for one logical submit.
 */
export function extractContactSubmissionId(
  message: { parts?: ReadonlyArray<unknown> } | undefined,
): string | null {
  if (!message?.parts) return null;
  for (const raw of message.parts) {
    if (!raw || typeof raw !== 'object') continue;
    const part = raw as { type?: unknown; data?: unknown };
    if (part.type !== 'data-press') continue;
    const data = part.data as
      | { action?: unknown; formName?: unknown; submissionId?: unknown }
      | undefined;
    if (!data || data.action !== 'submitForm' || data.formName !== 'contact') continue;
    if (typeof data.submissionId !== 'string' || data.submissionId.length === 0) continue;
    return data.submissionId;
  }
  return null;
}

// Permissive email check: requires at least one non-whitespace/@ char on each
// side of @ and a dot in the domain part. Keeps out obvious garbage
// (no-@, a@b, space@b.com) without rejecting valid edge-case addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isContactTopic(value: string): value is ContactTopic {
  return (CONTACT_TOPICS as readonly string[]).includes(value);
}

function boundedStrOrNull(v: unknown, maxLength: number): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) return null;
  return trimmed;
}

/** Validates that a value is a non-empty string that looks like an email address. */
function boundedEmailOrNull(v: unknown, maxLength: number): string | null {
  const trimmed = boundedStrOrNull(v, maxLength);
  if (!trimmed) return null;
  if (!EMAIL_RE.test(trimmed)) return null;
  return trimmed;
}

// ---------------------------------------------------------------------------
// Client-side field validation (single source of truth alongside parseContactFormFields)
// ---------------------------------------------------------------------------

export const CONTACT_REQUIRED_FIELDS = ['name', 'email', 'topic', 'message'] as const;
export type ContactErrorField = (typeof CONTACT_REQUIRED_FIELDS)[number];

function requiredFieldError(
  raw: unknown,
  max: number,
  emptyMsg: string,
  longMsg: string,
): string | undefined {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length === 0) return emptyMsg;
  if (trimmed.length > max) return longMsg;
  return undefined;
}

/**
 * Field-level validation companion to parseContactFormFields. Returns a map
 * of field → human error message for each invalid field; empty object means
 * all valid. Same rules as parseContactFormFields so the two never drift.
 */
export function validateContactFields(
  raw: Record<string, unknown>,
): Partial<Record<ContactErrorField, string>> {
  const errors: Partial<Record<ContactErrorField, string>> = {};

  // name
  const nameErr = requiredFieldError(
    raw.name,
    CONTACT_FIELD_MAX,
    'Enter your name',
    'Name is too long',
  );
  if (nameErr) errors.name = nameErr;

  // email
  const emailRaw = typeof raw.email === 'string' ? raw.email.trim() : '';
  if (emailRaw.length === 0) {
    errors.email = 'Enter your email';
  } else if (emailRaw.length > CONTACT_FIELD_MAX || !EMAIL_RE.test(emailRaw)) {
    errors.email = 'Enter a valid email';
  }

  // topic
  const topicRaw = typeof raw.topic === 'string' ? raw.topic.trim() : '';
  if (topicRaw.length === 0 || !isContactTopic(topicRaw)) {
    errors.topic = 'Pick a topic';
  }

  // message
  const messageErr = requiredFieldError(
    raw.message,
    CONTACT_MESSAGE_MAX,
    'Enter a message',
    'Message is too long',
  );
  if (messageErr) errors.message = messageErr;

  return errors;
}
