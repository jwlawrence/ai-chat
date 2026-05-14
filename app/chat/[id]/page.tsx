import { notFound } from 'next/navigation';
import { Chat } from '@/components/chat/chat';
import { isModelId } from '@/lib/ai/models';
import { getMessages, getSession } from '@/lib/db/queries';

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) notFound();
  const model = isModelId(session.model) ? session.model : 'gpt-5.3';
  const initialMessages = await getMessages(id);
  return <Chat sessionId={id} initialModel={model} initialMessages={initialMessages} />;
}
