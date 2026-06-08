import { describe, expect, it } from 'vitest';
import { CONTACT_TOPICS } from '@/lib/contact/web3forms';
import { INTERACTIVE_RICH_PROMPT } from './interactive';

describe('INTERACTIVE_RICH_PROMPT', () => {
  it('lists every contact topic so the form stays in sync with CONTACT_TOPICS', () => {
    for (const topic of CONTACT_TOPICS) {
      expect(INTERACTIVE_RICH_PROMPT).toContain(`"value":"${topic}","label":"${topic}"`);
    }
  });

  it('renders the form under formName "contact"', () => {
    expect(INTERACTIVE_RICH_PROMPT).toContain('"name": "contact"');
  });
});
