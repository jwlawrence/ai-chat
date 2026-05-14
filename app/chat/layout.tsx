import type { ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar/sidebar';

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full">
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
