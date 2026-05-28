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
import { isChipId } from '@/lib/chat/chips';
import { reconcileIncoming } from '@/lib/chat/reconcile';
import { hasUIRenderIntent } from '@/lib/chat/ui-intent';
import {
  appendMessages,
  countMessages,
  createSession,
  getSession,
  renameSession,
  touchSession,
  trimTrailingMessages,
} from '@/lib/db/queries';
import { verifyTrust } from '@/lib/turnstile/cookie';
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
  if (!userId) {
    // 1) Turnstile gate: anonymous must have a fresh pac_trust cookie.
    const trustCookieValue = readCookie(cookieHeader, 'pac_trust');
    const trustSecret = process.env.TRUST_COOKIE_SECRET ?? '';
    const trusted =
      trustCookieValue && trustSecret ? await verifyTrust(trustCookieValue, trustSecret) : null;
    if (!trusted) {
      return new Response(JSON.stringify({ error: 'turnstileRequired' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }

    // 2) Chip-only gate: latest user message must carry a known chipId.
    const lastUser = [...incoming].reverse().find((m) => m.role === 'user') as
      | (UIMessage & { metadata?: { chipId?: unknown } })
      | undefined;
    const chipId = lastUser?.metadata?.chipId;
    if (!isChipId(chipId)) {
      return new Response(JSON.stringify({ error: 'chipRequired' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }
  }

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
    if (!session) return new Response('Session not found', { status: 404 });
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

  // The view sent to the model: sliding window of the most recent messages.
  const windowed = incoming.slice(-CONTEXT_WINDOW);

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
