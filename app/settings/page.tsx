import { redirect } from 'next/navigation';
import { getUserId } from '@/lib/auth';
import { SettingsForm } from './settings-form';

export default async function SettingsPage() {
  const userId = await getUserId();
  if (!userId) redirect('/api/auth/signin');
  return (
    <main className="mx-auto max-w-2xl p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Bring your own Azure key</h1>
      <p className="text-sm text-muted-foreground">
        Enter your Azure Foundry credentials. The key lives in your browser only; it&apos;s sent on
        each chat request via a header and we never persist it server-side.
      </p>
      <SettingsForm />
    </main>
  );
}
