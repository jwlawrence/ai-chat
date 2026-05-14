import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { DEFAULT_MODEL, isModelId, type ModelId } from '@/lib/ai/models';
import { getModel } from '@/lib/ai/providers';
import { SYSTEM_PROMPT } from '@/lib/ai/system-prompt';
import { generateTitle } from '@/lib/ai/title';
import {
  appendMessages,
  countMessages,
  createSession,
  getSession,
  renameSession,
  touchSession,
  trimTrailingMessages,
} from '@/lib/db/queries';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BodySchema = z.object({
  sessionId: z.string().uuid().optional(),
  model: z.string().optional(),
  messages: z.array(z.any()), // UIMessage[] — trust the SDK shape
});

const CONTEXT_WINDOW = Number.parseInt(process.env.CONTEXT_WINDOW_MESSAGES ?? '50', 10);

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return new Response('Bad request', { status: 400 });
  }
  const body = parsed.data;
  const incoming = body.messages as UIMessage[];

  // Resolve session + model
  let sessionId: string;
  let isNewSession = false;
  let model: ModelId;

  if (body.sessionId) {
    const session = await getSession(body.sessionId);
    if (!session) return new Response('Session not found', { status: 404 });
    if (!isModelId(session.model)) return new Response('Bad model on session', { status: 500 });
    sessionId = session.id;
    model = session.model;
  } else {
    const candidate = body.model && isModelId(body.model) ? body.model : DEFAULT_MODEL;
    const session = await createSession({ model: candidate });
    sessionId = session.id;
    model = candidate;
    isNewSession = true;
  }

  // Reconcile incoming history vs DB so persistence is correct for send AND regenerate.
  // Use `incoming` (full client history) for reconciliation — NOT `windowed` (which is
  // truncated for the model). Otherwise long sessions would falsely trim in-DB messages.
  // - Normal send:        incoming.length = db.length + 1   → trim 0, append the new user msg
  // - Regenerate:         incoming.length = db.length - 1   → trim 1 (old assistant), no new user msg
  // - Error retry/etc.:   reduces to one of the above
  // The trim happens only after a successful onFinish so aborted/error turns don't disturb history.
  const dbCount = isNewSession ? 0 : await countMessages(sessionId);
  const trimCount = Math.max(0, dbCount - incoming.length);
  const newUserMessages = incoming.slice(dbCount - trimCount); // [] when regenerating, else trailing user msgs

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
        abortSignal: req.signal,
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
          await trimTrailingMessages(sessionId, trimCount);
        }
        await appendMessages(sessionId, [
          ...newUserMessages.map((m) => ({ role: m.role, parts: m.parts })),
          { role: responseMessage.role, parts: responseMessage.parts },
        ]);
        await touchSession(sessionId);
      } catch (err) {
        console.error('persistence failed — turn will not appear in history', err);
        return;
      }

      // First turn → generate a title.
      if (isNewSession) {
        try {
          const title = await generateTitle(finalMessages);
          await renameSession(sessionId, title);
        } catch (err) {
          // Non-fatal: keep the default 'New chat'.
          console.error('title generation failed', err);
        }
      }
    },
    onError: (err) => {
      console.error('chat stream error', err);
      return 'Something went wrong while talking to the model.';
    },
  });

  return createUIMessageStreamResponse({ stream });
}
