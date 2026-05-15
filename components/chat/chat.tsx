'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mutate } from 'swr';
import { DEFAULT_MODEL, type ModelId } from '@/lib/ai/models';
import { Composer } from './composer';
import { ChatConversation } from './conversation';
import { ErrorBubble } from './error-bubble';

type Props = {
  sessionId?: string;
  initialModel?: ModelId;
  initialMessages?: UIMessage[];
};

export function Chat({ sessionId: initialSessionId, initialModel, initialMessages }: Props) {
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
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            sessionId: sessionIdRef.current,
            model: modelRef.current,
            messages,
          },
        }),
      }),
    [],
  );

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
    },
  });

  const modelLocked = messages.length > 0;
  const showError = status === 'error' && !!error;

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
        onSuggest={(text) => sendMessage({ role: 'user', parts: [{ type: 'text', text }] })}
      />
      {showError ? (
        <div className="mx-auto w-full max-w-3xl px-4 pb-2">
          <ErrorBubble message={error?.message ?? 'Unknown error'} onRetry={handleRetry} />
        </div>
      ) : null}
      <div className="border-t bg-background/95 px-4 py-3">
        <Composer
          status={status}
          model={model}
          modelLocked={modelLocked}
          sessionId={sessionId}
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
      </div>
    </div>
  );
}
