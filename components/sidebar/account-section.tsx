'use client';

import { LogIn, LogOut, Settings } from 'lucide-react';
import Link from 'next/link';
import { signOutAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

export interface SidebarUser {
  name: string | null;
  email: string | null;
  image: string | null;
}

interface Props {
  user: SidebarUser | null;
}

export function AccountSection({ user }: Props) {
  if (user) {
    const displayName = user.name ?? user.email ?? 'Account';
    const showEmailLine = Boolean(user.email && user.name);
    return (
      <div className="border-t p-2">
        <div className="px-1 pb-2">
          <div className="truncate text-sm font-medium">{displayName}</div>
          {showEmailLine ? (
            <div className="truncate text-muted-foreground text-xs">{user.email}</div>
          ) : null}
        </div>
        <Link href="/settings" className="block">
          <Button variant="ghost" className="w-full justify-start">
            <Settings className="mr-2 size-4" /> Settings
          </Button>
        </Link>
        <form action={signOutAction} className="mt-1">
          <Button type="submit" variant="outline" className="w-full justify-start">
            <LogOut className="mr-2 size-4" /> Sign out
          </Button>
        </form>
      </div>
    );
  }
  return (
    <div className="border-t p-2">
      <Link href="/api/auth/signin">
        <Button variant="outline" className="w-full justify-start">
          <LogIn className="mr-2 size-4" /> Sign in
        </Button>
      </Link>
    </div>
  );
}
