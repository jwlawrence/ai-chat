import { describe, expect, it, vi } from 'vitest';
import {
  CONTACT_FIELD_MAX,
  CONTACT_MESSAGE_MAX,
  CONTACT_REQUIRED_FIELDS,
  type ContactFormSubmission,
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
    expect(
      parseContactFormFields({ email: 'jane@acme.com', topic: 'Say hello', message: 'hi' }),
    ).toBeNull();
    expect(parseContactFormFields({ name: 'Jane', topic: 'Say hello', message: 'hi' })).toBeNull();
    expect(
      parseContactFormFields({ name: 'Jane', email: 'jane@acme.com', message: 'hi' }),
    ).toBeNull();
    expect(
      parseContactFormFields({ name: 'Jane', email: 'jane@acme.com', topic: 'Say hello' }),
    ).toBeNull();
    expect(parseContactFormFields({ ...VALID, message: '   ' })).toBeNull();
  });

  it('rejects non-string field values', () => {
    expect(parseContactFormFields({ ...VALID, name: 42 })).toBeNull();
    expect(parseContactFormFields({ ...VALID, message: null })).toBeNull();
  });

  it('rejects a name/topic exceeding CONTACT_FIELD_MAX', () => {
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

  it('rejects an unknown topic not in the allowlist', () => {
    expect(parseContactFormFields({ ...VALID, topic: 'Hire me' })).toBeNull();
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
    expect(
      validateContactFields({ ...VALID_FIELDS, name: 'a'.repeat(CONTACT_FIELD_MAX + 1) }).name,
    ).toBe('Name is too long');
  });

  it('returns email error when email is missing', () => {
    const { email: _e, ...rest } = VALID_FIELDS;
    expect(validateContactFields(rest).email).toBe('Enter your email');
  });

  it('returns email error for malformed email (no @)', () => {
    expect(validateContactFields({ ...VALID_FIELDS, email: 'nope' }).email).toBe(
      'Enter a valid email',
    );
  });

  it('returns email error for malformed email (a@b, no TLD)', () => {
    expect(validateContactFields({ ...VALID_FIELDS, email: 'a@b' }).email).toBe(
      'Enter a valid email',
    );
  });

  it('returns email error for an email with a space before @', () => {
    expect(validateContactFields({ ...VALID_FIELDS, email: 'a b@c.com' }).email).toBe(
      'Enter a valid email',
    );
  });

  it('returns email error when email exceeds CONTACT_FIELD_MAX', () => {
    const huge = `${'a'.repeat(CONTACT_FIELD_MAX)}@example.com`;
    expect(validateContactFields({ ...VALID_FIELDS, email: huge }).email).toBe(
      'Enter a valid email',
    );
  });

  it('returns topic error when topic is missing', () => {
    const { topic: _t, ...rest } = VALID_FIELDS;
    expect(validateContactFields(rest).topic).toBe('Pick a topic');
  });

  it('returns topic error for an unknown topic', () => {
    expect(validateContactFields({ ...VALID_FIELDS, topic: 'Hire me' }).topic).toBe('Pick a topic');
  });

  it('returns topic error when topic is whitespace-only', () => {
    expect(validateContactFields({ ...VALID_FIELDS, topic: '   ' }).topic).toBe('Pick a topic');
  });

  it('returns message error when message is missing', () => {
    const { message: _m, ...rest } = VALID_FIELDS;
    expect(validateContactFields(rest).message).toBe('Enter a message');
  });

  it('returns message error when message exceeds CONTACT_MESSAGE_MAX', () => {
    expect(
      validateContactFields({ ...VALID_FIELDS, message: 'm'.repeat(CONTACT_MESSAGE_MAX + 1) })
        .message,
    ).toBe('Message is too long');
  });

  it('returns message error when message is whitespace-only', () => {
    expect(validateContactFields({ ...VALID_FIELDS, message: '   ' }).message).toBe(
      'Enter a message',
    );
  });

  it('CONTACT_REQUIRED_FIELDS contains the expected fields', () => {
    expect(CONTACT_REQUIRED_FIELDS).toContain('name');
    expect(CONTACT_REQUIRED_FIELDS).toContain('email');
    expect(CONTACT_REQUIRED_FIELDS).toContain('topic');
    expect(CONTACT_REQUIRED_FIELDS).toContain('message');
  });

  it('returns errors for multiple invalid fields simultaneously', () => {
    const errors = validateContactFields({
      name: '',
      email: 'bad',
      topic: 'Say hello',
      message: 'hi',
    });
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
    expect(body.botcheck).toBe('');
  });

  it('returns send_failed on a non-ok HTTP response and includes the response body', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response('{"success":false,"message":"Invalid Access Key"}', { status: 403 }),
      );
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
