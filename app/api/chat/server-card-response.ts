import type { Spec } from '@json-render/core';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import { DEFAULT_MODEL, isModelId } from '@/lib/ai/models';
import {
  appendMessages,
  createSession,
  getSession,
  isUserOwnedSession,
  touchSession,
  trimTrailingMessages,
} from '@/lib/db/queries';
import { buildSignInResumeSpec, writeServerCard } from '@/lib/json-render/server-card';

// ---------------------------------------------------------------------------
// Shared plumbing for the chat route's server-emitted card responses.
//
// Three POST branches (contact auto-reply, anonymous quota wall, and the main
// model stream) previously each carried their own copy of "resolve or create
// the session" and two of them their own copy of "stream a deterministic card
// + persist it in onFinish". The helpers below are that logic, written once.
// ---------------------------------------------------------------------------

/**
 * When an anonymous actor provides a sessionId that resolves to null (because
 * getSession gates on ownership), check whether the session actually exists but
 * is user-owned. If so, stream a sign-in-resume card instead of returning a 404.
 *
 * Returns a Response (the sign-in stream) when the caller should short-circuit,
 * or null when the 404 path should proceed.
 *
 * Intentionally omits the `data-session` chunk: the caller already holds the
 * session id and we never reassign it to the anonymous actor. Intentionally has
 * no `onFinish` persistence: the conversation already exists under the user's
 * account; nothing new needs to be written for this unauthenticated probe.
 */
export async function maybeSignInResumeResponse(
  sessionId: string,
  userId: string | null,
  incoming: UIMessage[],
): Promise<Response | null> {
  if (userId !== null) return null;
  if (!(await isUserOwnedSession(sessionId))) return null;

  const spec = buildSignInResumeSpec(sessionId);
  const toolCallId = `injected-${crypto.randomUUID()}`;
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      try {
        writeServerCard(writer, spec, toolCallId);
      } catch (err) {
        console.error('[session-resume] writeServerCard failed', err);
      }
    },
    originalMessages: incoming,
  });
  return createUIMessageStreamResponse({ stream });
}

export interface ResolvedSession {
  sessionId: string;
  isNew: boolean;
  /** The session's model for existing sessions, or the validated candidate for new ones. */
  model: string;
}

/**
 * Resolve `body.sessionId` to an owned session, or create a fresh one bound to
 * the current actor. Returns a `Response` when the request should short-circuit
 * (404, or the sign-in-resume card for user-owned sessions probed anonymously).
 *
 * `allowSignInResume` gates the user-owned-session probe: the wall and main
 * branches stream a sign-in card so the visitor can recover the conversation;
 * the contact branch intentionally keeps its plain 404.
 */
export async function resolveOrCreateSession(opts: {
  bodySessionId: string | undefined;
  bodyModel: string | undefined;
  userId: string | null;
  anonymousId: string | null;
  incoming: UIMessage[];
  allowSignInResume: boolean;
}): Promise<ResolvedSession | Response> {
  const { bodySessionId, bodyModel, userId, anonymousId, incoming, allowSignInResume } = opts;

  if (bodySessionId) {
    const session = await getSession(bodySessionId, userId);
    if (!session) {
      if (allowSignInResume) {
        const resumeResponse = await maybeSignInResumeResponse(bodySessionId, userId, incoming);
        if (resumeResponse) return resumeResponse;
      }
      return new Response('Session not found', { status: 404 });
    }
    return { sessionId: session.id, isNew: false, model: session.model };
  }

  const candidate = bodyModel && isModelId(bodyModel) ? bodyModel : DEFAULT_MODEL;
  const created = await createSession({ model: candidate, userId, anonymousId });
  return { sessionId: created.id, isNew: true, model: candidate };
}

/**
 * Stream a deterministic server-built card and persist the turn.
 *
 * The response stream carries a transient `data-session` chunk (so the client
 * can pick up a freshly created session id) followed by the card. `onFinish`
 * trims reconciled messages, appends the user's new message(s) plus — only when
 * the card actually made it into the stream — an assistant `tool-renderUI`
 * part whose shape matches what the model-driven path persists, then bumps the
 * session's updatedAt.
 *
 * `cardWritten` guard: without it, a thrown writeServerCard would still leave
 * us appending an assistant part claiming `output: spec` — the user reloads
 * and the transcript shows an "answered" turn for a card they never saw.
 */
export function createServerCardResponse(opts: {
  spec: Spec;
  sessionId: string;
  isNewSession: boolean;
  incoming: UIMessage[];
  trimCount: number;
  newUserMessages: UIMessage[];
  userId: string | null;
  /** Prefix for error logs, e.g. 'contact' or 'wall'. */
  logTag: string;
}): Response {
  const { spec, sessionId, isNewSession, incoming, trimCount, newUserMessages, userId, logTag } =
    opts;
  const toolCallId = `injected-${crypto.randomUUID()}`;

  let cardWritten = false;
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({
        type: 'data-session',
        data: { id: sessionId, isNew: isNewSession },
        transient: true,
      });
      try {
        writeServerCard(writer, spec, toolCallId);
        cardWritten = true;
      } catch (err) {
        console.error(`[${logTag}] writeServerCard failed`, err);
      }
    },
    originalMessages: incoming,
    onFinish: async () => {
      // Persistence errors after stream close can't surface to the client; log.
      try {
        if (trimCount > 0) {
          await trimTrailingMessages(sessionId, userId, trimCount);
        }
        const persistedMessages: Array<{ role: string; parts: unknown[] }> = newUserMessages.map(
          (m) => ({ role: m.role, parts: m.parts }),
        );
        if (cardWritten) {
          persistedMessages.push({
            role: 'assistant',
            parts: [
              {
                type: 'tool-renderUI',
                toolCallId,
                state: 'output-available',
                input: spec,
                output: spec,
              },
            ],
          });
        }
        await appendMessages(
          sessionId,
          userId,
          persistedMessages as Parameters<typeof appendMessages>[2],
        );
        await touchSession(sessionId, userId);
      } catch (err) {
        console.error(`[${logTag}] persistence error in onFinish`, err);
      }
    },
  });
  return createUIMessageStreamResponse({ stream });
}
