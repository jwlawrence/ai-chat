'use client';

import type { Spec } from '@json-render/core';
import { createStateStore } from '@json-render/core';
import { JSONUIProvider, Renderer } from '@json-render/react';
import type { UIMessage } from 'ai';
import { Globe, MousePointerClick, Sparkles } from 'lucide-react';
import { memo, useMemo, useRef, useState } from 'react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Spinner } from '@/components/ui/spinner';
import { specSchema } from '@/lib/ai/tools/render-ui';
import { AUTHOR_LINKEDIN_URL, AUTHOR_NAME } from '@/lib/brand/site';
import {
  buildEndpointHandlers,
  buildSubmitFormHandler,
  type SendMessage,
} from '@/lib/chat/card-handlers';
import type { ChipPrompt } from '@/lib/chat/chips';
import {
  getPressData,
  makePressPart,
  messageHasPressChip,
  messageHasRenderableContent,
  messageHasRenderUI,
  messageHasVisibleOutput,
  stripSlashKeys,
} from '@/lib/chat/press';
import { ACTION_REGISTRY } from '@/lib/json-render/catalog';
import { applyLockToSpec, registry, SpecRenderer } from '@/lib/json-render/registry';
import { AnimatedCardShell } from './animated-card-shell';
import { ChipDeck } from './chip-deck';

// ---------------------------------------------------------------------------
// RenderUIPart — per-message-part wrapper that parses the tool output once
// and forwards a STABLE spec reference into RenderUICard.
//
// Why this exists: ChatConversation re-renders on every useChat update (token
// streams, status changes, sidebar mutations). The tool-renderUI output
// previously ran `specSchema.safeParse(p.output)` inline on every render, and
// Zod returns a new object identity each call. That fresh `spec` reference
// busted RenderUICard's `effectiveSpec = useMemo(..., [spec, isLocked])`,
// which busted Renderer's internal spec subscriptions, which scheduled
// another render — an infinite loop tripped on Form/KPI specs (more
// state-bound subscribers = quicker trip; pure Chart specs survived).
//
// Memoizing the safeParse keyed on `partOutput` identity caches the parsed
// Spec across renders. `React.memo` on the wrapper prevents the inner
// RenderUICard from re-rendering when nothing meaningful changed.
// ---------------------------------------------------------------------------

