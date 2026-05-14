'use client';

import Link from 'next/link';
import { Menu, MessageSquarePlus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme-toggle';
import { SidebarList } from './sidebar-list';

function Header() {
  return (
    <div className="flex items-center justify-between border-b px-3 py-2">
      <Link href="/chat" className="text-sm font-semibold">
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

export function Sidebar() {
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
      </aside>
      {/* Mobile trigger */}
      <div className="absolute left-2 top-2 z-20 md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open sidebar" />}>
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b px-3 py-2">
              <SheetTitle>AI Chat</SheetTitle>
            </SheetHeader>
            <NewChatButton onClick={() => setMobileOpen(false)} />
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SidebarList />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
