import { describe, expect, it, vi } from 'vitest';
import {
  CONTACT_FIELD_MAX,
  CONTACT_QUESTION_MAX,
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
  company: 'Acme',
  roleType: 'Engineering Manager',
  email: 'jane@acme.com',
};

describe('parseContactFormFields', () => {
  it('returns the typed submission when name/company/roleType are present', () => {
    expect(parseContactFormFields({ ...VALID })).toEqual(VALID);
  });

  it('trims whitespace from every field', () => {
    expect(
      parseContactFormFields({
        name: '  Jane Doe  ',
        company: '\tAcme\n',
        roleType: ' Engineering Manager ',
        email: '  jane@acme.com  ',
      }),
    ).toEqual({
      name: 'Jane Doe',
      company: 'Acme',
      roleType: 'Engineering Manager',
      email: 'jane@acme.com',
    });
  });

  it('includes the optional question when present, omits when blank', () => {
    expect(parseContactFormFields({ ...VALID, question: 'How fast can you ship?' })).toMatchObject({
      question: 'How fast can you ship?',
    });
    expect(parseContactFormFields({ ...VALID, question: '   ' })).not.toHaveProperty('question');
    expect(parseContactFormFields({ ...VALID, question: undefined })).not.toHaveProperty(
      'question',
    );
  });

  it('rejects submissions where any required field is missing or blank', () => {
    expect(parseContactFormFields({ company: 'Acme', roleType: 'EM' })).toBeNull();
    expect(parseContactFormFields({ name: 'Jane', roleType: 'EM' })).toBeNull();
    expect(parseContactFormFields({ name: 'Jane', company: 'Acme' })).toBeNull();
    expect(parseContactFormFields({ ...VALID, name: '   ' })).toBeNull();
  });

  it('rejects non-string field values', () => {
    expect(parseContactFormFields({ name: 42, company: 'Acme', roleType: 'EM' })).toBeNull();
    expect(parseContactFormFields({ ...VALID, name: null })).toBeNull();
  });

  it('rejects a name/company/roleType exceeding CONTACT_FIELD_MAX', () => {
    const huge = 'x'.repeat(CONTACT_FIELD_MAX + 1);
    expect(parseContactFormFields({ ...VALID, name: huge })).toBeNull();
    expect(parseContactFormFields({ ...VALID, company: huge })).toBeNull();
    expect(parseContactFormFields({ ...VALID, roleType: huge })).toBeNull();
  });

  it('accepts a field exactly at CONTACT_FIELD_MAX', () => {
    const max = 'a'.repeat(CONTACT_FIELD_MAX);
    expect(parseContactFormFields({ ...VALID, name: max })).toMatchObject({ name: max });
  });

  it('drops a question exceeding CONTACT_QUESTION_MAX (keeps required fields)', () => {
    const huge = 'q'.repeat(CONTACT_QUESTION_MAX + 1);
    const result = parseContactFormFields({ ...VALID, question: huge });
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('question');
  });

  it('accepts a question exactly at CONTACT_QUESTION_MAX', () => {
    const max = 'q'.repeat(CONTACT_QUESTION_MAX);
    expect(parseContactFormFields({ ...VALID, question: max })).toMatchObject({ question: max });
  });

  it('rejects a submission with no email', () => {
    const { email: _email, ...withoutEmail } = VALID;
    expect(parseContactFormFields(withoutEmail)).toBeNull();
  });

  it('rejects a submission with a blank email', () => {
    expect(parseContactFormFields({ ...VALID, email: '   ' })).toBeNull();
  });

  it('rejects a malformed email (no @)', () => {
    expect(parseContactFormFields({ ...VALID, email: 'not-an-email' })).toBeNull();
  });

  it('rejects a malformed email (a@b — no TLD segment)', () => {
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

  it('trims the email before validation', () => {
    expect(parseContactFormFields({ ...VALID, email: '  jane@acme.com  ' })).toMatchObject({
      email: 'jane@acme.com',
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
            data: {
              action: 'submitForm',
              formName: 'contact',
              data: { name: 'Jane', company: '' },
            },
          },
        ],
      }),
    ).toBeNull();
  });

  it('returns null when roleType is missing', () => {
    expect(
      detectContactFormSubmit({
        parts: [
          {
            type: 'data-press',
            data: {
              action: 'submitForm',
              formName: 'contact',
              data: { name: 'Jane', company: 'Acme' },
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

  it('includes the optional question field when provided', () => {
    const result = detectContactFormSubmit({
      parts: [
        {
          type: 'data-press',
          data: {
            action: 'submitForm',
            formName: 'contact',
            data: { ...VALID, question: 'Does platform work translate to consumer?' },
          },
        },
      ],
    });
    expect(result).toEqual({
      ...VALID,
      question: 'Does platform work translate to consumer?',
    });
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
              data: { name: 'x', company: 'y', roleType: 'z' },
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

// ---------------------------------------------------------------------------
// validateContactFields — field-level error messages (Part A)
// ---------------------------------------------------------------------------

const VALID_FIELDS: Record<string, unknown> = {
  name: 'Jane Doe',
  email: 'jane@acme.com',
  company: 'Acme',
  roleType: 'Engineering Manager',
};

describe('validateContactFields', () => {
  it('returns {} when all required fields are valid', () => {
    expect(validateContactFields({ ...VALID_FIELDS })).toEqual({});
  });

  it('returns name error when name is missing', () => {
    const { name: _n, ...rest } = VALID_FIELDS;
    const errors = validateContactFields(rest);
    expect(errors.name).toBe('Enter your name');
  });

  it('returns name error when name is whitespace-only', () => {
    const errors = validateContactFields({ ...VALID_FIELDS, name: '   ' });
    expect(errors.name).toBe('Enter your name');
  });

  it('returns name error when name exceeds CONTACT_FIELD_MAX', () => {
    const errors = validateContactFields({ ...VALID_FIELDS, name: 'a'.repeat(CONTACT_FIELD_MAX + 1) });
    expect(errors.name).toBe('Name is too long');
  });

  it('returns email error when email is missing', () => {
    const { email: _e, ...rest } = VALID_FIELDS;
    const errors = validateContactFields(rest);
    expect(errors.email).toBe('Enter your email');
  });

  it('returns email error for malformed email (no @)', () => {
    const errors = validateContactFields({ ...VALID_FIELDS, email: 'nope' });
    expect(errors.email).toBe('Enter a valid email');
  });

  it('returns email error for malformed email (a@b — no TLD)', () => {
    const errors = validateContactFields({ ...VALID_FIELDS, email: 'a@b' });
    expect(errors.email).toBe('Enter a valid email');
  });

  it('returns email error for email with space before @', () => {
    const errors = validateContactFields({ ...VALID_FIELDS, email: 'a b@c.com' });
    expect(errors.email).toBe('Enter a valid email');
  });

  it('returns email error when email exceeds CONTACT_FIELD_MAX', () => {
    const huge = `${'a'.repeat(CONTACT_FIELD_MAX)}@example.com`;
    const errors = validateContactFields({ ...VALID_FIELDS, email: huge });
    expect(errors.email).toBe('Enter a valid email');
  });

  it('returns company error when company is missing', () => {
    const { company: _c, ...rest } = VALID_FIELDS;
    const errors = validateContactFields(rest);
    expect(errors.company).toBe('Enter your company');
  });

  it('returns company error when company exceeds CONTACT_FIELD_MAX', () => {
    const errors = validateContactFields({ ...VALID_FIELDS, company: 'x'.repeat(CONTACT_FIELD_MAX + 1) });
    expect(errors.company).toBe('Company is too long');
  });

  it('returns roleType error when roleType is missing', () => {
    const { roleType: _r, ...rest } = VALID_FIELDS;
    const errors = validateContactFields(rest);
    expect(errors.roleType).toBe('Select a role');
  });

  it('does not validate question (it is optional)', () => {
    const errors = validateContactFields({ ...VALID_FIELDS, question: '' });
    expect(errors).toEqual({});
  });

  it('CONTACT_REQUIRED_FIELDS contains the expected fields', () => {
    expect(CONTACT_REQUIRED_FIELDS).toContain('name');
    expect(CONTACT_REQUIRED_FIELDS).toContain('email');
    expect(CONTACT_REQUIRED_FIELDS).toContain('company');
    expect(CONTACT_REQUIRED_FIELDS).toContain('roleType');
  });

  it('returns errors for multiple invalid fields simultaneously', () => {
    const errors = validateContactFields({ name: '', email: 'bad', company: 'Acme', roleType: 'EM' });
    expect(errors.name).toBe('Enter your name');
    expect(errors.email).toBe('Enter a valid email');
    expect(errors.company).toBeUndefined();
    expect(errors.roleType).toBeUndefined();
  });
});

describe('sendContactFormToEmail', () => {
  it('returns missing_access_key when accessKey is an empty string', async () => {
    const result = await sendContactFormToEmail(VALID, { accessKey: '' });
    expect(result).toEqual({ ok: false, reason: 'missing_access_key' });
  });

  it('returns missing_access_key when accessKey is whitespace only', async () => {
    const result = await sendContactFormToEmail(VALID, { accessKey: '   ' });
    expect(result).toEqual({ ok: false, reason: 'missing_access_key' });
  });

  it('POSTs to Web3Forms with the access key and form contents', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const result = await sendContactFormToEmail(
      { ...VALID, question: 'q?' },
      { accessKey: 'test-key', fetchImpl: fetchImpl as unknown as typeof fetch },
    );
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
    expect(body.subject).toContain(VALID.company);
    expect(body.subject).toContain(VALID.roleType);
    expect(body.message).toContain(`Name: ${VALID.name}`);
    expect(body.message).toContain(`Email: ${VALID.email}`);
    expect(body.message).toContain(`Company: ${VALID.company}`);
    expect(body.message).toContain(`Role type: ${VALID.roleType}`);
    expect(body.message).toContain('q?');
  });

  it('omits the question section when none is provided', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await sendContactFormToEmail(VALID, {
      accessKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const body = JSON.parse((fetchImpl.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.message).not.toContain('Question:');
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
