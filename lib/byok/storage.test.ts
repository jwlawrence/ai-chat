import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ByokRecord, clearByok, loadByok, saveByok } from './storage';

const STORAGE_KEY = 'pac.byok.v1';

interface MockStorage {
  store: Map<string, string>;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

beforeEach(() => {
  const mock: MockStorage = {
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

  it('round-trips a record', () => {
    const record: ByokRecord = {
      key: 'sk-xxx',
      baseUrl: 'https://my-resource.openai.azure.com',
      deployments: { 'gpt-5.4-mini': 'my-deployment' },
    };
    saveByok(record);
    expect(loadByok()).toEqual(record);
  });

  it('clear removes the record', () => {
    saveByok({ key: 'k', baseUrl: 'https://a.example.com', deployments: { x: 'y' } });
    clearByok();
    expect(loadByok()).toBeNull();
  });

  it('returns null on corrupted JSON', () => {
    (globalThis.localStorage as unknown as { setItem: (k: string, v: string) => void }).setItem(
      STORAGE_KEY,
      '{not json',
    );
    expect(loadByok()).toBeNull();
  });

  it('round-trips a record with apiVersion', () => {
    const record: ByokRecord = {
      key: 'sk-xxx',
      baseUrl: 'https://my-resource.openai.azure.com',
      deployments: { 'gpt-5.4-mini': 'my-deployment' },
      apiVersion: '2025-04-01-preview',
    };
    saveByok(record);
    expect(loadByok()).toEqual(record);
  });
});
