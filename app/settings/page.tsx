import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserId } from '@/lib/auth';
import { SettingsForm } from './settings-form';

export default async function SettingsPage() {
  const userId = await getUserId();
  if (!userId) redirect('/api/auth/signin');
  return (
    // Settings sits outside app/chat/layout.tsx, so it inherits no sidebar and
    // had no way back — a one-way door out of the product. The measure also
    // now matches the app's single 768px column instead of max-w-2xl.
    <main className="mx-auto max-w-3xl space-y-6 p-8">
      <Link
        href="/chat"
        className="inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to chat
      </Link>
      <h1 className="font-semibold text-3xl tracking-tight">Bring your own Azure key</h1>
      <p className="text-sm text-muted-foreground">
        Enter your Azure Foundry credentials. The key lives in your browser only; it&apos;s sent on
        each chat request via a header and we never persist it server-side.
      </p>
      <SettingsForm />
    </main>
  );
}
