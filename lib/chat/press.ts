import type { UIMessage } from 'ai';

// ---------------------------------------------------------------------------
// data-press chip type + message-part predicates
//
// Pure transcript logic shared by the conversation components and their unit
// tests. Lives in lib/ so the React tree in components/chat/conversation.tsx
// stays presentation-only.
// ---------------------------------------------------------------------------

/**
 * Shape of the `data` payload in a `data-press` user message part.
 *
 * Slim format (Fix #13): only the fields actually needed are stored — `label`
 * for the chip UI, `message` and `data` for model context, `sourceRootId` for
 * reload-survivable lock recovery, and `mode` for Phase 4 readiness (endpoint
 * chips will set mode: 'endpoint' and must NOT trigger the lock logic).
 *
 * The `params` blob is intentionally absent: it contained both `label` and
 * `message` (redundant) plus `data` (now stored directly). Removing it keeps
 * the persisted part lean.
 *
 * This is a UI-only part — `convertToModelMessages` ignores `data-*` parts
 * by default (no `convertDataPart` option is passed in route.ts), so it
 * never reaches the model. The text part in the same message IS sent.
 */
export interface PressData {
  action: string;
  label: string;
  /** Optional extra context the model should see, in addition to the label. */
  message?: string;
  /** Optional structured payload echoed to the model as JSON. */
  data?: Record<string, unknown>;
  /**
   * For submitForm presses: the form `name` prop. Lets the server identify
   * specific form submissions (e.g. the contact form) without having to
   * pattern-match the data payload.
   */
  formName?: string;
  /**
   * For submitForm presses on idempotent flows (contact form): a UUID
   * stamped client-side on the first press. The server uses it to dedupe
   * React StrictMode double-fires, double-clicks past the card-lock race,
   * and retries on hung fetches.
   */
  submissionId?: string;
  /**
   * Hide the press from the visible transcript. The data-press part still
   * lives on the user message (needed for server-side detection and
   * persistence) — it just doesn't render a "You pressed: <label>" chip.
   * Set by the dispatcher when the user-facing acknowledgement is already
   * carried by a server-emitted card (e.g. the contact-form auto-reply).
   */
  hideTranscriptChip?: boolean;
  /**
   * Root id of the renderUI card that produced this press. Used on reload to
   * pre-lock cards that were already used in earlier turns — the in-memory
   * lock state resets across reloads, but the chip persists in the DB so we
   * can recover the "this card has been pressed" signal from message history.
   */
  sourceRootId?: string;
  /**
   * Dispatch mode of the action that produced this chip (Fix #12 / Phase 4).
   *
   * - `'model'`    — this chip locked the card; useMemo uses this to skip
   *                  endpoint chips that must NOT trigger the lock.
   * - `'endpoint'` — Phase 4: fires a backend call, card stays unlocked.
   * - `'local'`    — theoretical; local presses don't produce chips today.
   *
   * Absent on legacy chips (pre-Fix #12 persisted data) — treated as unlocked
   * for graceful degradation.
   */
  mode?: 'local' | 'model' | 'endpoint';
}

/**
 * Narrow a message part to its `data-press` payload, or undefined when the
 * part is not a press chip. Centralises the one place the untyped part is
 * cast, so callers never write `(p as { data?: PressData })` inline.
 */
export function getPressData(p: UIMessage['parts'][number]): PressData | undefined {
  if (p.type !== 'data-press') return undefined;
  return (p as { data?: PressData }).data;
}

/**
 * Build a `data-press` message part from a payload. The AI SDK's UIMessagePart
 * type only includes data-* parts in the generic UIDataTypes; for our untyped
 * UIMessage this is the single boundary where the cast happens.
 */
export function makePressPart(data: PressData): UIMessage['parts'][number] {
  return { type: 'data-press', data } as unknown as UIMessage['parts'][number];
}

/**
 * Returns true when a message has at least one tool-renderUI part in any state.
 * Previously required `state === 'output-available'`, but that caused a flicker
 * where a rendering message would briefly show its text parts while streaming.
 * Widening to any renderUI part state suppresses the text bubble for the full
 * duration of the tool call (Fix #2).
 */
export function messageHasRenderUI(m: UIMessage): boolean {
  return (m.parts ?? []).some((p) => p.type === 'tool-renderUI');
}

/**
 * Returns true when a user message has at least one `data-press` chip part.
 * Used to suppress the companion text part from the visible conversation UI
 * (the chip IS the visual; the text is model-facing only and should not
 * render a second visible bubble).
 */
export function messageHasPressChip(m: UIMessage): boolean {
  return (m.parts ?? []).some((p) => p.type === 'data-press');
}

/**
 * Returns true when a message has at least one part that will produce a
 * visible element in the conversation render map. Mirrors the per-part render
 * decisions in `messages.map` so the enclosing `<Message>` bubble can be
 * skipped entirely when all parts would return null — preventing empty
 * right-aligned bubbles (e.g. a contact-form submit that has both a
 * `hideTranscriptChip` data-press and a companion text part suppressed by
 * `hasPressChip`).
 */
export function messageHasRenderableContent(m: UIMessage): boolean {
  const hasRenderUI = messageHasRenderUI(m);
  const hasPressChip = messageHasPressChip(m);
  return (m.parts ?? []).some((p) => {
    if (p.type === 'text') return !(hasRenderUI || hasPressChip) && p.text.length > 0;
    if (p.type === 'data-press') return !getPressData(p)?.hideTranscriptChip;
    if (p.type === 'file') return p.mediaType?.startsWith('image/') ?? false;
    if (p.type === 'tool-webSearch') return true;
    if (p.type === 'tool-renderUI') return (p as { state?: string }).state === 'output-available';
    return false;
  });
}

/**
 * Returns true when a message has at least one part that produces visible output
 * on screen. Used by the spinner logic: the "Thinking..." indicator hides as soon
 * as visible content arrives.
 *
 * - Non-empty text parts are visible.
 * - File parts are visible.
 * - Tool parts are visible only when their result is available (output-available
 *   or output-error). input-streaming and input-available do not yet have output.
 */
export function messageHasVisibleOutput(message: UIMessage): boolean {
  return (message.parts ?? []).some((p) => {
    if (p.type === 'text') return p.text.length > 0;
    if (p.type === 'file') return true;
    if (p.type.startsWith('tool-')) {
      const state = (p as { state?: string }).state;
      return state === 'output-available' || state === 'output-error';
    }
    return false;
  });
}

/**
 * Strip leading slashes from state keys. Defensively normalises any persisted
 * specs that used JSON Pointer paths ("/open") as plain state keys before the
 * server-side Fix #11 landed. The runtime flattenToPointers call expects plain
 * keys and adds the "/" itself, so a double-slash would silently break state.
 */
export function stripSlashKeys(
  s: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!s) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    out[k.startsWith('/') ? k.slice(1) : k] = v;
  }
  return out;
}
