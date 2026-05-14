'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Session } from '@/lib/db/schema';
import { RenamePopover } from './rename-popover';
import { DeleteConfirm } from './delete-confirm';

export function SidebarItem({ session }: { session: Session }) {
  const pathname = usePathname();
  const active = pathname === `/chat/${session.id}`;
  return (
    <div
      className={cn(
        'group flex items-center justify-between rounded-md px-2 py-1.5 text-sm',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      )}
    >
      <Link href={`/chat/${session.id}`} className="min-w-0 flex-1 truncate">
        {session.title}
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="size-7 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
              aria-label="Session actions"
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <RenamePopover sessionId={session.id} currentTitle={session.title}>
            <DropdownMenuItem closeOnClick={false}>
              <Pencil className="mr-2 size-4" /> Rename
            </DropdownMenuItem>
          </RenamePopover>
          <DeleteConfirm sessionId={session.id}>
            <DropdownMenuItem
              closeOnClick={false}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" /> Delete
            </DropdownMenuItem>
          </DeleteConfirm>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
