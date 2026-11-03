import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ByokRecord, clearByok, loadByok, saveByok } from './storage';

const STORAGE_KEY = 'pac.byok.v2';
const LEGACY_STORAGE_KEY = 'pac.byok.v1';

interface MockStorage {
  store: Map<string, string>;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

let mock: MockStorage;

beforeEach(() => {
  mock = {
    store: new Map<string, string>(),
    getItem(k: string) {
      return this.store.get(k) ?? null;
    },
    setItem(k: string, v: string) {
      this.store.set(k, v);
    },
    removeItem(k: string) {
      this.store.delete(k);
    },
  };
  vi.stubGlobal('localStorage', mock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('byok storage', () => {
  it('returns null when nothing saved', () => {
    expect(loadByok()).toBeNull();
  });

  it('round-trips a Gateway key record', () => {
    const record: ByokRecord = { key: 'vck_xxx' };
    saveByok(record);
    expect(loadByok()).toEqual(record);
  });

  it('clear removes the record', () => {
    saveByok({ key: 'vck_xxx' });
    clearByok();
    expect(loadByok()).toBeNull();
  });

  it('returns null on corrupted JSON', () => {
    mock.setItem(STORAGE_KEY, '{not json');
    expect(loadByok()).toBeNull();
  });

  it('returns null on a record with an empty key', () => {
    mock.setItem(STORAGE_KEY, JSON.stringify({ key: '   ' }));
    expect(loadByok()).toBeNull();
  });

  it('ignores an Azure-era record and removes it from storage', () => {
    mock.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        key: 'azure-secret',
        baseUrl: 'https://my-resource.openai.azure.com',
        deployments: { 'gpt-5.4-mini': 'my-deployment' },
      }),
    );
    expect(loadByok()).toBeNull();
    expect(mock.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });
});

describe('gatewayKeySchema', () => {
  it('trims and accepts a normal key, rejects blank and oversized keys', async () => {
    const { gatewayKeySchema, MAX_GATEWAY_KEY_LENGTH } = await import('./storage');
    expect(gatewayKeySchema.parse('  vck_xxx ')).toBe('vck_xxx');
    expect(gatewayKeySchema.safeParse('   ').success).toBe(false);
    expect(gatewayKeySchema.safeParse('v'.repeat(MAX_GATEWAY_KEY_LENGTH + 1)).success).toBe(false);
  });
});
