# Starter-Chip Content ("the app explains itself") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four starter chips' career-achievement content with portfolio-facing content *about the app itself* (architecture, the generative-UI engine, prompt caching, and a reframed contact form), keeping all four layouts, chip IDs, labels, and icons.

**Architecture:** Each chip's server-side "rich prompt" (a spec-grade string the chat route swaps in before the model call) is rewritten. The 4th chip stays a working contact form (`name="contact"`) so the submit → server-side auto-reply round-trip keeps working, but its fields change from `{name,email,company,roleType,question?}` to `{name,email,topic,message}`, which ripples through the contact validator, email send, auto-reply copy, and several test fixtures.

**Tech Stack:** Next.js 16 (App Router), TypeScript, `@json-render/*` generative UI, Vitest, Biome, pnpm.

---

## Environment & commands (read first)

- **Package manager:** `pnpm`. No new dependencies are added by this plan, so no installs are required.
- **Tests:** Vitest. Run **only targeted files** — `pnpm test <path...>` (the `test` script is `vitest run`, so trailing paths scope it). **Never run the full suite** (`pnpm test` with no path) — it reaches the real Neon prod DB. The contact route tests mock the DB, so targeting them is safe.
- **Node for Vitest:** Vitest needs the **Homebrew arm64 `node@24`**. Before running tests, confirm `node -v` is ≥ 24 and the arch is arm64; the default/volta node is too old or x64 and will fail.
- **Lint/format:** `pnpm exec biome check <path...>` (lint + format check). Fix with `pnpm exec biome check --write <path...>`.
- **Typecheck:** `pnpm exec tsc --noEmit` (whole project; run once near the end, and after the contact type change).
- **Commit cadence:** one commit per task, on the existing `starter-chip-content` branch. Each task leaves lint + the touched tests green.

A note on the rich prompts: they are plain string constants. **No unit test asserts their content**, so their verification is `biome check` + `tsc` + a grep that old strings are gone and new ones present. A manual smoke test (run `pnpm dev`, click the chip, eyeball the rendered card) is recommended after Task 5 but optional.

---

## Task 1: Reframe the contact field model + all dependent tests

This is the heaviest task — the shared `ContactFormSubmission` type drives validation, email, auto-reply, and ~5 test files. Change the type first, then fix every consumer until lint + the contact tests are green.

**Files:**
- Modify: `lib/contact/web3forms.ts`
- Modify: `lib/contact/auto-reply.ts`
- Test (rewrite): `lib/contact/web3forms.test.ts`
- Test (rewrite): `lib/contact/auto-reply.test.ts`
- Test (edit fixtures/assertions): `app/api/chat/route.contact.test.ts`
- Test (edit fixtures): `app/api/chat/route.logout-session.test.ts`
- Test (edit fixtures + one error path): `components/chat/conversation.test.ts`
- Test (edit fixture): `components/chat/conversation.dispatcher.test.ts`
- **No change:** `components/chat/conversation.tsx` (iterates `CONTACT_REQUIRED_FIELDS` generically — verified), `lib/json-render/registry.test.tsx` (uses `roleType` only as a generic Select field name).

- [ ] **Step 1: Update the contact type, caps, parser, validator, required-fields, and email send in `lib/contact/web3forms.ts`**

Replace the type (lines ~22-28):

```ts
export type ContactFormSubmission = {
  name: string;
  email: string;
  topic: string;
  message: string;
};
```

Rename the long-field cap (line ~44) from `CONTACT_QUESTION_MAX` to `CONTACT_MESSAGE_MAX` (keep `CONTACT_FIELD_MAX = 200`):

```ts
export const CONTACT_FIELD_MAX = 200;
export const CONTACT_MESSAGE_MAX = 2000;
```

Replace `sendContactFormToEmail`'s subject + message lines (lines ~69-78) and drop the optional-question block:

```ts
  const subject = `Portfolio contact: ${submission.topic} (from ${submission.name})`;
  const messageLines = [
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    `Topic: ${submission.topic}`,
    '',
    'Message:',
    submission.message,
  ];
```

Replace `parseContactFormFields` (lines ~129-143):

```ts
export function parseContactFormFields(raw: Record<string, unknown>): ContactFormSubmission | null {
  const name = boundedStrOrNull(raw.name, CONTACT_FIELD_MAX);
  const email = boundedEmailOrNull(raw.email, CONTACT_FIELD_MAX);
  const topic = boundedStrOrNull(raw.topic, CONTACT_FIELD_MAX);
  const message = boundedStrOrNull(raw.message, CONTACT_MESSAGE_MAX);
  if (!name || !email || !topic || !message) return null;
  return { name, email, topic, message };
}
```

Replace `CONTACT_REQUIRED_FIELDS` (line ~244):

```ts
export const CONTACT_REQUIRED_FIELDS = ['name', 'email', 'topic', 'message'] as const;
export type ContactErrorField = (typeof CONTACT_REQUIRED_FIELDS)[number];
```

Replace the `company` and `roleType` blocks inside `validateContactFields` (lines ~273-285) with `topic` and `message` blocks (keep the existing `name` and `email` blocks unchanged):

```ts
  // topic
  const topicRaw = typeof raw.topic === 'string' ? raw.topic.trim() : '';
  if (topicRaw.length === 0) {
    errors.topic = 'Pick a topic';
  } else if (topicRaw.length > CONTACT_FIELD_MAX) {
    errors.topic = 'Topic is too long';
  }

  // message
  const messageRaw = typeof raw.message === 'string' ? raw.message.trim() : '';
  if (messageRaw.length === 0) {
    errors.message = 'Enter a message';
  } else if (messageRaw.length > CONTACT_MESSAGE_MAX) {
    errors.message = 'Message is too long';
  }
```

`detectContactFormSubmit` and `extractContactSubmissionId` need **no change** (they delegate to `parseContactFormFields` / check `formName`).

- [ ] **Step 2: Update the auto-reply summary copy in `lib/contact/auto-reply.ts`**

Replace `buildSummary` (lines ~54-60) and its helper — derive the opener from `topic`, echo the `message`:

```ts
const SUMMARY_OPENERS: Record<string, string> = {
  'Say hello': 'Great to hear from you.',
  'Question about the build': 'Happy to talk about the build.',
  'Work together': 'Glad you want to explore working together.',
};

function buildSummary(submission: ContactFormSubmission): string {
  const opener = SUMMARY_OPENERS[submission.topic.trim()] ?? 'Got your note.';
  const message = submission.message.trim();
  if (!message) return opener;
  return `${opener} You wrote: ${stripTrailingPunctuation(message)}.`;
}
```

