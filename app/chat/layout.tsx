import type { ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar/sidebar';
import { auth } from '@/lib/auth';

export default async function ChatLayout({ children }: { children: ReactNode }) {
  const session = await auth().catch(() => null);
  const user = session?.user
    ? {
        name: session.user.name ?? null,
        email: session.user.email ?? null,
        image: session.user.image ?? null,
      }
    : null;
  return (
    <div className="flex h-dvh w-full">
      <Sidebar user={user} />
      <main className="relative flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
