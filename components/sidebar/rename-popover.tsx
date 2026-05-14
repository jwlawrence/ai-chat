'use client';

import { type ReactElement, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { mutate } from 'swr';

export function RenamePopover({
  sessionId,
  currentTitle,
  children,
}: {
  sessionId: string;
  currentTitle: string;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentTitle);

  async function save() {
    const next = value.trim();
    if (!next || next === currentTitle) {
      setOpen(false);
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
    setOpen(false);
    mutate('/api/sessions');
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={children} />
      <PopoverContent className="w-72" align="start">
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') setOpen(false);
            }}
            autoFocus
          />
          <Button size="sm" onClick={save}>
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
