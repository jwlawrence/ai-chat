import { describe, expect, it } from 'vitest';
import { BYOK_HEADERS, headersToOverride, recordToHeaders } from './headers';
import type { ByokRecord } from './storage';

const RECORD: ByokRecord = { key: 'vck_test_key' };

function makeHeaders(entries: Record<string, string>): Headers {
  return new Headers(Object.entries(entries));
}

describe('recordToHeaders', () => {
  it('serializes the Gateway key into the single BYOK header', () => {
    expect(recordToHeaders(RECORD)).toEqual({ [BYOK_HEADERS.key]: 'vck_test_key' });
  });
});

describe('headersToOverride', () => {
  it('key header present → override carrying that key', () => {
    const h = makeHeaders({ [BYOK_HEADERS.key]: 'vck_test_key' });
    expect(headersToOverride(h)).toEqual({ apiKey: 'vck_test_key' });
  });

  it('trims surrounding whitespace from the key', () => {
    const h = makeHeaders({ [BYOK_HEADERS.key]: '  vck_test_key  ' });
    expect(headersToOverride(h)).toEqual({ apiKey: 'vck_test_key' });
  });

  it('no key header → undefined (caller falls back to the app key)', () => {
    expect(headersToOverride(makeHeaders({}))).toBeUndefined();
  });

  it('empty or whitespace-only key → undefined', () => {
    expect(headersToOverride(makeHeaders({ [BYOK_HEADERS.key]: '' }))).toBeUndefined();
    expect(headersToOverride(makeHeaders({ [BYOK_HEADERS.key]: '   ' }))).toBeUndefined();
  });

  it('oversized key → undefined', () => {
    const h = makeHeaders({ [BYOK_HEADERS.key]: `vck_${'x'.repeat(600)}` });
    expect(headersToOverride(h)).toBeUndefined();
  });

  it('legacy Azure headers alone (no key) → undefined', () => {
    const h = makeHeaders({
      'x-byok-base-url': 'https://my.azure.com/openai',
      'x-byok-deployments': JSON.stringify({ 'gpt-5.4': 'my-gpt54' }),
    });
    expect(headersToOverride(h)).toBeUndefined();
  });
});
