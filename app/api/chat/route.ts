import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { isModelId, type ModelId } from '@/lib/ai/models';
import { getModel, type ProviderOverride, STATELESS_PROVIDER_OPTIONS } from '@/lib/ai/providers';
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
  renameSession,
  touchSession,
  trimTrailingMessages,
} from '@/lib/db/queries';
import { buildSignInSpec } from '@/lib/json-render/server-card';
import { createStreamOnFinish } from './on-finish';
import { createServerCardResponse, resolveOrCreateSession } from './server-card-response';

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

/** Cap on tool-call/response steps per turn so runaway loops stay bounded. */
const MAX_STEPS_PER_TURN = 5;

/** Fallback when MAX_OUTPUT_TOKENS_PER_TURN is unset. */
const DEFAULT_MAX_OUTPUT_TOKENS = 10_000;

const tools = { webSearch, renderUI };

/**
 * Trim/append bookkeeping shared by every persisting branch: how many trailing
 * DB rows the client's shorter history invalidates, and which incoming
 * messages are new relative to the DB.
 */
async function reconcileForPersistence(
  sessionId: string,
  isNewSession: boolean,
  userId: string | null,
  incoming: UIMessage[],
) {
  const dbCount = isNewSession ? 0 : await countMessages(sessionId, userId);
  return reconcileIncoming(dbCount, incoming);
}

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return new Response('Bad request', { status: 400 });
  }
  const body = parsed.data;
  // Boundary cast: BodySchema validates the envelope (role + parts array) and
  // passes unknown part shapes through; the AI SDK's UIMessage is the runtime
  // contract from here on.
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

    // Contact keeps its plain 404 (no sign-in-resume probe): the submit is a
    // follow-up inside an existing flow, not a place to start account recovery.
    const resolved = await resolveOrCreateSession({
      bodySessionId: body.sessionId,
      bodyModel: body.model,
      userId,
      anonymousId,
      incoming,
      allowSignInResume: false,
    });
    if (resolved instanceof Response) return resolved;

    const { trimCount, newMessages: newUserMessages } = await reconcileForPersistence(
      resolved.sessionId,
      resolved.isNew,
      userId,
      incoming,
    );

    // Note: the actual email delivery happens client-side. Web3Forms sits
    // behind Cloudflare's managed bot challenge, which rejects server-side
    // fetches with a 403 challenge page. The browser passes the challenge
    // automatically, so the submitForm handler fires the POST in parallel
    // with this server submit. We only handle the deterministic auto-reply
    // card here.
    return createServerCardResponse({
      spec: buildAutoReplySpec(contactSubmission),
      sessionId: resolved.sessionId,
      isNewSession: resolved.isNew,
      incoming,
      trimCount,
      newUserMessages,
      userId,
      logTag: 'contact',
    });
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
    // finds their conversation missing. claimAnonSessions re-parents on sign-in.
    const resolved = await resolveOrCreateSession({
      bodySessionId: body.sessionId,
      bodyModel: body.model,
      userId,
      anonymousId,
      incoming,
      allowSignInResume: true,
    });
    if (resolved instanceof Response) return resolved;

    const { trimCount, newMessages: newUserMessages } = await reconcileForPersistence(
      resolved.sessionId,
      resolved.isNew,
      userId,
      incoming,
    );

    return createServerCardResponse({
      spec: buildSignInSpec(),
      sessionId: resolved.sessionId,
      isNewSession: resolved.isNew,
      incoming,
      trimCount,
      newUserMessages,
      userId,
      logTag: 'wall',
    });
  }

  if (!gate.allow) {
    return new Response(JSON.stringify({ error: 'quota', reason: gate.reason }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '60' },
    });
  }

  // Resolve session + model
  const resolved = await resolveOrCreateSession({
    bodySessionId: body.sessionId,
    bodyModel: body.model,
    userId,
    anonymousId,
    incoming,
    allowSignInResume: true,
  });
  if (resolved instanceof Response) return resolved;
  // New sessions always carry a validated candidate; only a corrupted existing
  // session can fail this check.
  if (!isModelId(resolved.model)) return new Response('Bad model on session', { status: 500 });
  const sessionId = resolved.sessionId;
  const isNewSession = resolved.isNew;
  const model: ModelId = resolved.model;

  // Reconcile incoming history vs DB so persistence is correct for send AND regenerate.
  // Use `incoming` (full client history) for reconciliation — NOT `windowed` (which is
  // truncated for the model). Otherwise long sessions would falsely trim in-DB messages.
  // The trim happens only after a successful onFinish so aborted/error turns don't disturb history.
  const { trimCount, newMessages: newUserMessages } = await reconcileForPersistence(
    sessionId,
    isNewSession,
    userId,
    incoming,
  );

  // The view sent to the model: sliding window of the most recent messages,
  // with the latest chip-tagged user message swapped from its short transcript
  // text to the rich spec-grade prompt stored server-side in RICH_CHIP_PROMPTS.
  // Persistence still sees the short text via `incoming` / `newUserMessages`,
  // so the chat transcript stays clean.
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
        // Required, not optional: without it the Responses provider replays
        // prior turns as `item_reference` pointers into server-side storage
        // Azure does not keep, and every turn after the first 400s. See the
        // constant's doc comment for the full mechanism.
        providerOptions: STATELESS_PROVIDER_OPTIONS,
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
        stopWhen: stepCountIs(MAX_STEPS_PER_TURN),
        maxOutputTokens: Number(
          process.env.MAX_OUTPUT_TOKENS_PER_TURN ?? DEFAULT_MAX_OUTPUT_TOKENS,
        ),
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