Keep `firstNameOf`, `stripTrailingPunctuation`, and `buildAutoReplySpec` (title `Thanks, ${firstName}.` and the commitment line) as-is. The `article` logic is removed.

- [ ] **Step 3: Rewrite `lib/contact/web3forms.test.ts`**

Replace the entire file with:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  CONTACT_FIELD_MAX,
  CONTACT_MESSAGE_MAX,
  type ContactFormSubmission,
  CONTACT_REQUIRED_FIELDS,
  detectContactFormSubmit,
  extractContactSubmissionId,
  parseContactFormFields,
  sendContactFormToEmail,
  validateContactFields,
} from './web3forms';

const VALID: ContactFormSubmission = {
  name: 'Jane Doe',
  email: 'jane@acme.com',
  topic: 'Question about the build',
  message: 'How does the engine decide what to render?',
};

describe('parseContactFormFields', () => {
  it('returns the typed submission when all required fields are present', () => {
    expect(parseContactFormFields({ ...VALID })).toEqual(VALID);
  });

  it('trims whitespace from every field', () => {
    expect(
      parseContactFormFields({
        name: '  Jane Doe  ',
        email: '  jane@acme.com  ',
        topic: ' Question about the build ',
        message: '\tHow does the engine decide what to render?\n',
      }),
    ).toEqual(VALID);
  });

  it('rejects submissions where any required field is missing or blank', () => {
    expect(parseContactFormFields({ email: 'jane@acme.com', topic: 'Say hello', message: 'hi' })).toBeNull();
    expect(parseContactFormFields({ name: 'Jane', topic: 'Say hello', message: 'hi' })).toBeNull();
    expect(parseContactFormFields({ name: 'Jane', email: 'jane@acme.com', message: 'hi' })).toBeNull();
    expect(parseContactFormFields({ name: 'Jane', email: 'jane@acme.com', topic: 'Say hello' })).toBeNull();
    expect(parseContactFormFields({ ...VALID, message: '   ' })).toBeNull();
  });

  it('rejects non-string field values', () => {
    expect(parseContactFormFields({ ...VALID, name: 42 })).toBeNull();
    expect(parseContactFormFields({ ...VALID, message: null })).toBeNull();
  });

  it('rejects a name/email/topic exceeding CONTACT_FIELD_MAX', () => {
    const huge = 'x'.repeat(CONTACT_FIELD_MAX + 1);
    expect(parseContactFormFields({ ...VALID, name: huge })).toBeNull();
    expect(parseContactFormFields({ ...VALID, topic: huge })).toBeNull();
  });

  it('rejects a message exceeding CONTACT_MESSAGE_MAX', () => {
    const huge = 'q'.repeat(CONTACT_MESSAGE_MAX + 1);
    expect(parseContactFormFields({ ...VALID, message: huge })).toBeNull();
  });

  it('accepts a message exactly at CONTACT_MESSAGE_MAX', () => {
    const max = 'q'.repeat(CONTACT_MESSAGE_MAX);
    expect(parseContactFormFields({ ...VALID, message: max })).toMatchObject({ message: max });
  });

  it('accepts a field exactly at CONTACT_FIELD_MAX', () => {
    const max = 'a'.repeat(CONTACT_FIELD_MAX);
    expect(parseContactFormFields({ ...VALID, name: max })).toMatchObject({ name: max });
  });

  it('rejects a submission with no email', () => {
    const { email: _email, ...withoutEmail } = VALID;
    expect(parseContactFormFields(withoutEmail)).toBeNull();
  });

  it('rejects a blank email', () => {
    expect(parseContactFormFields({ ...VALID, email: '   ' })).toBeNull();
  });

  it('rejects a malformed email (no @)', () => {
    expect(parseContactFormFields({ ...VALID, email: 'not-an-email' })).toBeNull();
  });

  it('rejects a malformed email (a@b, no TLD segment)', () => {
    expect(parseContactFormFields({ ...VALID, email: 'a@b' })).toBeNull();
  });

  it('rejects an email with a space before @', () => {
    expect(parseContactFormFields({ ...VALID, email: 'a @b.com' })).toBeNull();
  });

  it('accepts a valid email', () => {
    expect(parseContactFormFields({ ...VALID, email: 'user@example.com' })).toMatchObject({
      email: 'user@example.com',
    });
  });

  it('rejects an email exceeding CONTACT_FIELD_MAX', () => {
    const huge = `${'a'.repeat(CONTACT_FIELD_MAX)}@example.com`;
    expect(parseContactFormFields({ ...VALID, email: huge })).toBeNull();
  });
});

describe('detectContactFormSubmit', () => {
  it('returns null for an undefined message', () => {
    expect(detectContactFormSubmit(undefined)).toBeNull();
  });

  it('returns null for a message with no parts', () => {
    expect(detectContactFormSubmit({})).toBeNull();
  });

  it('returns null for a non-press text message', () => {
    expect(detectContactFormSubmit({ parts: [{ type: 'text', text: 'hi' }] })).toBeNull();
  });

  it('returns null when action is not submitForm', () => {
    expect(
      detectContactFormSubmit({
        parts: [{ type: 'data-press', data: { action: 'sendToModel', formName: 'contact' } }],
      }),
    ).toBeNull();
  });

  it('returns null when formName is not "contact"', () => {
    expect(
      detectContactFormSubmit({
        parts: [
          {
            type: 'data-press',
            data: { action: 'submitForm', formName: 'newsletter', data: { ...VALID } },
          },
        ],
      }),
    ).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(
      detectContactFormSubmit({
        parts: [
          {
            type: 'data-press',
            data: { action: 'submitForm', formName: 'contact', data: { name: 'Jane', topic: '' } },
          },
        ],
      }),
    ).toBeNull();
  });

  it('returns null when message is missing', () => {
    expect(
      detectContactFormSubmit({
        parts: [
          {
            type: 'data-press',
            data: {
              action: 'submitForm',
              formName: 'contact',
              data: { name: 'Jane', email: 'jane@acme.com', topic: 'Say hello' },
            },
          },
        ],
      }),
    ).toBeNull();
  });

  it('returns the typed submission when all required fields are present', () => {
    const result = detectContactFormSubmit({
      parts: [
        {
          type: 'data-press',
          data: { action: 'submitForm', formName: 'contact', data: { ...VALID } },
        },
      ],
    });
    expect(result).toEqual(VALID);
  });
});