const RenderUIPart = memo(function RenderUIPart({
  partOutput,
  sendMessage,
  initiallyLocked,
}: {
  partOutput: unknown;
  sendMessage: SendMessage;
  initiallyLocked: boolean;
}) {
  const parsed = useMemo(() => specSchema.safeParse(partOutput), [partOutput]);
  if (!parsed.success) {
    return <div className="text-sm text-destructive">Failed to render UI: invalid spec.</div>;
  }
  const spec = parsed.data as Spec;
  // initialState is consumed once by RenderUICard's `useMemo(() => createStateStore(...), [])`
  // on mount, so its identity post-mount is irrelevant — stripSlashKeys returning a fresh
  // object each render is fine.
  const initialState = stripSlashKeys(spec?.state ?? undefined);
  return (
    <AnimatedCardShell specId={spec?.root}>
      <RenderUICard
        spec={spec}
        initialState={initialState}
        sendMessage={sendMessage}
        initiallyLocked={initiallyLocked}
      />
    </AnimatedCardShell>
  );
});

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
    // Pass lockedRef + setIsLocked so oneShot endpoint actions (e.g. signInWith)
    // can lock the card on press and roll back on failure.
    const endpointEntries = buildEndpointHandlers({
      store,
      inFlightRef,
      actionNames: endpointActionNames,
      lockedRef,
      setIsLocked,
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
          // convertDataPart is supplied).
          //
          // Fix #13: Store only the slim fields needed — label (chip UI),
          // message and data (model context), sourceRootId (lock recovery),
          // mode (Phase 4 discriminator). The `params` blob is omitted.
          await sendMessage({
            role: 'user',
            parts: [
              makePressPart({
                action: 'sendToModel',
                label,
                message,
                data,
                sourceRootId: spec.root,
                mode: 'model',
              }),
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

function EmptyState({
  onChipSelect,
  isAnonymous = false,
}: {
  onChipSelect?: (chip: ChipPrompt) => void;
  isAnonymous?: boolean;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 px-4 py-12 text-center">
      <div className="flex max-w-xl flex-col items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-full bg-card ring-1 ring-border">
          <Sparkles className="size-5 text-muted-foreground" />
        </div>
        <h1 className="font-semibold text-3xl tracking-tight">
          {isAnonymous ? 'A chat that responds with interactive UI.' : 'How can I help today?'}
        </h1>
        <p className="max-w-md text-muted-foreground text-sm">
          {isAnonymous
            ? 'Pick a starter below. The model dynamically answers with interactive components, not plain text.'
            : 'Pick a starter below, or type your own prompt at the bottom.'}
        </p>
        {isAnonymous ? (
          <p className="max-w-md text-muted-foreground text-xs">
            A portfolio piece by{' '}
            <a
              href={AUTHOR_LINKEDIN_URL}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline underline-offset-2 transition-colors hover:text-primary-text"
            >
              {AUTHOR_NAME}
            </a>
            .
          </p>
        ) : null}
      </div>
      {/*
        Anonymous users get a ChipDeck pinned at the bottom (it replaces the
        composer); rendering it here too would be a duplicate surface. Logged-in
        users get the deck inline as the empty-state launch pad while the
        composer underneath stays available for free-form typing.
      */}
      {!isAnonymous && onChipSelect ? <ChipDeck onSelect={onChipSelect} /> : null}
    </div>
  );
}

export function ChatConversation({
  messages,
  status,
  onChipSelect,
  sendMessage,
  isAnonymous = false,
}: {
  messages: UIMessage[];
  status: 'ready' | 'streaming' | 'submitted' | 'error';
  onChipSelect?: (chip: ChipPrompt) => void;
  sendMessage: SendMessage;
  isAnonymous?: boolean;
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
        const chipData = getPressData(p);
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
  const assistantHasVisibleContent = last?.role === 'assistant' && messageHasVisibleOutput(last);
  const showThinking = isWaiting && !assistantHasVisibleContent;
  const isEmpty = messages.length === 0;

  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent className={isEmpty ? 'h-full' : 'mx-auto max-w-3xl'}>
        {isEmpty ? (
          <EmptyState onChipSelect={onChipSelect} isAnonymous={isAnonymous} />
        ) : (
          <>
            {messages.map((m) => {
              const hasRenderUI = messageHasRenderUI(m);
              const hasPressChip = messageHasPressChip(m);
              if (!messageHasRenderableContent(m)) return null;
              return (
                <Message key={m.id} from={m.role}>
                  {/* renderUI cards need room to breathe — MessageContent's default w-fit
                      collapses the card to its narrowest child, squashing charts + stacking
                      KPIs that should sit in a row. */}
                  <MessageContent className={hasRenderUI ? 'w-full' : undefined}>
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
                        const data = getPressData(p);
                        // Caller can mark a press as transcript-hidden when a
                        // server-emitted card already acknowledges it (e.g.
                        // the contact-form auto-reply). The data-press part
                        // still lives on the user message for persistence and
                        // server-side detection; only the visual is omitted.
                        if (data?.hideTranscriptChip) return null;
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
                        // Re-derive lock state from the transcript: if any model-mode
                        // data-press chip in this session references this card's root,
                        // the card was already used. The in-memory lock resets across
                        // reloads but the chip persists, so this gives us reload-
                        // survivable lock state without adding a new persistence channel.
                        // Computed cheaply here (one Set.has) so we don't need to
                        // re-parse the spec just to peek at .root — RenderUIPart owns
                        // the actual parse/render. The cost is reading spec.root from
                        // the output twice, but that's an object property read.
                        const root = (p.output as { root?: string } | undefined)?.root;
                        const initiallyLocked = root ? lockedRoots.has(root) : false;
                        return (
                          <div key={key}>
                            <RenderUIPart
                              partOutput={p.output}
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
