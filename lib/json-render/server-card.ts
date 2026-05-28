import type { Spec } from '@json-render/core';
import type { UIMessage, UIMessageStreamWriter } from 'ai';
import { specSchema } from '@/lib/ai/tools/render-ui';

/**
 * Pre-built sign-in card spec emitted when an anonymous visitor hits the
 * anonymous daily cap. Two provider buttons (Google primary, GitHub secondary)
 * bound to `signInWith` endpoint action with responseEffect: 'navigate'.
 */
export function buildSignInSpec(): Spec {
  return {
    root: 'card',
    elements: {
      card: {
        type: 'Card',
        props: { title: 'Continue with sign-in' },
        children: ['heading', 'text', 'google', 'github'],
      },
      heading: {
        type: 'Heading',
        props: { level: 2, text: 'Free demo limit reached' },
        children: [],
      },
      text: {
        type: 'Text',
        props: {
          text: 'Sign in to keep exploring — larger daily quota, free typing, and history that follows you across devices.',
        },
        children: [],
      },
      google: {
        type: 'Button',
        props: { label: 'Continue with Google', variant: 'primary' },
        on: { press: { action: 'signInWith', params: { provider: 'google' } } },
        children: [],
      },
      github: {
        type: 'Button',
        props: { label: 'Continue with GitHub', variant: 'secondary' },
        on: { press: { action: 'signInWith', params: { provider: 'github' } } },
        children: [],
      },
    },
  };
}

/**
 * Emit the two AI SDK v6 stream chunks that reconstruct a `tool-renderUI` part
 * with `state: 'output-available'` on the client. This bypasses the model
 * entirely — used when preflight rejects an anonymous request with
 * `actorCapReached` so the chat can present a sign-in card inline instead of
 * returning a bare 429.
 *
 * Validates the spec through `specSchema` before writing. Throws on invalid
 * spec rather than emitting a broken card to the client.
 *
 * `toolCallId` is optional so callers can pass a stable value in tests; defaults
 * to a unique generated id at call time.
 */
export function writeServerCard(
  writer: UIMessageStreamWriter<UIMessage>,
  spec: Spec,
  toolCallId: string = `injected-${crypto.randomUUID()}`,
): string {
  const validated = specSchema.safeParse(spec);
  if (!validated.success) {
    console.error('[server-card] refusing to emit invalid spec', validated.error.format());
    throw new Error('Invalid server-card spec');
  }
  writer.write({
    type: 'tool-input-available',
    toolCallId,
    toolName: 'renderUI',
    input: validated.data,
  });
  writer.write({
    type: 'tool-output-available',
    toolCallId,
    output: validated.data,
  });
  return toolCallId;
}