describe('extractContactSubmissionId', () => {
  it('returns null when no contact press is present', () => {
    expect(extractContactSubmissionId(undefined)).toBeNull();
    expect(extractContactSubmissionId({})).toBeNull();
    expect(extractContactSubmissionId({ parts: [{ type: 'text', text: 'hi' }] })).toBeNull();
  });

  it('returns the submissionId when stamped on a contact submit', () => {
    expect(
      extractContactSubmissionId({
        parts: [
          {
            type: 'data-press',
            data: {
              action: 'submitForm',
              formName: 'contact',
              submissionId: 'abc-123',
              data: { ...VALID },
            },
          },
        ],
      }),
    ).toBe('abc-123');
  });

  it('returns null when submissionId is missing or empty', () => {
    expect(
      extractContactSubmissionId({
        parts: [
          {
            type: 'data-press',
            data: { action: 'submitForm', formName: 'contact', submissionId: '' },
          },
        ],
      }),
    ).toBeNull();
  });
});

const VALID_FIELDS: Record<string, unknown> = {
  name: 'Jane Doe',
  email: 'jane@acme.com',
  topic: 'Question about the build',
  message: 'How does the engine decide what to render?',
};

describe('validateContactFields', () => {
  it('returns {} when all required fields are valid', () => {
    expect(validateContactFields({ ...VALID_FIELDS })).toEqual({});
  });

  it('returns name error when name is missing', () => {
    const { name: _n, ...rest } = VALID_FIELDS;
    expect(validateContactFields(rest).name).toBe('Enter your name');
  });

  it('returns name error when name is whitespace-only', () => {
    expect(validateContactFields({ ...VALID_FIELDS, name: '   ' }).name).toBe('Enter your name');
  });

  it('returns name error when name exceeds CONTACT_FIELD_MAX', () => {
    expect(validateContactFields({ ...VALID_FIELDS, name: 'a'.repeat(CONTACT_FIELD_MAX + 1) }).name).toBe(
      'Name is too long',
    );
  });

  it('returns email error when email is missing', () => {
    const { email: _e, ...rest } = VALID_FIELDS;
    expect(validateContactFields(rest).email).toBe('Enter your email');
  });

  it('returns email error for malformed email (no @)', () => {
    expect(validateContactFields({ ...VALID_FIELDS, email: 'nope' }).email).toBe('Enter a valid email');
  });

  it('returns email error when email exceeds CONTACT_FIELD_MAX', () => {
    const huge = `${'a'.repeat(CONTACT_FIELD_MAX)}@example.com`;
    expect(validateContactFields({ ...VALID_FIELDS, email: huge }).email).toBe('Enter a valid email');
  });

  it('returns topic error when topic is missing', () => {
    const { topic: _t, ...rest } = VALID_FIELDS;
    expect(validateContactFields(rest).topic).toBe('Pick a topic');
  });

  it('returns message error when message is missing', () => {
    const { message: _m, ...rest } = VALID_FIELDS;
    expect(validateContactFields(rest).message).toBe('Enter a message');
  });

  it('returns message error when message exceeds CONTACT_MESSAGE_MAX', () => {
    expect(
      validateContactFields({ ...VALID_FIELDS, message: 'm'.repeat(CONTACT_MESSAGE_MAX + 1) }).message,
    ).toBe('Message is too long');
  });

  it('CONTACT_REQUIRED_FIELDS contains the expected fields', () => {
    expect(CONTACT_REQUIRED_FIELDS).toContain('name');
    expect(CONTACT_REQUIRED_FIELDS).toContain('email');
    expect(CONTACT_REQUIRED_FIELDS).toContain('topic');
    expect(CONTACT_REQUIRED_FIELDS).toContain('message');
  });

  it('returns errors for multiple invalid fields simultaneously', () => {
    const errors = validateContactFields({ name: '', email: 'bad', topic: 'Say hello', message: 'hi' });
    expect(errors.name).toBe('Enter your name');
    expect(errors.email).toBe('Enter a valid email');
    expect(errors.topic).toBeUndefined();
    expect(errors.message).toBeUndefined();
  });
});

