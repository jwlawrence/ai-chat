'use client';

import { createContext, useContext, useState } from 'react';

export type ChatStatus = 'ready' | 'streaming' | 'submitted' | 'error';

export interface ChatStatusContextValue {
  status: ChatStatus;
  setStatus: (s: ChatStatus) => void;
}

export const ChatStatusContext = createContext<ChatStatusContextValue>({
  status: 'ready',
  setStatus: () => {},
});

export function ChatStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ChatStatus>('ready');
  return (
    <ChatStatusContext.Provider value={{ status, setStatus }}>
      {children}
    </ChatStatusContext.Provider>
  );
}

export function useChatStatus(): ChatStatusContextValue {
  return useContext(ChatStatusContext);
}
