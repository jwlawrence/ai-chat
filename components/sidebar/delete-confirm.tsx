'use client';

import { type ReactElement } from 'react';
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
      <AlertDialogTrigger render={children} />
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
