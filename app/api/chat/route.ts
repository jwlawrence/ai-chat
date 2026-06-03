import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { DEFAULT_MODEL, isModelId, type ModelId } from '@/lib/ai/models';
import { getModel, type ProviderOverride } from '@/lib/ai/providers';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { generateTitle } from '@/lib/ai/title';
import { hasRenderUIResult, renderUI } from '@/lib/ai/tools/render-ui';
import { webSearch } from '@/lib/ai/tools/web-search';
import { verifyAnonCookie } from '@/lib/anon/cookie';
import { getUserId } from '@/lib/auth';
import { resolveActor } from '@/lib/budget/identity';
import { type PreflightResult, preflight } from '@/lib/budget/preflight';
import { headersToOverride } from '@/lib/byok/headers';
import { applyRichChipPrompts } from '@/lib/chat/chips';
import { checkChipGate, checkTurnstileGate } from '@/lib/chat/non-model-gates';
import { reconcileIncoming } from '@/lib/chat/reconcile';
import { hasUIRenderIntent } from '@/lib/chat/ui-intent';
import { buildAutoReplySpec } from '@/lib/contact/auto-reply';
import { checkContactSubmitRateLimit, claimSubmissionId } from '@/lib/contact/rate-limit';
import {
  detectContactFormSubmit,
  extractContactSubmissionId,
  hasInteractiveChipChain,
} from '@/lib/contact/web3forms';
import {
  appendMessages,
  countMessages,
  createSession,
  getSession,
  isUserOwnedSession,
  renameSession,
  touchSession,
  trimTrailingMessages,
} from '@/lib/db/queries';
import {
  buildSignInResumeSpec,
  buildSignInSpec,
  writeServerCard,
} from '@/lib/json-render/server-card';
import { createStreamOnFinish } from './on-finish';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Extract a cookie value by name from a raw Cookie header string. Returns null
 * if not present. Robust to spaces and the no-cookie-header case.
 */
