import { describe, expect, it } from 'vitest';
import { buildAutoReplySpec } from './auto-reply';
import type { ContactFormSubmission } from './web3forms';

const BASE: ContactFormSubmission = {
  name: 'Jane Doe',
  company: 'Acme',
  roleType: 'Tech Lead Manager',
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

  it('summary mentions the role type and company without the question when absent', () => {
    const spec = buildAutoReplySpec(BASE);
    expect(getText(spec, 'summary')).toBe("Got it: you're hiring for a Tech Lead Manager at Acme.");
  });

  it('weaves the question into the summary when present', () => {
    const spec = buildAutoReplySpec({
      ...BASE,
      question: 'Does platform work translate to consumer teams?',
    });
    expect(getText(spec, 'summary')).toBe(
      "Got it: you're hiring for a Tech Lead Manager at Acme, and you want to know: Does platform work translate to consumer teams.",
    );
  });

  it('uses "an" article before a vowel-initial role type', () => {
    const spec = buildAutoReplySpec({ ...BASE, roleType: 'Engineering Manager' });
    expect(getText(spec, 'summary')).toBe(
      "Got it: you're hiring for an Engineering Manager at Acme.",
    );
  });

  it('always emits the same commitment line', () => {
    const spec = buildAutoReplySpec(BASE);
    expect(getText(spec, 'commitment')).toBe('Josh will follow up within one business day.');
  });

  it('treats blank question as if absent', () => {
    const spec = buildAutoReplySpec({ ...BASE, question: '   ' });
    expect(getText(spec, 'summary')).not.toContain('and you want to know');
  });
});
