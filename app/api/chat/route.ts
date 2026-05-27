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
import { getModel } from '@/lib/ai/providers';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { generateTitle } from '@/lib/ai/title';
import { hasRenderUIResult, renderUI } from '@/lib/ai/tools/render-ui';
import { webSearch } from '@/lib/ai/tools/web-search';
import { getUserId } from '@/lib/auth';
import { resolveActor } from '@/lib/budget/identity';
import { type PreflightResult, preflight } from '@/lib/budget/preflight';
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
import { createStreamOnFinish } from './on-finish';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

  // Anonymous identity is provided by Phase 4 middleware via the `pac_anon`
  // cookie. Until that lands, accept it as a header for tests and integrations;
  // real anonymous traffic will currently resolve to actor=null and skip the
  // per-actor cap while global caps still apply (graceful degradation).
  const rawAnonymousId = userId ? null : req.headers.get('x-anonymous-id');
  const anonymousId = rawAnonymousId && rawAnonymousId.length <= 128 ? rawAnonymousId : null;
  const actor = resolveActor({ userId, anonymousId });
  const byok = false; // wired up in Phase 5
  // Pin the request to a single UTC day so the preflight read and postflight
  // write agree even if the stream completes after midnight.
  const requestDay = new Date().toISOString().slice(0, 10);

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
      headers: {
        'content-type': 'application/json',
        'retry-after': '60',
      },
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
    const created = await createSession({ model: candidate, userId });
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
        model: getModel(model),
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
          const title = await generateTitle(finalMessages);
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
