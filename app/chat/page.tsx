import { Chat } from '@/components/chat/chat';
import { resolveAnonState } from '@/lib/chat/anon-state';

export default async function NewChatPage() {
  const { isAnonymous, hasTrust } = await resolveAnonState();
  return <Chat isAnonymous={isAnonymous} hasTrust={hasTrust} />;
}
