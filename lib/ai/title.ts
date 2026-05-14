import { generateText, type UIMessage } from 'ai';
import { getModel } from './providers';
import { isModelId, type ModelId } from './models';

const TITLE_INSTRUCTION = `You are a title generator. Read the conversation and produce a short (max 6 words) descriptive title. Return only the title text, no quotes, no punctuation at the end.`;

function flattenText(msg: UIMessage): string {
  return msg.parts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join('')
    .slice(0, 2000);
}

export async function generateTitle(messages: UIMessage[]): Promise<string> {
  const raw = process.env.TITLE_MODEL ?? 'kimi-k2.6';
  const modelId: ModelId = isModelId(raw) ? raw : 'kimi-k2.6';
  const conversation = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, 4)
    .map((m) => `${m.role.toUpperCase()}: ${flattenText(m)}`)
    .join('\n\n');

  const { text } = await generateText({
    model: getModel(modelId),
    system: TITLE_INSTRUCTION,
    prompt: conversation,
  });
  return (
    text
      .trim()
      .replace(/^["']|["']$/g, '')
      .slice(0, 80) || 'New chat'
  );
}
