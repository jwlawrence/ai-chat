import { describe, expect, it } from 'vitest';
import { buildAutoReplySpec } from './auto-reply';
import type { ContactFormSubmission } from './web3forms';

const BASE: ContactFormSubmission = {
  name: 'Jane Doe',
  email: 'jane@acme.com',
  topic: 'Question about the build',
  message: 'How does the engine decide what to render?',
};

function getTitle(spec: ReturnType<typeof buildAutoReplySpec>): string {
  const root = spec.elements[spec.root];
  return (root.props as { title?: string }).title ?? '';
}

function getText(spec: ReturnType<typeof buildAutoReplySpec>, elementKey: string): string {
  const el = spec.elements[elementKey];
  return (el.props as { text?: string }).text ?? '';
}

describe('buildAutoReplySpec', () => {
  it('greets the user by their first name with a period', () => {
    expect(getTitle(buildAutoReplySpec({ ...BASE, name: 'Jane Doe' }))).toBe('Thanks, Jane.');
  });

  it('capitalizes the first letter of a lowercase first name', () => {
    expect(getTitle(buildAutoReplySpec({ ...BASE, name: 'jane doe' }))).toBe('Thanks, Jane.');
  });

  it('capitalizes after hyphens (Mary-Jane)', () => {
    expect(getTitle(buildAutoReplySpec({ ...BASE, name: 'mary-jane smith' }))).toBe(
      'Thanks, Mary-Jane.',
    );
  });

  it("capitalizes after apostrophes (O'Brien)", () => {
    expect(getTitle(buildAutoReplySpec({ ...BASE, name: "o'brien" }))).toBe("Thanks, O'Brien.");
  });

  it('leaves already-cased mid-word capitals alone (MacIntyre)', () => {
    expect(getTitle(buildAutoReplySpec({ ...BASE, name: 'MacIntyre Park' }))).toBe(
      'Thanks, MacIntyre.',
    );
  });

  it('falls back to "there" when the name field is empty whitespace', () => {
    expect(getTitle(buildAutoReplySpec({ ...BASE, name: '   ' }))).toBe('Thanks, there.');
  });

  it('uses the "Question about the build" opener and echoes the message', () => {
    expect(getText(buildAutoReplySpec(BASE), 'summary')).toBe(
      'Happy to talk about the build. You wrote: How does the engine decide what to render.',
    );
  });

  it('uses the "Say hello" opener', () => {
    const spec = buildAutoReplySpec({
      ...BASE,
      topic: 'Say hello',
      message: 'Just wanted to say hi',
    });
    expect(getText(spec, 'summary')).toBe(
      'Great to hear from you. You wrote: Just wanted to say hi.',
    );
  });

  it('uses the "Work together" opener', () => {
    const spec = buildAutoReplySpec({
      ...BASE,
      topic: 'Work together',
      message: 'Lets build something',
    });
    expect(getText(spec, 'summary')).toBe(
      'Glad you want to explore working together. You wrote: Lets build something.',
    );
  });

  it('falls back to a generic opener for the "Other" topic', () => {
    const spec = buildAutoReplySpec({ ...BASE, topic: 'Other', message: 'Misc note' });
    expect(getText(spec, 'summary')).toBe('Got your note. You wrote: Misc note.');
  });

  it('always emits the same commitment line', () => {
    expect(getText(buildAutoReplySpec(BASE), 'commitment')).toBe(
      'Josh will follow up within one business day.',
    );
  });
});
