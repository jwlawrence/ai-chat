import { notFound, redirect } from 'next/navigation';
import { Chat } from '@/components/chat/chat';
import { DEFAULT_MODEL, isModelId } from '@/lib/ai/models';
import { getUserId } from '@/lib/auth';
import { resolveAnonState } from '@/lib/chat/anon-state';
import { getMessages, getSession, isUserOwnedSession } from '@/lib/db/queries';

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getUserId();
  const session = await getSession(id, userId);
  if (!session) {
    if (userId === null && (await isUserOwnedSession(id))) {
      redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/chat/${id}`)}`);
    }
    notFound();
  }
  const model = isModelId(session.model) ? session.model : DEFAULT_MODEL;
  const initialMessages = await getMessages(id, userId);
  const { isAnonymous, hasTrust } = await resolveAnonState();
  return (
    <Chat
      sessionId={id}
      initialModel={model}
      initialMessages={initialMessages}
      isAnonymous={isAnonymous}
      hasTrust={hasTrust}
    />
  );
}
