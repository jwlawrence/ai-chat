'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
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
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [model, setModel] = useState<ModelId>(initialModel ?? DEFAULT_MODEL);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            sessionId,
            model,
            messages,
          },
        }),
      }),
    [sessionId, model],
  );

  const { messages, sendMessage, status, error, regenerate, stop } = useChat({
    transport,
    messages: initialMessages,
    onData: (dataPart) => {
      if (dataPart.type === 'data-session') {
        const d = dataPart.data as { id: string; isNew: boolean };
        if (d.isNew) {
          setSessionId(d.id);
          // Replace URL without reloading the component tree.
          router.replace(`/chat/${d.id}`, { scroll: false });
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
      <ChatConversation messages={messages} status={status} />
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
          onModelChange={setModel}
          onSubmit={(text) => sendMessage({ role: 'user', parts: [{ type: 'text', text }] })}
          onStop={stop}
        />
      </div>
    </div>
  );
}
