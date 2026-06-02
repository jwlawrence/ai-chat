import { describe, expect, it, vi } from 'vitest';
import {
  CONTACT_FIELD_MAX,
  CONTACT_QUESTION_MAX,
  type ContactFormSubmission,
  detectContactFormSubmit,
  extractContactSubmissionId,
  parseContactFormFields,
  sendContactFormToEmail,
} from './web3forms';

const VALID: ContactFormSubmission = {
  name: 'Jane Doe',
  company: 'Acme',
  roleType: 'Engineering Manager',
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
      }),
    ).toEqual({ name: 'Jane Doe', company: 'Acme', roleType: 'Engineering Manager' });
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
    expect(body.email).toMatch(/.+@.+\..+/);
    expect(body.subject).toContain(VALID.company);
    expect(body.subject).toContain(VALID.roleType);
    expect(body.message).toContain(`Name: ${VALID.name}`);
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
