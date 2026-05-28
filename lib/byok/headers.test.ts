import { describe, expect, it } from 'vitest';
import { BYOK_HEADERS, headersToOverride, recordToHeaders } from './headers';
import type { ByokRecord } from './storage';

const FULL_RECORD: ByokRecord = {
  key: 'sk-test-key',
  baseUrl: 'https://my.azure.com/openai',
  deployments: { 'gpt-5.4': 'my-gpt54-deployment' },
  apiVersion: '2025-04-01-preview',
};

const RECORD_NO_VERSION: ByokRecord = {
  key: 'sk-test-key',
  baseUrl: 'https://my.azure.com/openai',
  deployments: { 'gpt-5.4': 'my-gpt54-deployment' },
};

function makeHeaders(entries: Record<string, string>): Headers {
  return new Headers(Object.entries(entries));
}

describe('recordToHeaders', () => {
  it('full record → all 4 headers', () => {
    const h = recordToHeaders(FULL_RECORD);
    expect(h[BYOK_HEADERS.key]).toBe('sk-test-key');
    expect(h[BYOK_HEADERS.baseUrl]).toBe('https://my.azure.com/openai');
    expect(h[BYOK_HEADERS.deployments]).toBe(JSON.stringify({ 'gpt-5.4': 'my-gpt54-deployment' }));
    expect(h[BYOK_HEADERS.apiVersion]).toBe('2025-04-01-preview');
  });

  it('record without apiVersion → no apiVersion header', () => {
    const h = recordToHeaders(RECORD_NO_VERSION);
    expect(h[BYOK_HEADERS.key]).toBe('sk-test-key');
    expect(h[BYOK_HEADERS.apiVersion]).toBeUndefined();
  });
});

describe('headersToOverride', () => {
  it('all 4 headers valid → ProviderOverride with matching values', () => {
    const h = makeHeaders({
      [BYOK_HEADERS.key]: 'sk-test-key',
      [BYOK_HEADERS.baseUrl]: 'https://my.azure.com/openai',
      [BYOK_HEADERS.deployments]: JSON.stringify({ 'gpt-5.4': 'my-gpt54' }),
      [BYOK_HEADERS.apiVersion]: '2025-04-01-preview',
    });
    const result = headersToOverride(h);
    expect(result).toEqual({
      apiKey: 'sk-test-key',
      baseUrl: 'https://my.azure.com/openai',
      deployments: { 'gpt-5.4': 'my-gpt54' },
      apiVersion: '2025-04-01-preview',
    });
  });

  it('no apiVersion header → override with no apiVersion key', () => {
    const h = makeHeaders({
      [BYOK_HEADERS.key]: 'sk-test-key',
      [BYOK_HEADERS.baseUrl]: 'https://my.azure.com/openai',
      [BYOK_HEADERS.deployments]: JSON.stringify({ 'gpt-5.4': 'my-gpt54' }),
    });
    const result = headersToOverride(h);
    expect(result).toBeDefined();
    expect(result).not.toHaveProperty('apiVersion');
  });

  it('missing key → undefined', () => {
    const h = makeHeaders({
      [BYOK_HEADERS.baseUrl]: 'https://my.azure.com/openai',
      [BYOK_HEADERS.deployments]: JSON.stringify({ 'gpt-5.4': 'my-gpt54' }),
    });
    expect(headersToOverride(h)).toBeUndefined();
  });

  it('missing baseUrl → undefined', () => {
    const h = makeHeaders({
      [BYOK_HEADERS.key]: 'sk-test-key',
      [BYOK_HEADERS.deployments]: JSON.stringify({ 'gpt-5.4': 'my-gpt54' }),
    });
    expect(headersToOverride(h)).toBeUndefined();
  });

  it('missing deployments → undefined', () => {
    const h = makeHeaders({
      [BYOK_HEADERS.key]: 'sk-test-key',
      [BYOK_HEADERS.baseUrl]: 'https://my.azure.com/openai',
    });
    expect(headersToOverride(h)).toBeUndefined();
  });

  it('oversized key (513 chars) → undefined', () => {
    const h = makeHeaders({
      [BYOK_HEADERS.key]: 'k'.repeat(513),
      [BYOK_HEADERS.baseUrl]: 'https://my.azure.com/openai',
      [BYOK_HEADERS.deployments]: JSON.stringify({ 'gpt-5.4': 'my-gpt54' }),
    });
    expect(headersToOverride(h)).toBeUndefined();
  });

  it('non-https baseUrl → undefined', () => {
    const h = makeHeaders({
      [BYOK_HEADERS.key]: 'sk-test-key',
      [BYOK_HEADERS.baseUrl]: 'http://x.example.com',
      [BYOK_HEADERS.deployments]: JSON.stringify({ 'gpt-5.4': 'my-gpt54' }),
    });
    expect(headersToOverride(h)).toBeUndefined();
  });

  it('malformed baseUrl → undefined', () => {
    const h = makeHeaders({
      [BYOK_HEADERS.key]: 'sk-test-key',
      [BYOK_HEADERS.baseUrl]: 'not a url',
      [BYOK_HEADERS.deployments]: JSON.stringify({ 'gpt-5.4': 'my-gpt54' }),
    });
    expect(headersToOverride(h)).toBeUndefined();
  });

  it('malformed deployments JSON → undefined', () => {
    const h = makeHeaders({
      [BYOK_HEADERS.key]: 'sk-test-key',
      [BYOK_HEADERS.baseUrl]: 'https://my.azure.com/openai',
      [BYOK_HEADERS.deployments]: '{not valid json',
    });
    expect(headersToOverride(h)).toBeUndefined();
  });

  it('deployments schema failure (value not a string) → undefined', () => {
    const h = makeHeaders({
      [BYOK_HEADERS.key]: 'sk-test-key',
      [BYOK_HEADERS.baseUrl]: 'https://my.azure.com/openai',
      [BYOK_HEADERS.deployments]: JSON.stringify({ 'gpt-5.4': {} }),
    });
    expect(headersToOverride(h)).toBeUndefined();
  });

  it('whitespace-only key → undefined', () => {
    const h = makeHeaders({
      [BYOK_HEADERS.key]: '   ',
      [BYOK_HEADERS.baseUrl]: 'https://my.azure.com/openai',
      [BYOK_HEADERS.deployments]: JSON.stringify({ 'gpt-5.4': 'my-gpt54' }),
    });
    expect(headersToOverride(h)).toBeUndefined();
  });

  it('key with surrounding whitespace → ok with trimmed key', () => {
    const h = makeHeaders({
      [BYOK_HEADERS.key]: '  k  ',
      [BYOK_HEADERS.baseUrl]: 'https://my.azure.com/openai',
      [BYOK_HEADERS.deployments]: JSON.stringify({ 'gpt-5.4': 'my-gpt54' }),
    });
    const result = headersToOverride(h);
    expect(result).toBeDefined();
    expect(result?.apiKey).toBe('k');
  });
});
