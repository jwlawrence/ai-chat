'use client';

import type { UseChatHelpers } from '@ai-sdk/react';
import type { Spec } from '@json-render/core';
import type { StateStore } from '@json-render/core';
import { createStateStore } from '@json-render/core';
import { JSONUIProvider, Renderer } from '@json-render/react';
import type { UIMessage } from 'ai';
import { Globe, MousePointerClick, Sparkles } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Spinner } from '@/components/ui/spinner';
import { specSchema } from '@/lib/ai/tools/render-ui';
import { ACTION_REGISTRY } from '@/lib/json-render/catalog';
import { applyLockToSpec, registry, SpecRenderer } from '@/lib/json-render/registry';

type SendMessage = UseChatHelpers<UIMessage>['sendMessage'];

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
 * Strip leading slashes from state keys. Defensively normalises any persisted
 * specs that used JSON Pointer paths ("/open") as plain state keys before the
 * server-side Fix #11 landed. The runtime flattenToPointers call expects plain
 * keys and adds the "/" itself, so a double-slash would silently break state.
 */
function stripSlashKeys(
  s: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!s) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    out[k.startsWith('/') ? k.slice(1) : k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// data-press chip type
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
 * Returns true when a user message has at least one `data-press` chip part.
 * Used to suppress the companion text part from the visible conversation UI
 * (the chip IS the visual; the text is model-facing only and should not
 * render a second visible bubble).
 */
export function messageHasPressChip(m: UIMessage): boolean {
  return (m.parts ?? []).some((p) => p.type === 'data-press');
}

// ---------------------------------------------------------------------------
// Endpoint dispatcher factory — extracted for testability (I7)
// ---------------------------------------------------------------------------

/**
 * Build one async handler per endpoint-mode action.
 * Exported so unit tests can exercise it directly without mounting React.
 */
export function buildEndpointHandlers(opts: {
  store: StateStore;
  inFlightRef: { current: Map<string, symbol> };
  actionNames: ReadonlySet<string>;
}): Record<string, (params: Record<string, unknown>) => Promise<void>> {
  const { store, inFlightRef, actionNames } = opts;
  const entries = [...actionNames].map((actionName) => [
    actionName,
    async (params: Record<string, unknown>) => {
      const writeResponseTo =
        typeof params._writeResponseTo === 'string' ? params._writeResponseTo : undefined;
      const setPendingAt =
        typeof params._setPendingAt === 'string' ? params._setPendingAt : undefined;

      const postParams = Object.fromEntries(
        Object.entries(params).filter(([k]) => k !== '_writeResponseTo' && k !== '_setPendingAt'),
      );

      const key = writeResponseTo ?? actionName;
      const token = Symbol();
      inFlightRef.current.set(key, token);
      const isLatest = () => inFlightRef.current.get(key) === token;

      if (setPendingAt) {
        store.set(setPendingAt, true);
      }

      try {
        const res = await fetch(`/api/actions/${actionName}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(postParams),
        });
        if (!res.ok) {
          if (isLatest()) toast.error(`Action "${actionName}" failed (${res.status})`);
          return;
        }
        if (writeResponseTo) {
          let body: unknown;
          try {
            body = await res.json();
          } catch {
            if (isLatest()) {
              toast.error(`Action "${actionName}" returned an invalid response`);
            }
            return;
          }
          if (isLatest()) store.set(writeResponseTo, body);
        }
      } catch (err) {
        if (isLatest()) toast.error(`Action "${actionName}" could not be reached`);
        console.error('[RenderUICard] endpoint action failed', actionName, err);
      } finally {
        if (setPendingAt && isLatest()) {
          store.set(setPendingAt, false);
        }
      }
    },
  ]);
  return Object.fromEntries(entries);
}

/**
 * Build the submitForm handler with mutable lock refs injected.
 * Exported so unit tests can exercise lock/rollback behaviour without React.
 */
export function buildSubmitFormHandler(opts: {
  store: StateStore;
  lockedRef: { current: boolean };
  setIsLocked: (v: boolean) => void;
  sendMessage: SendMessage;
  specRoot: string;
}): (params: Record<string, unknown>) => Promise<void> {
  const { store, lockedRef, setIsLocked, sendMessage, specRoot } = opts;
  return async (params: Record<string, unknown>) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setIsLocked(true);
    const formName = String(params.formName ?? '');
    if (!formName) {
      lockedRef.current = false;
      setIsLocked(false);
      return;
    }
    const formData = (store.get(`/${formName}`) as Record<string, unknown> | undefined) ?? {};
    const label = String(params.label ?? `Submitted ${formName}`);
    const message = typeof params.message === 'string' ? params.message : undefined;
    const modelText = [
      `[Submitted form ${formName}: ${JSON.stringify(formData)}`,
      message ? ` — ${message}` : '',
      ']',
    ].join('');
    try {
      await sendMessage({
        role: 'user',
        parts: [
          {
            type: 'data-press',
            data: {
              action: 'submitForm',
              label,
              message,
              data: formData,
              sourceRootId: specRoot,
              mode: 'model',
            } satisfies PressData,
          } as unknown as UIMessage['parts'][number],
          { type: 'text', text: modelText },
        ],
      });
    } catch (err) {
      lockedRef.current = false;
      setIsLocked(false);
      console.error('[RenderUICard] submitForm failed', err);
    }
  };
}

// ---------------------------------------------------------------------------
// RenderUICard — per-card wrapper that owns lock state + model-mode dispatch
// ---------------------------------------------------------------------------

/**
 * Renders a single renderUI spec with its own per-card lock state.
 * Each card in the transcript gets its own `RenderUICard` instance so locking
 * one card doesn't affect other cards. Lock state is in-memory only and resets
 * on reload (per architecture).
 *
 * `sendMessage` is forwarded from `useChat` so model-mode button presses
 * synthesize a real user turn through the same path as typed messages.
 */
function RenderUICard({
  spec,
  initialState,
  sendMessage,
  initiallyLocked = false,
}: {
  spec: Spec;
  initialState?: Record<string, unknown>;
  sendMessage: SendMessage;
  /**
   * If true, the card mounts in the locked state. Computed by ChatConversation
   * via the `lockedRoots` useMemo so cards that already produced a press in
   * a prior reload-restored turn stay locked.
   */
  initiallyLocked?: boolean;
}) {
  const [isLocked, setIsLocked] = useState(initiallyLocked);
  // Ref mirrors isLocked so the guard inside handlers always sees the current
  // value. useMemo keeps handlers stable to avoid JSONUIProvider remounts that
  // would drop StateProvider state mid-turn.
  const lockedRef = useRef(initiallyLocked);

  // In-flight token map for endpoint actions.
  // Keyed by writeResponseTo path (or actionName as fallback). Each concurrent
  // press generates a unique Symbol; only the latest token's settlement writes
  // state, preventing last-writer-wins races from stale parallel responses.
  const inFlightRef = useRef(new Map<string, symbol>());

  // Controlled StateStore — one per card mount, empty deps so it's stable.
  // Passing store={store} to JSONUIProvider instead of initialState={...}
  // lets us call store.set() from outside the React tree (e.g. from the
  // endpoint dispatcher) and have the rendered UI react immediately.
  // biome-ignore lint/correctness/useExhaustiveDependencies: store is intentionally created once per mount; initialState is the seed value only
  const store = useMemo(() => createStateStore(stripSlashKeys(initialState) ?? {}), []);

  // Derive the set of endpoint-mode action names from ACTION_REGISTRY once at
  // module level. This is stable across renders — the registry is a module-level
  // constant — so the useMemo deps array only needs the per-card values below.
  const endpointActionNames = useMemo(
    () =>
      new Set(
        [...ACTION_REGISTRY.entries()]
          .filter(([, def]) => def.mode === 'endpoint')
          .map(([name]) => name),
      ),
    [],
  );

  const handlers = useMemo(() => {
    // Build one endpoint handler per registered endpoint-mode action via the
    // exported factory.  See buildEndpointHandlers for the dispatch contract.
    const endpointEntries = buildEndpointHandlers({
      store,
      inFlightRef,
      actionNames: endpointActionNames,
    });

    return {
      ...endpointEntries,
      sendToModel: async (params: Record<string, unknown>) => {
        // lockedRef guard: preempt double-fire in the same render tick.
        // The lock is set optimistically BEFORE sendMessage so there is no
        // window in which a second press could slip through.
        if (lockedRef.current) return;
        lockedRef.current = true;
        setIsLocked(true);

        const label = typeof params.label === 'string' ? params.label : String(params.label ?? '');
        const message = typeof params.message === 'string' ? params.message : undefined;
        const data = params.data as Record<string, unknown> | undefined;

        // Compose the model-facing text injection.
        const modelText = [
          `[User pressed: ${label}`,
          message ? ` — ${message}` : '',
          data && Object.keys(data).length > 0 ? ` — data: ${JSON.stringify(data)}` : '',
          ']',
        ].join('');

        // Fix #1: Wrap sendMessage in try/catch so a network failure or
        // middleware rejection rolls back the lock. Without rollback the card
        // would stay permanently greyed even though the model never saw the
        // press, and the user would have no way to retry.
        try {
          // Chip part is rendered in the transcript; text part is what the
          // model sees (convertToModelMessages skips data-* parts when no
          // convertDataPart is supplied). The AI SDK's UIMessagePart type
          // only includes data-* in the generic UIDataTypes — for our
          // untyped UIMessage we cast at the boundary.
          //
          // Fix #13: Store only the slim fields needed — label (chip UI),
          // message and data (model context), sourceRootId (lock recovery),
          // mode (Phase 4 discriminator). The `params` blob is omitted.
          await sendMessage({
            role: 'user',
            parts: [
              {
                type: 'data-press',
                data: {
                  action: 'sendToModel',
                  label,
                  message,
                  data,
                  sourceRootId: spec.root,
                  mode: 'model',
                } satisfies PressData,
              } as unknown as UIMessage['parts'][number],
              { type: 'text', text: modelText },
            ],
          });
        } catch (err) {
          // Rollback: the press did not reach the model; let the user retry.
          lockedRef.current = false;
          setIsLocked(false);
          console.error('[RenderUICard] sendMessage failed', err);
        }
      },

      submitForm: buildSubmitFormHandler({
        store,
        lockedRef,
        setIsLocked,
        sendMessage,
        specRoot: spec.root,
      }),
    };
  }, [sendMessage, spec.root, endpointActionNames, store]);

  // Preprocess the spec to inject disabled:true into model-mode Buttons (and
  // Phase 5 form fields) when locked. Both Renderer and SpecRenderer.renderChildren
  // consume effectiveSpec so top-level and Tabs/Accordion-nested elements both
  // reflect the lock through a single source of truth.
  const effectiveSpec = useMemo(() => applyLockToSpec(spec, isLocked), [spec, isLocked]);

  return (
    <JSONUIProvider registry={registry} store={store} handlers={handlers}>
      <SpecRenderer spec={effectiveSpec} registry={registry}>
        <Renderer spec={effectiveSpec} registry={registry} />
      </SpecRenderer>
    </JSONUIProvider>
  );
}

const SUGGESTIONS = [
  'Explain a tricky concept in plain English',
  'Help me debug a piece of code',
  'Draft an email I keep putting off',
  'Brainstorm names for a new project',
];

function EmptyState({ onSuggest }: { onSuggest?: (text: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-4 py-12 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-full bg-card ring-1 ring-border">
          <Sparkles className="size-5 text-muted-foreground" />
        </div>
        <h1 className="font-semibold text-2xl tracking-tight">How can I help today?</h1>
        <p className="max-w-md text-muted-foreground text-sm">
          Start a new conversation by typing below, or pick one of these to get going.
        </p>
      </div>
      <div className="grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSuggest?.(s)}
            disabled={!onSuggest}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatConversation({
  messages,
  status,
  onSuggest,
  sendMessage,
}: {
  messages: UIMessage[];
  status: 'ready' | 'streaming' | 'submitted' | 'error';
  onSuggest?: (text: string) => void;
  sendMessage: SendMessage;
}) {
  // Fix #3 (perf): derive the set of locked root ids once outside the message-
  // map loop. Previously hasPressForRoot() was called per renderUI card inside
  // the map, resulting in O(cards × messages) work. This useMemo is O(messages)
  // and recomputes only when the messages array reference changes (i.e. when a
  // new message arrives).
  //
  // Fix #12: only model-mode chips trigger lock. Endpoint chips (Phase 4) will
  // set mode: 'endpoint' and must not lock their originating card (the endpoint
  // action is re-fireable). Chips without a `mode` field (legacy, pre-Fix #12)
  // are treated as unlocked for graceful degradation.
  const lockedRoots = useMemo(() => {
    const s = new Set<string>();
    for (const m of messages) {
      for (const p of m.parts ?? []) {
        if (p.type !== 'data-press') continue;
        const chipData = (p as { data?: PressData }).data;
        if (chipData?.sourceRootId && chipData.mode === 'model') {
          s.add(chipData.sourceRootId);
        }
      }
    }
    return s;
  }, [messages]);

  // Show the "Thinking..." indicator any time the turn is in flight AND the assistant
  // hasn't produced VISIBLE content yet. Reasoning parts aren't rendered on screen, so
  // a reasoning-first stream would otherwise hide the spinner during the long gap
  // between reasoning-end and the first text token. We only count text/file/tool parts.
  const last = messages.at(-1);
  const isWaiting = status === 'submitted' || status === 'streaming';
  const assistantHasVisibleContent =
    last?.role === 'assistant' &&
    (last.parts ?? []).some((p) => {
      if (p.type === 'text') return p.text.length > 0;
      if (p.type === 'file') return true;
      if (p.type.startsWith('tool-')) return true;
      return false;
    });
  const showThinking = isWaiting && !assistantHasVisibleContent;
  const isEmpty = messages.length === 0;

  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent className={isEmpty ? 'h-full' : 'mx-auto max-w-3xl'}>
        {isEmpty ? (
          <EmptyState onSuggest={onSuggest} />
        ) : (
          <>
            {messages.map((m) => {
              const hasRenderUI = messageHasRenderUI(m);
              const hasPressChip = messageHasPressChip(m);
              return (
                <Message key={m.id} from={m.role}>
                  <MessageContent>
                    {m.parts.map((p, i) => {
                      // Parts within a message have stable ordering for that message — composite key is safe.
                      const key = `${m.id}-${i}`;
                      if (p.type === 'text') {
                        // Suppress text bubbles in a renderUI turn — the rendered card IS the response.
                        // Also suppress in a press-chip turn — the chip IS the visual; the text
                        // is model-facing only.
                        if (hasRenderUI || hasPressChip) return null;
                        return <MessageResponse key={key}>{p.text}</MessageResponse>;
                      }
                      if (p.type === 'data-press') {
                        const data = (p as { data?: PressData }).data;
                        const label = data?.label ?? 'action';
                        return (
                          <div
                            key={key}
                            className="inline-flex items-center gap-1.5 self-end rounded-full border border-border bg-card px-3 py-1 text-foreground text-xs"
                          >
                            <MousePointerClick className="size-3" />
                            <span>
                              You pressed: <span className="font-medium">{label}</span>
                            </span>
                          </div>
                        );
                      }
                      if (p.type === 'file' && p.mediaType?.startsWith('image/')) {
                        return (
                          // biome-ignore lint/performance/noImgElement: data/blob URLs aren't supported by next/image
                          <img
                            key={key}
                            src={p.url}
                            alt={p.filename ?? 'attachment'}
                            className="max-h-80 max-w-full rounded-lg border border-border"
                          />
                        );
                      }
                      if (p.type === 'tool-webSearch') {
                        const query = (p.input as { query?: string } | undefined)?.query;
                        const isRunning =
                          p.state === 'input-streaming' || p.state === 'input-available';
                        return (
                          <div
                            key={key}
                            className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-muted-foreground text-xs"
                          >
                            <Globe className="size-3.5" />
                            <span>
                              {isRunning ? 'Searching the web' : 'Searched the web'}
                              {query ? `: "${query}"` : ''}
                            </span>
                          </div>
                        );
                      }
                      if (p.type === 'tool-renderUI' && p.state === 'output-available') {
                        // Fix #7: Runtime safeParse against specSchema before casting to Spec.
                        // An invalid/corrupt output (e.g. from an older model version) renders
                        // an inline error callout instead of crashing the message bubble.
                        const parsed = specSchema.safeParse(p.output);
                        if (!parsed.success) {
                          return (
                            <div key={key} className="text-sm text-destructive">
                              Failed to render UI: invalid spec.
                            </div>
                          );
                        }
                        const spec: Spec = parsed.data as Spec;
                        // Pass the spec's optional `state` field as initialState so
                        // that local-mode actions (e.g. setState) have the correct
                        // starting values. JSONUIProvider's ActionProvider handles the
                        // built-in `setState` action automatically — no custom handlers
                        // map is needed for local-mode presses.
                        //
                        // Fix #11 (part 2): stripSlashKeys normalises any persisted
                        // specs from before the server-side slash-rejection landed.
                        const initialState = stripSlashKeys(spec?.state ?? undefined);
                        // Re-derive lock state from the transcript: if any model-mode
                        // data-press chip in this session references this card's root,
                        // the card was already used. The in-memory lock resets across
                        // reloads but the chip persists, so this gives us reload-
                        // survivable lock state without adding a new persistence channel.
                        // lockedRoots is computed once per render above (Fix #3 perf).
                        const initiallyLocked = lockedRoots.has(spec.root);
                        return (
                          <div key={key} data-spec-id={spec?.root}>
                            <RenderUICard
                              spec={spec}
                              initialState={initialState}
                              sendMessage={sendMessage}
                              initiallyLocked={initiallyLocked}
                            />
                          </div>
                        );
                      }
                      // Reasoning, streaming/error renderUI, and other tool parts are
                      // persisted but not rendered.
                      return null;
                    })}
                  </MessageContent>
                </Message>
              );
            })}
            {showThinking ? (
              <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 text-muted-foreground text-sm">
                <Spinner /> Thinking...
              </div>
            ) : null}
          </>
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
