import { notFound } from 'next/navigation';
import { Chat } from '@/components/chat/chat';
import { DEFAULT_MODEL, isModelId } from '@/lib/ai/models';
import { getUserId } from '@/lib/auth';
import { getMessages, getSession } from '@/lib/db/queries';

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getUserId();
  const session = await getSession(id, userId);
  if (!session) notFound();
  const model = isModelId(session.model) ? session.model : DEFAULT_MODEL;
  const initialMessages = await getMessages(id, userId);
  return <Chat sessionId={id} initialModel={model} initialMessages={initialMessages} />;
}
