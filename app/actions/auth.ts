'use server';

import { signOut } from '@/lib/auth';

/**
 * Server action invoked by the sidebar's sign-out form. Wrapping NextAuth's
 * signOut in a server action (rather than POSTing /api/auth/signout directly)
 * gives us CSRF handling for free and a typed call site.
 */
export async function signOutAction() {
  await signOut({ redirectTo: '/chat' });
}
