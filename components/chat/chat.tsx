'use client';

import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { DefaultChatTransport } from 'ai';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mutate } from 'swr';
import { useChatStatus } from '@/components/sidebar/chat-status-context';
import { DEFAULT_MODEL, type ModelId } from '@/lib/ai/models';
import { recordToHeaders } from '@/lib/byok/headers';
import { loadByok } from '@/lib/byok/storage';
import type { ChipPrompt } from '@/lib/chat/chips';
import { AnonTurnstileGate } from './anon-gate';
import { ChipDeck } from './chip-deck';
import { Composer } from './composer';
import { ChatConversation } from './conversation';
import { ErrorBubble } from './error-bubble';

type Props = {
  sessionId?: string;
  initialModel?: ModelId;
  initialMessages?: UIMessage[];
  isAnonymous?: boolean;
  hasTrust?: boolean;
};

/** Delay before the safety-net budget revalidation after a turn finishes. */
const BUDGET_REVALIDATE_DELAY_MS = 1500;

export function Chat({
  sessionId: initialSessionId,
  initialModel,
  initialMessages,
  isAnonymous = false,
  hasTrust = false,
}: Props) {
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [model, setModel] = useState<ModelId>(initialModel ?? DEFAULT_MODEL);

  // useChat captures the transport on mount, so its prepareSendMessagesRequest closure can
  // go stale on later renders. Build the transport once and let it read live values from refs.
  const sessionIdRef = useRef(sessionId);
  const modelRef = useRef(model);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages }) => {
          const byok = loadByok();
          const headers: Record<string, string> = {};
          if (byok) Object.assign(headers, recordToHeaders(byok));
          return {
            body: {
              sessionId: sessionIdRef.current,
              model: modelRef.current,
              messages,
            },
            headers,
          };
        },
      }),
    [],
  );

  const { setStatus: setChatStatus } = useChatStatus();

  const { messages, sendMessage, status, error, regenerate, stop } = useChat({
    transport,
    messages: initialMessages,
    onData: (dataPart) => {
      if (dataPart.type === 'data-session') {
        const d = dataPart.data as { id: string; isNew: boolean };
        if (d.isNew) {
          setSessionId(d.id);
          // Update the URL without triggering Next.js to refetch the route segment.
          // router.replace() would unmount this <Chat> (different page file), dropping the
          // in-flight stream. history.replaceState keeps the same React tree mounted; the
          // proper /chat/[id] page renders on the next refresh or back/forward navigation.
          window.history.replaceState(null, '', `/chat/${d.id}`);
          // Refresh sidebar so the new session appears.
          mutate('/api/sessions');
        }
      }
    },
    onFinish: () => {
      // Bump sidebar so updatedAt / title reflect latest.
      mutate('/api/sessions');
      // Revalidate budget gauge. postflight is awaited inside streamText.onFinish
      // before the outer stream closes, so the immediate mutate should read fresh
      // spend. A delayed revalidation covers any edge-case timing drift.
      mutate('/api/budget');
      setTimeout(() => mutate('/api/budget'), BUDGET_REVALIDATE_DELAY_MS);
    },
  });

  // Publish status to the shared context so NewChatButton can disable
  // itself during in-flight turns without prop-drilling through the layout.
  useEffect(() => {
    setChatStatus(status);
  }, [status, setChatStatus]);

  const modelLocked = messages.length > 0;
  const showError = status === 'error' && !!error;

  function handleChipSelect(chip: ChipPrompt) {
    sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: chip.prompt }],
      metadata: { chipId: chip.id },
    } as UIMessage & { metadata: { chipId: string } });
  }

  function handleRetry() {
    // Server-side reconcile handles trim/append based on incoming-vs-DB counts,
    // so a plain regenerate() works for both error-retry and user-initiated regenerate.
    regenerate();
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <ChatConversation
        messages={messages}
        status={status}
        onChipSelect={isAnonymous ? undefined : handleChipSelect}
        sendMessage={sendMessage}
        isAnonymous={isAnonymous}
      />
      {showError ? (
        <div className="mx-auto w-full max-w-3xl px-4 pb-2">
          <ErrorBubble message={error?.message ?? 'Unknown error'} onRetry={handleRetry} />
        </div>
      ) : null}
      <div className="border-t bg-background/95 px-4 py-3">
        {isAnonymous ? (
          !hasTrust ? (
            <AnonTurnstileGate siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''} />
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col items-stretch gap-3">
              <ChipDeck
                compact
                onSelect={handleChipSelect}
                disabled={status === 'streaming' || status === 'submitted'}
              />
              <p className="text-center text-muted-foreground text-xs">
                Free typing is locked for anonymous visitors.{' '}
                <Link
                  href="/api/auth/signin"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>{' '}
                to chat freely.
              </p>
            </div>
          )
        ) : (
          <Composer
            status={status}
            model={model}
            modelLocked={modelLocked}
            onModelChange={setModel}
            onSubmit={({ text, files }) =>
              sendMessage({
                role: 'user',
                parts: [
                  ...(text ? [{ type: 'text' as const, text }] : []),
                  ...files.map((f) => ({
                    type: 'file' as const,
                    mediaType: f.mediaType,
                    filename: f.filename,
                    url: f.url,
                  })),
                ],
              })
            }
            onStop={stop}
          />
        )}
      </div>
    </div>
  );
}
