'use client';

import type { UIMessage } from 'ai';
import { Renderer } from '@json-render/react';
import type { Spec } from '@json-render/core';
import { Globe, Sparkles } from 'lucide-react';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Spinner } from '@/components/ui/spinner';
import { SpecRenderer, registry } from '@/lib/json-render/registry';

/** Returns true when a message has at least one successfully-rendered renderUI part. */
function messageHasRenderUI(m: UIMessage): boolean {
  return (m.parts ?? []).some(
    (p) => p.type === 'tool-renderUI' && p.state === 'output-available',
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
}: {
  messages: UIMessage[];
  status: 'ready' | 'streaming' | 'submitted' | 'error';
  onSuggest?: (text: string) => void;
}) {
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
              return (
                <Message key={m.id} from={m.role}>
                  <MessageContent>
                    {m.parts.map((p, i) => {
                      // Parts within a message have stable ordering for that message — composite key is safe.
                      const key = `${m.id}-${i}`;
                      if (p.type === 'text') {
                        // Suppress text bubbles in a renderUI turn — the rendered card IS the response.
                        if (hasRenderUI) return null;
                        return <MessageResponse key={key}>{p.text}</MessageResponse>;
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
                        const spec = p.output as Spec;
                        return (
                          <div key={key} data-spec-id={spec?.root}>
                            <SpecRenderer spec={spec} registry={registry}>
                              <Renderer spec={spec} registry={registry} />
                            </SpecRenderer>
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
