'use client';

import { Menu, MessageSquarePlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { AccountSection, type SidebarUser } from './account-section';
import { SidebarList } from './sidebar-list';

function Header() {
  return (
    <div className="flex items-center justify-between border-b px-3 py-2">
      <Link href="/chat" className="font-semibold text-sm">
        AI Chat
      </Link>
      <ThemeToggle />
    </div>
  );
}

function NewChatButton({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/chat" onClick={onClick}>
      <Button className="m-2 w-[calc(100%-1rem)] justify-start" variant="outline">
        <MessageSquarePlus className="mr-2 size-4" /> New chat
      </Button>
    </Link>
  );
}

interface SidebarProps {
  user: SidebarUser | null;
}

export function Sidebar({ user }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-72 shrink-0 border-r md:flex md:flex-col">
        <Header />
        <NewChatButton />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarList />
        </div>
        <AccountSection user={user} />
      </aside>
      {/* Mobile trigger */}
      <div className="absolute top-2 left-2 z-20 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open sidebar" />}>
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col p-0">
            <SheetHeader className="border-b px-3 py-2">
              <SheetTitle>AI Chat</SheetTitle>
            </SheetHeader>
            <NewChatButton onClick={() => setMobileOpen(false)} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SidebarList />
            </div>
            <AccountSection user={user} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
