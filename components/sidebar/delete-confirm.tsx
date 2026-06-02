'use client';

import type { ReactElement } from 'react';
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

/**
 * Pure helper: returns true when the real browser URL is the session's chat
 * page. Uses `currentPath` (caller passes `window.location.pathname`) rather
 * than Next's `usePathname()` because new chats bump the URL via
 * `window.history.replaceState` without a router navigation, which leaves
 * `usePathname()` pinned at `/chat` even though the URL bar reads
 * `/chat/<id>`. The raw `window.location.pathname` is always accurate.
 *
 * Extracted as an exported pure function for unit testability.
 */
export function isViewingSession(sessionId: string, currentPath: string): boolean {
  return currentPath === `/chat/${sessionId}`;
}

export function DeleteConfirm({
  sessionId,
  children,
}: {
  sessionId: string;
  children: ReactElement;
}) {
  async function onConfirm() {
    const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
    if (!res.ok) {
      toast.error('Delete failed');
      return;
    }
    mutate('/api/sessions');
    // Use window.location.pathname (real URL) rather than Next's usePathname().
    // After a new chat, the URL bar shows /chat/<id> but usePathname() is
    // pinned at /chat — so the pathname check would miss the delete redirect.
    // Hard-navigate via assign (mirrors NewChatButton) to guarantee a fresh
    // Chat surface with the placeholder chips.
    if (isViewingSession(sessionId, window.location.pathname)) {
      window.location.assign('/chat');
    }
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