function readCookie(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

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
async function maybeSignInResumeResponse(
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

const BodySchema = z.object({
  sessionId: z.string().uuid().optional(),
  model: z.string().optional(),
  messages: z.array(
    z
      .object({
        role: z.enum(['user', 'assistant', 'system']),
        parts: z.array(z.unknown()).optional(),
      })
      .passthrough(),
  ),
});

const CONTEXT_WINDOW = Number.parseInt(process.env.CONTEXT_WINDOW_MESSAGES ?? '50', 10);

const tools = { webSearch, renderUI };

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return new Response('Bad request', { status: 400 });
  }
  const body = parsed.data;
  const incoming = body.messages as unknown as UIMessage[];

  const userId = await getUserId();

  // Anonymous identity resolution:
  //   - Production: pac_anon signed cookie set by proxy.ts
  //   - Tests: x-anonymous-id header (no middleware in vitest)
  // Cookie wins when both are present so we can't mask a real anon visitor
  // with a test header in dev.
  const cookieHeader = req.headers.get('cookie') ?? '';
  const anonCookieValue = readCookie(cookieHeader, 'pac_anon');
  const anonSecret = process.env.ANON_COOKIE_SECRET ?? '';
  const verifiedAnonId =
    anonCookieValue && anonSecret ? await verifyAnonCookie(anonCookieValue, anonSecret) : null;
  const headerAnonRaw = userId ? null : req.headers.get('x-anonymous-id');
  const headerAnon = headerAnonRaw && headerAnonRaw.length <= 128 ? headerAnonRaw : null;
  const anonymousId = userId ? null : (verifiedAnonId ?? headerAnon);
  const actor = resolveActor({ userId, anonymousId });

  const byokOverride: ProviderOverride | undefined = userId
    ? headersToOverride(req.headers)
    : undefined;
  const byok = byokOverride !== undefined;

  // Pin the request to a single UTC day so the preflight read and postflight
  // write agree even if the stream completes after midnight.
  const requestDay = new Date().toISOString().slice(0, 10);

  // ----- Anonymous-traffic gates (run BEFORE preflight so rejected requests
  // never spend DB or model budget) -----

  // 1) Turnstile gate: anonymous visitors must have a fresh pac_trust cookie.
  const earlyTurnstile = await checkTurnstileGate({ userId, cookieHeader });
  if (earlyTurnstile) return earlyTurnstile;

  // 2) Contact-form submission: detect BEFORE the chip gate and BEFORE
  //    preflight. The submit message is a follow-up to the original chip
  //    click and does not carry metadata.chipId, so the chip gate would
  //    otherwise reject anonymous form submissions. The contact flow is
  //    server-deterministic: we POST to Web3Forms and emit the auto-reply
  //    card via writeServerCard. The model is never invoked, so neither
  //    the chip gate nor the AI-cap preflight apply here.
  const contactSubmission = detectContactFormSubmit(incoming[incoming.length - 1]);
  if (contactSubmission) {
    // Anonymous chain guard: an attacker rotating pac_anon cookies could
    // otherwise mint sessions inside the per-actor rate limit by submitting
    // a hand-crafted message with no prior history. Requiring a preceding
    // `metadata.chipId === 'interactive'` user turn means they'd also need
    // to forge a legitimate-looking chip click chain, which the chip gate
    // audits on its own turn. Signed-in users skip this — their userId is
    // already a stable handle that the rate limit binds to.
    if (!userId && !hasInteractiveChipChain(incoming)) {
      return new Response(
        JSON.stringify({ error: 'chainRequired', reason: 'interactiveChipMissing' }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      );
    }

    // Identify the actor for rate-limiting. Anonymous visitors without a
    // pac_anon cookie cannot be tracked across requests, so we refuse to
    // process unattributed submits at all — this also keeps the in-memory
    // rate-limit map from being polluted with empty-string keys.
    const actorKey = userId ? `user:${userId}` : anonymousId ? `anon:${anonymousId}` : null;
    if (!actorKey) {
      return new Response(JSON.stringify({ error: 'unauthorized', reason: 'noActor' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    // Idempotency: if the client-stamped submissionId has already been
    // processed within the dedupe window, short-circuit BEFORE incrementing
    // the rate-limit counter or creating a session. Returns a small JSON
    // ok-with-replay so the duplicate request still gets a clean response.
    const submissionId = extractContactSubmissionId(incoming[incoming.length - 1]);
    if (submissionId && !claimSubmissionId(submissionId).fresh) {
      return new Response(JSON.stringify({ ok: true, replay: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const rateLimit = checkContactSubmitRateLimit(actorKey);
    if (!rateLimit.allowed) {
      console.warn('[contact] rate limit hit', { actorKey });
      return new Response(
        JSON.stringify({
          error: 'rate_limit',
          reason: 'contactSubmitRateLimitExceeded',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': String(rateLimit.retryAfterSeconds),
          },
        },
      );
    }

    let contactSessionId: string;
    let isNewContactSession = false;
    if (body.sessionId) {
      const session = await getSession(body.sessionId, userId);
      if (!session) return new Response('Session not found', { status: 404 });
      contactSessionId = session.id;
    } else {
      const candidate = body.model && isModelId(body.model) ? body.model : DEFAULT_MODEL;
      const created = await createSession({ model: candidate, userId, anonymousId });
      contactSessionId = created.id;
      isNewContactSession = true;
    }

    const dbCount = isNewContactSession ? 0 : await countMessages(contactSessionId, userId);
    const { trimCount, newMessages: newUserMessages } = reconcileIncoming(dbCount, incoming);

    const replySpec = buildAutoReplySpec(contactSubmission);
    const contactToolCallId = `injected-${crypto.randomUUID()}`;

    // Note: the actual email delivery happens client-side. Web3Forms sits
    // behind Cloudflare's managed bot challenge, which rejects server-side
    // fetches with a 403 challenge page. The browser passes the challenge
    // automatically, so the submitForm handler in conversation.tsx fires
    // the POST in parallel with this server submit. We only handle the
    // deterministic auto-reply card here.

    // Track whether the server card actually made it into the stream so the
    // onFinish persist doesn't lie about delivery. Without this, a thrown
    // writeServerCard still leaves us appending an assistant tool-renderUI
    // part claiming `output: replySpec` — the user reloads and the transcript
    // shows an "answered" turn for a card they never saw.
    let cardWritten = false;
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({
          type: 'data-session',
          data: { id: contactSessionId, isNew: isNewContactSession },
          transient: true,
        });
        try {
          writeServerCard(writer, replySpec, contactToolCallId);
          cardWritten = true;
        } catch (err) {
          console.error('[contact] writeServerCard failed', err);
        }
      },
      originalMessages: incoming,
      onFinish: async () => {
        try {
          if (trimCount > 0) {
            await trimTrailingMessages(contactSessionId, userId, trimCount);
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
                  toolCallId: contactToolCallId,
                  state: 'output-available',
                  input: replySpec,
                  output: replySpec,
                },
              ],
            });
          }
          await appendMessages(
            contactSessionId,
            userId,
            persistedMessages as Parameters<typeof appendMessages>[2],
          );
          await touchSession(contactSessionId, userId);
        } catch (err) {
          console.error('[contact] persistence error in onFinish', err);
        }
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  // 3) Chip-only gate: latest user message must carry a known chipId.
  const earlyChip = checkChipGate({ userId, incoming });
  if (earlyChip) return earlyChip;

  let gate: PreflightResult;
  try {
    gate = await preflight({ actor, byok });
  } catch (err) {
    console.error('[preflight] failed — failing closed', err);
    return new Response(
      JSON.stringify({ error: 'service_unavailable', reason: 'preflightFailure' }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    );
  }
  if (
    !gate.allow &&
    actor !== null &&
    actor.actorKind === 'anonymous' &&
    gate.reason === 'actorCapReached'
  ) {
    // Persist the wall turn so post-signin claim recovers the user's last prompt
    // + the card they saw. Without this, the user signs in via the card and
    // finds their conversation missing.
    let wallSessionId: string;
    let isNewWallSession = false;
    if (body.sessionId) {
      const session = await getSession(body.sessionId, userId);
      if (!session) {
        const resumeResponse = await maybeSignInResumeResponse(body.sessionId, userId, incoming);
        if (resumeResponse) return resumeResponse;
        return new Response('Session not found', { status: 404 });
      }
      wallSessionId = session.id;
    } else {
      const candidate = body.model && isModelId(body.model) ? body.model : DEFAULT_MODEL;
      const created = await createSession({ model: candidate, userId, anonymousId });
      wallSessionId = created.id;
      isNewWallSession = true;
    }

    // Reconcile so the user's new message is persisted exactly once (matches the
    // normal stream's reconciliation logic at line ~190).
    const dbCount = isNewWallSession ? 0 : await countMessages(wallSessionId, userId);
    const { trimCount, newMessages: newUserMessages } = reconcileIncoming(dbCount, incoming);

    // Build spec + toolCallId once so the persisted part exactly matches the
    // streamed part.
    const spec = buildSignInSpec();
    const wallToolCallId = `injected-${crypto.randomUUID()}`;

    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({
          type: 'data-session',
          data: { id: wallSessionId, isNew: isNewWallSession },
          transient: true,
        });
        try {
          writeServerCard(writer, spec, wallToolCallId);
        } catch (err) {
          console.error('[wall] writeServerCard failed', err);
        }
      },
      originalMessages: incoming,
      onFinish: async () => {
        // Persist user's new message(s) + the wall card as an assistant message
        // with a tool-renderUI part. claimAnonSessions re-parents on sign-in.
        // Persistence errors after stream close can't surface to client; log.
        try {
          if (trimCount > 0) {
            await trimTrailingMessages(wallSessionId, userId, trimCount);
          }
          await appendMessages(wallSessionId, userId, [
            ...newUserMessages.map((m) => ({ role: m.role, parts: m.parts })),
            {
              role: 'assistant',
              parts: [
                {
                  type: 'tool-renderUI',
                  toolCallId: wallToolCallId,
                  state: 'output-available',
                  input: spec,
                  output: spec,
                },
              ],
            },
          ]);
          await touchSession(wallSessionId, userId);
        } catch (err) {
          console.error('[wall] persistence error in onFinish', err);
        }
      },
    });
    return createUIMessageStreamResponse({ stream });
  }

  if (!gate.allow) {
    return new Response(JSON.stringify({ error: 'quota', reason: gate.reason }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '60' },
    });
  }

  // Resolve session + model
  let sessionId: string;
  let isNewSession = false;
  let model: ModelId;

  if (body.sessionId) {
    const session = await getSession(body.sessionId, userId);
    if (!session) {
      const resumeResponse = await maybeSignInResumeResponse(body.sessionId, userId, incoming);
      if (resumeResponse) return resumeResponse;
      return new Response('Session not found', { status: 404 });
    }
    if (!isModelId(session.model)) return new Response('Bad model on session', { status: 500 });
    sessionId = session.id;
    model = session.model;
  } else {
    const candidate = body.model && isModelId(body.model) ? body.model : DEFAULT_MODEL;
    const created = await createSession({ model: candidate, userId, anonymousId });
    sessionId = created.id;
    model = candidate;
    isNewSession = true;
  }

  // Reconcile incoming history vs DB so persistence is correct for send AND regenerate.
  // Use `incoming` (full client history) for reconciliation — NOT `windowed` (which is
  // truncated for the model). Otherwise long sessions would falsely trim in-DB messages.
  // The trim happens only after a successful onFinish so aborted/error turns don't disturb history.
  const dbCount = isNewSession ? 0 : await countMessages(sessionId, userId);
  const { trimCount, newMessages: newUserMessages } = reconcileIncoming(dbCount, incoming);

  // The view sent to the model: sliding window of the most recent messages,
  // with the latest chip-tagged user message swapped from its short transcript
  // text to the rich spec-grade prompt stored server-side in RICH_CHIP_PROMPTS.
  // Persistence still sees the short text via `incoming` / `newUserMessages`,
  // so the recruiter-facing transcript stays clean.
  const windowed = applyRichChipPrompts(incoming.slice(-CONTEXT_WINDOW));

  // Resolve the model instance before entering the stream so a missing BYOK
  // deployment surfaces as a clean 400 rather than an opaque stream abort.
  let modelInstance: ReturnType<typeof getModel>;
  try {
    modelInstance = getModel(model, byokOverride);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.startsWith('BYOK override is missing a deployment name')) {
      return new Response(JSON.stringify({ error: 'byokModelMissing', model }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw err;
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      // Tell the client the session id immediately. The client uses this to
      // router.replace('/chat/<id>') for new sessions.
      writer.write({
        type: 'data-session',
        data: { id: sessionId, isNew: isNewSession },
        transient: true,
      });

      const result = streamText({
        model: modelInstance,
        system: SYSTEM_PROMPT,
        messages: await convertToModelMessages(windowed),
        tools,
        // Tool gating across step chain:
        //   - "Rendered" = a renderUI tool call that produced an OUTPUT, not just
        //     a call attempt. Failed validation lands in toolCalls but not in
        //     toolResults; counting calls let the model trip the "rendered" gate
        //     by emitting an invalid spec, after which webSearch unlocked.
        //   - For UI-intent prompts: keep activeTools locked to [renderUI] until
        //     renderUI succeeds. After success: strip renderUI so the model
        //     cannot re-render mid-turn (one render per turn), leaving webSearch
        //     for follow-ups. This forces the model to fix a broken spec rather
        //     than bail to webSearch.
        prepareStep: ({ steps }) => {
          if (hasRenderUIResult(steps)) {
            return { activeTools: ['webSearch'] as const };
          }
          if (hasUIRenderIntent(windowed)) {
            return { activeTools: ['renderUI'] as const };
          }
          return undefined;
        },
        // Allow the model to call a tool, see results, then respond — capped to keep runaway loops bounded.
        stopWhen: stepCountIs(5),
        maxOutputTokens: Number(process.env.MAX_OUTPUT_TOKENS_PER_TURN ?? 10000),
        abortSignal: req.signal,
        // Persist usage BEFORE the stream closes so the client's SWR mutate() in useChat's
        // onFinish picks up fresh totals.
        onFinish: createStreamOnFinish({
          actor,
          modelId: model,
          byok,
          day: requestDay,
          sessionId,
          userId,
          isAborted: () => req.signal.aborted,
        }),
      });
      writer.merge(result.toUIMessageStream());
    },
    originalMessages: incoming,
    onFinish: async ({ messages: finalMessages, responseMessage }) => {
      // Stop = discard partial. Error = same. Neither user nor assistant gets persisted.
      // `req.signal.aborted` is the authoritative check; it flips true on client disconnect.
      if (req.signal.aborted || !responseMessage) return;

      // Persistence errors after stream completion can't be surfaced to the client
      // (response is already closed), so at minimum log them prominently.
      try {
        if (trimCount > 0) {
          await trimTrailingMessages(sessionId, userId, trimCount);
        }
        await appendMessages(sessionId, userId, [
          ...newUserMessages.map((m) => ({ role: m.role, parts: m.parts })),
          { role: responseMessage.role, parts: responseMessage.parts },
        ]);
        await touchSession(sessionId, userId);
      } catch (err) {
        console.error(
          '[chat] persistence error in onFinish — history may be incomplete or out of order',
          err,
        );
        return;
      }

      // First turn → generate a title.
      if (isNewSession) {
        try {
          const title = await generateTitle(finalMessages, byokOverride);
          await renameSession(sessionId, title, userId);
        } catch (err) {
          // Non-fatal: keep the default 'New chat'.
          console.error('[chat] title generation failed', err);
        }
      }
    },
    onError: (err) => {
      console.error('[chat] stream error', err);
      return 'Something went wrong while talking to the model.';
    },
  });

  return createUIMessageStreamResponse({ stream });
}
