'use client';

import type { ReactElement } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { mutate } from 'swr';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function DeleteConfirm({
  sessionId,
  children,
}: {
  sessionId: string;
  children: ReactElement;
}) {
  const router = useRouter();
  const pathname = usePathname();

  async function onConfirm() {
    const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Delete failed');
      return;
    }
    mutate('/api/sessions');
    if (pathname === `/chat/${sessionId}`) router.replace('/chat');
  }

  return (
    <AlertDialog>
      {/*
        nativeButton={false} because `children` is a DropdownMenuItem, not a
        native <button>. Without this Base UI warns about button semantics
        being dropped — it defaults to expecting a real button in the render
        prop.
      */}
      <AlertDialogTrigger nativeButton={false} render={children} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
