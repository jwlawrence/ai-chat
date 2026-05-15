'use client';

import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import type { Session } from '@/lib/db/schema';
import { cn } from '@/lib/utils';
import { DeleteConfirm } from './delete-confirm';

export function SidebarItem({ session }: { session: Session }) {
  const pathname = usePathname();
  const active = pathname === `/chat/${session.id}`;
  const [editing, setEditing] = useState(false);

  return (
    <div
      className={cn(
        'group flex items-center justify-between rounded-md px-2 py-1.5 text-sm',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      )}
    >
      {editing ? (
        <RenameInput
          sessionId={session.id}
          currentTitle={session.title}
          onDone={() => setEditing(false)}
        />
      ) : (
        <>
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
              <DropdownMenuItem onClick={() => setEditing(true)}>
                <Pencil className="mr-2 size-4" /> Rename
              </DropdownMenuItem>
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
        </>
      )}
    </div>
  );
}

function RenameInput({
  sessionId,
  currentTitle,
  onDone,
}: {
  sessionId: string;
  currentTitle: string;
  onDone: () => void;
}) {
  const [value, setValue] = useState(currentTitle);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  async function save() {
    const next = value.trim();
    if (!next || next === currentTitle) {
      onDone();
      return;
    }
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: next }),
    });
    if (!res.ok) {
      toast.error('Rename failed');
      return;
    }
    onDone();
    mutate('/api/sessions');
  }

  return (
    <Input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onDone();
        }
      }}
      autoFocus
      className="h-7"
    />
  );
}