describe('sendContactFormToEmail', () => {
  it('returns missing_access_key when accessKey is an empty string', async () => {
    expect(await sendContactFormToEmail(VALID, { accessKey: '' })).toEqual({
      ok: false,
      reason: 'missing_access_key',
    });
  });

  it('returns missing_access_key when accessKey is whitespace only', async () => {
    expect(await sendContactFormToEmail(VALID, { accessKey: '   ' })).toEqual({
      ok: false,
      reason: 'missing_access_key',
    });
  });

  it('POSTs to Web3Forms with the access key and form contents', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const result = await sendContactFormToEmail(VALID, {
      accessKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.web3forms.com/submit');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.access_key).toBe('test-key');
    expect(body.from_name).toBe(VALID.name);
    expect(body.email).toBe(VALID.email);
    expect(body.replyto).toBe(VALID.email);
    expect(body.subject).toContain(VALID.topic);
    expect(body.subject).toContain(VALID.name);
    expect(body.message).toContain(`Name: ${VALID.name}`);
    expect(body.message).toContain(`Email: ${VALID.email}`);
    expect(body.message).toContain(`Topic: ${VALID.topic}`);
    expect(body.message).toContain(VALID.message);
  });

  it('returns send_failed on a non-ok HTTP response and includes the response body', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('{"success":false,"message":"Invalid Access Key"}', { status: 403 }));
    const result = await sendContactFormToEmail(VALID, {
      accessKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: false, reason: 'send_failed', status: 403 });
    if (result.ok === false) {
      expect(result.body).toContain('Invalid Access Key');
    }
  });

  it('returns network_error and preserves the underlying error message when fetch rejects', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await sendContactFormToEmail(VALID, {
      accessKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, reason: 'network_error', body: 'boom' });
  });
});
```

- [ ] **Step 4: Rewrite `lib/contact/auto-reply.test.ts`**

Replace the entire file with:

```ts
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
    expect(getTitle(buildAutoReplySpec({ ...BASE, name: 'mary-jane smith' }))).toBe('Thanks, Mary-Jane.');
  });

  it("capitalizes after apostrophes (O'Brien)", () => {
    expect(getTitle(buildAutoReplySpec({ ...BASE, name: "o'brien" }))).toBe("Thanks, O'Brien.");
  });

  it('leaves already-cased mid-word capitals alone (MacIntyre)', () => {
    expect(getTitle(buildAutoReplySpec({ ...BASE, name: 'MacIntyre Park' }))).toBe('Thanks, MacIntyre.');
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
    const spec = buildAutoReplySpec({ ...BASE, topic: 'Say hello', message: 'Just wanted to say hi' });
    expect(getText(spec, 'summary')).toBe('Great to hear from you. You wrote: Just wanted to say hi.');
  });

  it('uses the "Work together" opener', () => {
    const spec = buildAutoReplySpec({ ...BASE, topic: 'Work together', message: 'Lets build something' });
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
```

- [ ] **Step 5: Run the two contact unit tests — expect PASS**

Run: `pnpm test lib/contact/web3forms.test.ts lib/contact/auto-reply.test.ts`
Expected: PASS (all). If any fail, the source edits in Steps 1-2 don't match the new assertions — reconcile.

- [ ] **Step 6: Update `app/api/chat/route.contact.test.ts` fixtures + assertions**

In `contactSubmitRequest`, replace the default `fields` (lines ~64-70):

```ts
  const fields = overrides.fields ?? {
    name: 'Jane Doe',
    email: 'jane@acme.com',
    topic: 'Question about the build',
    message: 'How fast can you ship?',
  };
```

In the test "returns a 200 stream containing the deterministic auto-reply card spec", replace the role-line assertion (line ~120):

```ts
    expect(body).toContain('Happy to talk about the build.');
    expect(body).toContain('You wrote: How fast can you ship');
```

Replace the whole "omits the question summary when the question field is absent" test (lines ~143-153) — message is now required, so this case no longer exists; assert a different topic's opener instead:

```ts
  it('uses the topic-specific opener and echoes the message', async () => {
    const res = await POST(
      await contactSubmitRequest({
        fields: { name: 'Sam Lee', email: 'sam@beta.com', topic: 'Say hello', message: 'Big fan of the engine' },
      }),
    );
    const body = await res.text();
    expect(body).toContain('Thanks, Sam.');
    expect(body).toContain('Great to hear from you.');
    expect(body).toContain('You wrote: Big fan of the engine');
  });
```

In the 401 test, replace its inline `data` (line ~213):

```ts
                  data: { name: 'X', email: 'x@y.com', topic: 'Other', message: 'hello' },
```

In the "signed-in users skip the chip chain check" test, replace its inline `data` (line ~245):

```ts
                  data: { name: 'Pat', email: 'pat@co.com', topic: 'Work together', message: 'lets talk' },
```

(The `Thanks, Pat.` assertion stays valid.)

- [ ] **Step 7: Update the remaining fixture-only test files**

Each of these constructs a contact submission with the old `{name, company, roleType, email, question?}` shape. Open each, find the contact fixture(s), and replace with the canonical new shape `{ name, email, topic, message }`. Use `topic: 'Say hello'` and a short `message` unless the test asserts specific copy.

- `app/api/chat/route.logout-session.test.ts` — two fixtures (~lines 143, 194). Replace each `roleType`/`company` object with e.g. `{ name: '...', email: '...', topic: 'Say hello', message: 'hi' }` (keep the existing `name`/`email` values). If either test asserts auto-reply copy, update it to the new opener.
- `components/chat/conversation.dispatcher.test.ts` — one fixture (~line 208): same swap.
- `components/chat/conversation.test.ts` — fixtures at ~lines 45, 70, 114, 148: same swap. **Also** at ~line 173 the assertion reads `store.get('/_errors/contact/roleType')` — change the field segment to a field that still exists, e.g. `store.get('/_errors/contact/topic')` (keep the surrounding `toBeUndefined()` / error-state intent; if the test seeds `roleType` into form state, reseed `topic` instead).

- [ ] **Step 8: Typecheck — expect clean**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (The shared type change surfaces any missed consumer here.)

- [ ] **Step 9: Run all touched contact tests — expect PASS**

Run: `pnpm test lib/contact/web3forms.test.ts lib/contact/auto-reply.test.ts app/api/chat/route.contact.test.ts app/api/chat/route.logout-session.test.ts components/chat/conversation.test.ts components/chat/conversation.dispatcher.test.ts`
Expected: PASS (all).

- [ ] **Step 10: Lint + commit**

Run: `pnpm exec biome check --write lib/contact components/chat/conversation.test.ts components/chat/conversation.dispatcher.test.ts app/api/chat/route.contact.test.ts app/api/chat/route.logout-session.test.ts`

```bash
git add lib/contact app/api/chat/route.contact.test.ts app/api/chat/route.logout-session.test.ts components/chat/conversation.test.ts components/chat/conversation.dispatcher.test.ts
git commit -m "refactor(contact): reframe contact form fields to name/email/topic/message"
```

---

## Task 2: Reframe the rendered contact form (`interactive.ts` rich prompt)

Make the form the model renders match the new field model from Task 1.

**Files:**
- Modify: `lib/chat/rich-prompts/interactive.ts`

- [ ] **Step 1: Replace `INTERACTIVE_RICH_PROMPT` and the file doc comment**

Replace the whole file body with:

```ts
/**
 * Rich prompt for the "Build a form" chip.
 * Produces the "Get in touch." contact form (Name / Email / Topic select /
 * Message textarea / Send button wired to submitForm with formName="contact").
 * The chat route detects the resulting submit and emits a deterministic
 * auto-reply card server-side. Neutral, app-focused contact form (no hiring
 * framing).
 */
export const INTERACTIVE_RICH_PROMPT = [
  'Use the renderUI tool to emit a single Card titled "Get in touch."',
  '(keep the trailing period). The Card contains, in order:',
  '',
  '  1. A muted Text subtitle: "Say hello, ask about the build, or talk shop. Replies within a business day."',
  '',
  '  2. A Form (name="contact") with four fields and one submit Button,',
  '     rendered in this exact order:',
  '       a. Input  name="name"   label="Your name"',
  '                 placeholder="Jane Doe"          kind="text"',
  '       b. Input  name="email"  label="Your email"',
  '                 placeholder="jane@example.com"  kind="email"',
  '       c. Select name="topic"  label="What\'s this about?" with options:',
  '            [{"value":"Say hello","label":"Say hello"},',
  '             {"value":"Question about the build","label":"Question about the build"},',
  '             {"value":"Work together","label":"Work together"},',
  '             {"value":"Other","label":"Other"}]',
  '          The option values match the labels verbatim so the submitted',
  '          form data carries human-readable text downstream.',
  '       d. Textarea name="message"',
  '                  label="Your message"',
  '                  placeholder="e.g. How does the engine decide what to render?"',
  '                  rows=3',
  '       e. Button label="Send" variant="primary" with on.press:',
  '            { "action": "submitForm", "params": { "formName": "contact" } }',
  '          The `on` block goes at the element level (alongside type/props/children),',
  '          NOT inside props.',
  '',
  'Rules, applied strictly:',
  '- Use ONLY Card, Text, Form, Input, Select, Textarea, and Button primitives.',
  '- Card props are { title } only. No footer.',
  '- Form props are { name } only.',
  '- Input props are { name, label, placeholder, kind } only.',
  '- Select props are { name, label, options } only. Use the options array VERBATIM.',
  '- Textarea props are { name, label, placeholder, rows } only.',
  '- Button props are { label, variant } only. Wire the action via the element-level `on.press`.',
  '- No em-dashes or en-dashes anywhere. Use commas, periods, or parens.',
  '- No commentary, subtitles, footers, or text outside the outer Card.',
  '',
  'Spec shape:',
  '{',
  '  "root": "form-card",',
  '  "elements": {',
  '    "form-card": { "type": "Card", "props": { "title": "Get in touch." }, "children": ["subtitle", "form"] },',
  '    "subtitle": { "type": "Text", "props": { "text": "Say hello, ask about the build, or talk shop. Replies within a business day.", "muted": true }, "children": [] },',
  '    "form": { "type": "Form", "props": { "name": "contact" }, "children": ["f-name", "f-email", "f-topic", "f-message", "f-send"] },',
  '    "f-name": { "type": "Input", "props": { "name": "name", "label": "Your name", "placeholder": "Jane Doe", "kind": "text" }, "children": [] },',
  '    "f-email": { "type": "Input", "props": { "name": "email", "label": "Your email", "placeholder": "jane@example.com", "kind": "email" }, "children": [] },',
  '    "f-topic": { "type": "Select", "props": { "name": "topic", "label": "What\'s this about?", "options": [{"value":"Say hello","label":"Say hello"},{"value":"Question about the build","label":"Question about the build"},{"value":"Work together","label":"Work together"},{"value":"Other","label":"Other"}] }, "children": [] },',
  '    "f-message": { "type": "Textarea", "props": { "name": "message", "label": "Your message", "placeholder": "e.g. How does the engine decide what to render?", "rows": 3 }, "children": [] },',
  '    "f-send": { "type": "Button", "props": { "label": "Send", "variant": "primary" }, "on": { "press": { "action": "submitForm", "params": { "formName": "contact" } } }, "children": [] }',
  '  }',
  '}',
].join('\n');
```

- [ ] **Step 2: Verify (lint, typecheck, grep) and commit**

Run: `pnpm exec biome check --write lib/chat/rich-prompts/interactive.ts`
Run: `pnpm exec tsc --noEmit` — expect clean.
Run: `grep -nE 'roleType|company|"name": "contact"|f-topic|f-message' lib/chat/rich-prompts/interactive.ts`
Expected: matches for `"name": "contact"`, `f-topic`, `f-message`; **no** matches for `roleType` or `company`.

```bash
git add lib/chat/rich-prompts/interactive.ts
git commit -m "feat(chip): reframe the contact form chip to a neutral get-in-touch form"
```

---

## Task 3: Rewrite the `dashboard` rich prompt → "Under the hood."

**Files:**
- Modify: `lib/chat/rich-prompts/dashboard.ts`

- [ ] **Step 1: Replace `DASHBOARD_RICH_PROMPT` and the file doc comment**

Replace the whole file body with (reuses the existing 6-cell bento skeleton: 2×2 hero, four 1×1 tiles, 4×1 banner):

```ts
/**
 * Rich prompt for the "Show a dashboard" chip.
 * Produces the "Under the hood." bento: a 2x2 hero (cached-catalog token size
 * plus a pie of the system-prompt budget), four 1x1 tiles (primitive count,
 * model count, a dual-stat caching tile, an open-access tile), and a full-width
 * metering banner. Content is about how this app is built.
 *
 * Numbers are sourced from the codebase: 23 catalog primitives, 4 models,
 * the ~5.4K-token component catalog (kept rounded to survive catalog drift;
 * the catalog-prompt-size test guards it under 6000 tokens). The pie split is
 * illustrative (the cached catalog is the dominant slice of the system prompt).
 */
export const DASHBOARD_RICH_PROMPT = [
  'Use the renderUI tool to emit a single Card titled "Under the hood."',
  '(keep the trailing period in the title).',
  '',
  'The outer Card contains one Grid (columns=4, gap=normal). The Grid contains',
  'six GridCells in this exact order so CSS-grid auto-flow lays them out as a',
  'bento: a 2x2 hero tile in the top-left, four 1x1 small tiles in the top-right',
  'block, and a full-width banner across the bottom row.',
  '',
  '1. Hero. GridCell colSpan=2 rowSpan=2.',
  '   Contains a Card titled "System-prompt budget." with two children:',
  '   a. Heading level=1 text="~5.4K tokens"',
  '   b. Chart kind="pie" showing the cached-catalog share of the system prompt:',
  '      data=[{"label":"Cached catalog","value":78},{"label":"Steering and tools","value":22}],',
  '      series=[{"key":"value"}], xKey="label", legend=false.',
  '',
  '2. Small. GridCell colSpan=1 rowSpan=1.',
  '   KPI value="23" label="Renderable UI primitives in the catalog"',
  '',
  '3. Small. GridCell colSpan=1 rowSpan=1.',
  '   KPI value="4" label="Models you can switch between"',
  '',
  '4. Small. GridCell colSpan=1 rowSpan=1.',
  '   Card with no title, containing two stacked mini-stats (each a Heading',
  '   level 3 above a small muted Text label), in this order:',
  '   a. Heading level=3 text="Position 0"',
  '   b. Text muted=true text="Where the catalog is pinned for cache hits"',
  '   c. Heading level=3 text="1024 tokens"',
  '   d. Text muted=true text="Azure auto-cache threshold"',
  '',
  '5. Small. GridCell colSpan=1 rowSpan=1.',
  '   KPI value="Anon + BYOK" label="Turnstile-gated guests, bring-your-own Azure key"',
  '',
  '6. Banner. GridCell colSpan=4 rowSpan=1.',
  '   KPI value="Daily-cap metered" label="Preflight budget check before each turn, usage ledger after"',
  '',
  'Rules, applied strictly:',
  '- Use ONLY Card, Grid, GridCell, KPI, Heading, Text, and Chart primitives.',
  '- KPI props are { value, label } only. Do not set delta or caption.',
  '- Card props are { title } only (omit title when noted). No footer.',
  '- Heading props are { level, text } only.',
  '- Text props are { text, muted? } only.',
  '- Use the value and label strings VERBATIM, including symbols (~, +) and units (tokens).',
  '- No em-dashes or en-dashes anywhere. Use commas, periods, or parens.',
  '- No commentary, subtitles, footers, or text outside the outer Card.',
  '',
  'Spec shape:',
  '{',
  '  "root": "dashboard",',
  '  "elements": {',
  '    "dashboard": { "type": "Card", "props": { "title": "Under the hood." }, "children": ["grid"] },',
  '    "grid": { "type": "Grid", "props": { "columns": 4, "gap": "normal" }, "children": ["hero", "s1", "s2", "s3", "s4", "banner"] },',
  '    "hero": { "type": "GridCell", "props": { "colSpan": 2, "rowSpan": 2 }, "children": ["hero-card"] },',
  '    "hero-card": { "type": "Card", "props": { "title": "System-prompt budget." }, "children": ["hero-tok", "hero-pie"] },',
  '    "hero-tok": { "type": "Heading", "props": { "level": 1, "text": "~5.4K tokens" }, "children": [] },',
  '    "hero-pie": { "type": "Chart", "props": { "kind": "pie", "data": [{"label": "Cached catalog", "value": 78}, {"label": "Steering and tools", "value": 22}], "series": [{"key": "value"}], "xKey": "label", "legend": false }, "children": [] },',
  '    "s1": { "type": "GridCell", "props": { "colSpan": 1, "rowSpan": 1 }, "children": ["k1"] },',
  '    "k1": { "type": "KPI", "props": { "value": "23", "label": "Renderable UI primitives in the catalog" }, "children": [] },',
  '    "s2": { "type": "GridCell", "props": { "colSpan": 1, "rowSpan": 1 }, "children": ["k2"] },',
  '    "k2": { "type": "KPI", "props": { "value": "4", "label": "Models you can switch between" }, "children": [] },',
  '    "s3": { "type": "GridCell", "props": { "colSpan": 1, "rowSpan": 1 }, "children": ["s3-card"] },',
  '    "s3-card": { "type": "Card", "props": {}, "children": ["s3-v1", "s3-l1", "s3-v2", "s3-l2"] },',
  '    "s3-v1": { "type": "Heading", "props": { "level": 3, "text": "Position 0" }, "children": [] },',
  '    "s3-l1": { "type": "Text", "props": { "text": "Where the catalog is pinned for cache hits", "muted": true }, "children": [] },',
  '    "s3-v2": { "type": "Heading", "props": { "level": 3, "text": "1024 tokens" }, "children": [] },',
  '    "s3-l2": { "type": "Text", "props": { "text": "Azure auto-cache threshold", "muted": true }, "children": [] },',
  '    "s4": { "type": "GridCell", "props": { "colSpan": 1, "rowSpan": 1 }, "children": ["k4"] },',
  '    "k4": { "type": "KPI", "props": { "value": "Anon + BYOK", "label": "Turnstile-gated guests, bring-your-own Azure key" }, "children": [] },',
  '    "banner": { "type": "GridCell", "props": { "colSpan": 4, "rowSpan": 1 }, "children": ["kb"] },',
  '    "kb": { "type": "KPI", "props": { "value": "Daily-cap metered", "label": "Preflight budget check before each turn, usage ledger after" }, "children": [] }',
  '  }',
  '}',
].join('\n');
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm exec biome check --write lib/chat/rich-prompts/dashboard.ts`
Run: `pnpm exec tsc --noEmit` — expect clean.
Run: `grep -nE 'EngX|89%|partner-team|engineer-years' lib/chat/rich-prompts/dashboard.ts` — expect **no** matches.

```bash
git add lib/chat/rich-prompts/dashboard.ts
git commit -m "feat(chip): rewrite dashboard chip as Under the hood app stats"
```

---

## Task 4: Rewrite the `composition` rich prompt → "What makes it tick."

**Files:**
- Modify: `lib/chat/rich-prompts/composition.ts`

- [ ] **Step 1: Replace `COMPOSITION_RICH_PROMPT` and the file doc comment**

Replace the whole file body with:

```ts
/**
 * Rich prompt for the "Compose a card layout" chip.
 * Produces a 2x2 grid of capability cards describing how the app works:
 * generative UI, prompt caching, usage metering, and open access.
 */
export const COMPOSITION_RICH_PROMPT = [
  'Use the renderUI tool to emit a single Card titled "What makes it tick."',
  '(keep the trailing period in the title). The outer Card contains one Grid',
  'with columns=2, gap=normal. The Grid contains four GridCells laying out as',
  'a 2x2 set of capability cards. Each GridCell holds one inner Card with a',
  'title, a Heading for the headline, and a Text element for the body.',
  '',
  'Cards, in this exact order (top-left, top-right, bottom-left, bottom-right).',
  'Each inner Card carries a title. The Card contains, in order: a Heading at',
  'level 2 with the headline, and a Text body.',
  '',
  'Card 1. Title: "Generative UI"',
  '  Heading level=2 text="renderUI tool, 23 primitives"',
  '  Text text="The model returns a JSON spec, not prose. The json-render engine paints it into Cards, Grids, Charts, Forms, and more, then wires the result up so it stays interactive on the client."',
  '',
  'Card 2. Title: "Prompt caching"',
  '  Heading level=2 text="Catalog pinned at position 0"',
  '  Text text="The component catalog, about 5.4K tokens, sits at the very start of the system prompt, so Azure\'s automatic cache reuses it across turns and repeat turns get cheaper."',
  '',
  'Card 3. Title: "Usage metering"',
  '  Heading level=2 text="Preflight check, postflight ledger"',
  '  Text text="Every turn checks a token budget before the model call and writes to a usage ledger after. A live daily-cap gauge shows the headroom that is left and degrades gracefully at the limit."',
  '',
  'Card 4. Title: "Open access"',
  '  Heading level=2 text="Anonymous, claimable, BYOK"',
  '  Text text="Guests get a Turnstile-gated, chip-only mode they can later claim to an account. Signed-in users can plug in their own Azure deployment with a bring-your-own-key override."',
  '',
  'Rules, applied strictly:',
  '- Use ONLY Card, Grid, GridCell, Heading, and Text primitives.',
  '- Card props are { title } only. No footer.',
  '- Heading props are { level, text } only.',
  '- Text props are { text } only. Do not set muted.',
  '- Use the title, heading, and body strings VERBATIM, including the number 23, the "5.4K" shorthand, and parentheses.',
  '- No em-dashes or en-dashes anywhere. Use commas, periods, parens, semicolons, or colons.',
  '- No commentary, subtitles, footers, or text outside the outer Card.',
  '',
  'Spec shape:',
  '{',
  '  "root": "engine",',
  '  "elements": {',
  '    "engine": { "type": "Card", "props": { "title": "What makes it tick." }, "children": ["grid"] },',
  '    "grid": { "type": "Grid", "props": { "columns": 2, "gap": "normal" }, "children": ["c1", "c2", "c3", "c4"] },',
  '    "c1": { "type": "GridCell", "props": { "colSpan": 1, "rowSpan": 1 }, "children": ["c1-card"] },',
  '    "c1-card": { "type": "Card", "props": { "title": "Generative UI" }, "children": ["c1-num", "c1-body"] },',
  '    "c1-num": { "type": "Heading", "props": { "level": 2, "text": "renderUI tool, 23 primitives" }, "children": [] },',
  '    "c1-body": { "type": "Text", "props": { "text": "The model returns a JSON spec, not prose. The json-render engine paints it into Cards, Grids, Charts, Forms, and more, then wires the result up so it stays interactive on the client." }, "children": [] },',
  '    "c2": { "type": "GridCell", "props": { "colSpan": 1, "rowSpan": 1 }, "children": ["c2-card"] },',
  '    "c2-card": { "type": "Card", "props": { "title": "Prompt caching" }, "children": ["c2-num", "c2-body"] },',
  '    "c2-num": { "type": "Heading", "props": { "level": 2, "text": "Catalog pinned at position 0" }, "children": [] },',
  '    "c2-body": { "type": "Text", "props": { "text": "The component catalog, about 5.4K tokens, sits at the very start of the system prompt, so Azure\'s automatic cache reuses it across turns and repeat turns get cheaper." }, "children": [] },',
  '    "c3": { "type": "GridCell", "props": { "colSpan": 1, "rowSpan": 1 }, "children": ["c3-card"] },',
  '    "c3-card": { "type": "Card", "props": { "title": "Usage metering" }, "children": ["c3-num", "c3-body"] },',
  '    "c3-num": { "type": "Heading", "props": { "level": 2, "text": "Preflight check, postflight ledger" }, "children": [] },',
  '    "c3-body": { "type": "Text", "props": { "text": "Every turn checks a token budget before the model call and writes to a usage ledger after. A live daily-cap gauge shows the headroom that is left and degrades gracefully at the limit." }, "children": [] },',
  '    "c4": { "type": "GridCell", "props": { "colSpan": 1, "rowSpan": 1 }, "children": ["c4-card"] },',
  '    "c4-card": { "type": "Card", "props": { "title": "Open access" }, "children": ["c4-num", "c4-body"] },',
  '    "c4-num": { "type": "Heading", "props": { "level": 2, "text": "Anonymous, claimable, BYOK" }, "children": [] },',
  '    "c4-body": { "type": "Text", "props": { "text": "Guests get a Turnstile-gated, chip-only mode they can later claim to an account. Signed-in users can plug in their own Azure deployment with a bring-your-own-key override." }, "children": [] }',
  '  }',
  '}',
].join('\n');
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm exec biome check --write lib/chat/rich-prompts/composition.ts`
Run: `pnpm exec tsc --noEmit` — expect clean.
Run: `grep -nE 'proof point|EngX|Tech-Map|627K|Crews' lib/chat/rich-prompts/composition.ts` — expect **no** matches.

```bash
git add lib/chat/rich-prompts/composition.ts
git commit -m "feat(chip): rewrite composition chip as four engine capabilities"
```

---

## Task 5: Rewrite the `charts` rich prompt → "Caching pays off."

**Files:**
- Modify: `lib/chat/rich-prompts/charts.ts`

- [ ] **Step 1: Replace `CHARTS_RICH_PROMPT` and the file doc comment**

Replace the whole file body with:

```ts
/**
 * Rich prompt for the "Plot some data in a graph" chip.
 * Produces a dual-line chart of relative system-prompt cost per turn,
 * comparing an uncached run (full prompt re-sent every turn) against a cached
 * run (catalog served from Azure's auto-cache after turn 1). The cost index is
 * illustrative of the caching mechanism, not live telemetry.
 */
export const CHARTS_RICH_PROMPT = [
  'Use the renderUI tool to emit a single Card titled "Caching pays off."',
  '(keep the trailing period in the title). The Card contains, in order:',
  '  1. A muted Text subtitle: "Relative system-prompt cost per turn (turn 1 = 100). Illustrative."',
  '  2. A line Chart with two series (specified below).',
  '',
  'The Chart props are:',
  '- kind="line"',
  '- xKey="turn"',
  '- legend=true',
  '- data: the 8-row series given verbatim in the spec shape below.',
  '- series: [',
  '    { key: "uncached", label: "No cache", endpointLabel: "Full prompt re-sent each turn" },',
  '    { key: "cached", label: "Cached catalog", endpointLabel: "Catalog served from cache" }',
  '  ]',
  '',
  'Rules, applied strictly:',
  '- Use ONLY Card, Text, and Chart primitives.',
  '- Card props are { title } only. No footer.',
  '- Text props are { text, muted }.',
  '- Use the data array and series array VERBATIM as shown in the spec shape. Do not invent additional turns or change any value.',
  '- No em-dashes or en-dashes anywhere. Use commas, periods, or parens.',
  '- No commentary, subtitles, footers, or text outside the outer Card. The renderUI call is the entire response.',
  '',
  'Spec shape:',
  '{',
  '  "root": "chart-card",',
  '  "elements": {',
  '    "chart-card": { "type": "Card", "props": { "title": "Caching pays off." }, "children": ["subtitle", "chart"] },',
  '    "subtitle": { "type": "Text", "props": { "text": "Relative system-prompt cost per turn (turn 1 = 100). Illustrative.", "muted": true }, "children": [] },',
  '    "chart": { "type": "Chart", "props": {',
  '      "kind": "line",',
  '      "xKey": "turn",',
  '      "legend": true,',
  '      "data": [',
  '        {"turn":1,"uncached":100,"cached":100},',
  '        {"turn":2,"uncached":100,"cached":35},',
  '        {"turn":3,"uncached":100,"cached":33},',
  '        {"turn":4,"uncached":100,"cached":32},',
  '        {"turn":5,"uncached":100,"cached":31},',
  '        {"turn":6,"uncached":100,"cached":31},',
  '        {"turn":7,"uncached":100,"cached":30},',
  '        {"turn":8,"uncached":100,"cached":30}',
  '      ],',
  '      "series": [',
  '        {"key":"uncached","label":"No cache","endpointLabel":"Full prompt re-sent each turn"},',
  '        {"key":"cached","label":"Cached catalog","endpointLabel":"Catalog served from cache"}',
  '      ]',
  '    }, "children": [] }',
  '  }',
  '}',
].join('\n');
```

- [ ] **Step 2: Verify and commit**

Run: `pnpm exec biome check --write lib/chat/rich-prompts/charts.ts`
Run: `pnpm exec tsc --noEmit` — expect clean.
Run: `grep -nE 'legacy|contributors|partner-team|2022-05' lib/chat/rich-prompts/charts.ts` — expect **no** matches.

```bash
git add lib/chat/rich-prompts/charts.ts
git commit -m "feat(chip): rewrite charts chip as cached vs uncached cost per turn"
```

---

## Task 6: Update chip blurbs + the narrative-arc comment

**Files:**
- Modify: `components/chat/chip-deck.tsx`
- Modify: `lib/chat/chips.ts`

- [ ] **Step 1: Replace `CHIP_BLURBS` in `components/chat/chip-deck.tsx` (lines ~20-25)**

```ts
const CHIP_BLURBS: Record<ChipId, string> = {
  dashboard: 'How this app is built, at a glance.',
  composition: 'The four pieces that power the engine.',
  charts: 'Cost per turn, cached vs uncached.',
  interactive: 'Say hello or ask about the build.',
};
```

- [ ] **Step 2: Update the narrative-arc comment in `lib/chat/chips.ts` (lines ~18-21)**

```ts
// Order encodes the narrative arc: how it is built (dashboard) -> what powers
// it (composition) -> why caching makes it cheap (charts) -> get in touch
// (interactive). The chip deck renders in this order. IDs stay stable so
// isChipId, route metadata, and any downstream chip-keyed maps keep working.
```

- [ ] **Step 3: Check for a chip-deck test or story that asserts the old blurbs**

Run: `grep -rn "EngX platform impact\|Career proof points\|Partner-team contributor\|Send Josh a note" components app lib`
- If a `.test.tsx` or `.stories.tsx` asserts an old blurb string, update it to the matching new blurb above.
- If there are no matches, no further change is needed.

- [ ] **Step 4: Verify and commit**

Run: `pnpm exec biome check --write components/chat/chip-deck.tsx lib/chat/chips.ts`
Run: `pnpm exec tsc --noEmit` — expect clean.
If a chip-deck test exists: `pnpm test components/chat/chip-deck.test.tsx` (use the real path) — expect PASS.

```bash
git add components/chat/chip-deck.tsx lib/chat/chips.ts
git commit -m "feat(chip): update chip blurbs and narrative comment for app-focused content"
```

---

## Task 7: Stale-reference sweep + targeted test run

**Files:**
- Possibly modify: any Storybook story, fixture, or doc still referencing old content.

- [ ] **Step 1: Sweep for residual career-content strings**

Run:
```bash
grep -rn -e "EngX" -e "Tell Josh" -e "hiring for" -e "roleType" -e "proof point" -e "partner-team" -e "Career proof" -e "Send Josh a note" \
  app components lib --include="*.ts" --include="*.tsx" \
  | grep -v -e "lib/json-render/registry.test.tsx"
```
- `lib/json-render/registry.test.tsx` is expected to still contain `roleType` (generic Select example) — that's fine, hence the exclusion.
- For any **other** match, decide: update to the new content if it's user-facing/asserted, or leave if it's an unrelated coincidence. There should be no remaining matches for `EngX`, `Tell Josh`, `hiring for`, `proof point`, `partner-team`, `Career proof`, or `Send Josh a note`.

- [ ] **Step 2: Run the full set of touched-area tests — expect PASS**

Run:
```bash
pnpm test lib/contact components/chat/conversation.test.ts components/chat/conversation.dispatcher.test.ts app/api/chat/route.contact.test.ts app/api/chat/route.logout-session.test.ts
```
Expected: PASS (all). (Add the chip-deck test path from Task 6 Step 3 if one exists.)

- [ ] **Step 3: Final lint + typecheck**

Run: `pnpm exec biome check lib/chat lib/contact components/chat/chip-deck.tsx app/api/chat`
Run: `pnpm exec tsc --noEmit`
Expected: both clean.

- [ ] **Step 4: Commit any sweep fixes**

```bash
git add -A
git commit -m "chore(chip): sweep residual career-content references"
```
(If Step 1 found nothing and no files changed, skip the commit.)

- [ ] **Step 5: Manual smoke test (recommended, optional)**

Run `pnpm dev`, open the app, and click each chip in turn. Confirm:
- **Show a dashboard** → "Under the hood." bento with the 23 / 4 / ~5.4K stats and the donut.
- **Compose a card layout** → "What makes it tick." four capability cards.
- **Plot some data in a graph** → "Caching pays off." dual-line chart.
- **Build a form** → "Get in touch." form (Name / Email / Topic / Message); submit and confirm the "Thanks, …" auto-reply card renders with the topic-specific opener.

---

## Self-Review

**Spec coverage:** Every spec section maps to a task — chip 1 dashboard → Task 3; chip 2 composition → Task 4; chip 3 charts → Task 5; chip 4 form (rendered) → Task 2; the contact vertical (type/validate/email/auto-reply + tests) → Task 1; blurbs + narrative comment → Task 6; honesty/sourcing (23, 4, ~5.4K confirmed; pie + cost-index labeled illustrative) → baked into Tasks 3 & 5; out-of-scope items (no new chips, no layout changes, no live telemetry) respected; the "message required" decision is implemented in Task 1 (parser requires `message`, validator errors on blank).

**Placeholder scan:** Full replacement code is given for every source file and the two unit-test files; exact edits with line anchors for `route.contact.test.ts`; the three remaining fixture-only test files use a precise canonical swap + a verifying test run (the change is mechanical and type-checked). Verification commands have explicit expected outcomes.

**Type consistency:** `ContactFormSubmission = {name,email,topic,message}` is used identically across `web3forms.ts`, `auto-reply.ts`, both unit tests, and all fixtures. `CONTACT_MESSAGE_MAX` replaces `CONTACT_QUESTION_MAX` everywhere it's imported (web3forms.ts + web3forms.test.ts). `CONTACT_REQUIRED_FIELDS` / `ContactErrorField` updated in lockstep. Rich-prompt element IDs are self-consistent within each spec-shape JSON.
