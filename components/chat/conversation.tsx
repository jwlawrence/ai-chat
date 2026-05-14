'use client';

import type { UIMessage } from 'ai';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Spinner } from '@/components/ui/spinner';

export function ChatConversation({
  messages,
  status,
}: {
  messages: UIMessage[];
  status: 'ready' | 'streaming' | 'submitted' | 'error';
}) {
  const showThinking = status === 'submitted' && messages.at(-1)?.role !== 'assistant';

  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent className="mx-auto max-w-3xl">
        {messages.map((m) => (
          <Message key={m.id} from={m.role}>
            <MessageContent>
              {m.parts.map((p, i) => {
                if (p.type === 'text') {
                  // Parts within a message have stable ordering for that message — composite key is safe.
                  return <MessageResponse key={`${m.id}-${i}`}>{p.text}</MessageResponse>;
                }
                // Reasoning/tools are persisted but not rendered on day one.
                return null;
              })}
            </MessageContent>
          </Message>
        ))}
        {showThinking ? (
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 text-muted-foreground text-sm">
            <Spinner /> Thinking...
          </div>
        ) : null}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
