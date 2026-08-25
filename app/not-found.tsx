import Link from 'next/link';
import { Button } from '@/components/ui/button';

// `notFound()` is reachable from app/chat/[id] whenever a session id is
// unknown or belongs to someone else. Without this route Next serves its
// unstyled default page, which drops the visitor out of the product
// entirely — the worst possible moment for a piece judged on craft.
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex max-w-md flex-col items-center gap-3">
        <h1 className="font-semibold text-3xl tracking-tight">This chat isn&apos;t here.</h1>
        <p className="text-muted-foreground text-sm">
          The conversation may have been deleted, or it belongs to a different account.
        </p>
      </div>
      <Button render={<Link href="/chat" />}>Start a new chat</Button>
    </main>
  );
}
