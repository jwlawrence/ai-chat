import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, isModelId, MODEL_IDS, MODEL_LABELS } from './models';

describe('isModelId', () => {
  it('accepts every entry in MODEL_IDS', () => {
    for (const id of MODEL_IDS) {
      expect(isModelId(id)).toBe(true);
    }
  });

  it('rejects strings that are not a known id', () => {
    expect(isModelId('gpt-3.5')).toBe(false);
    expect(isModelId('')).toBe(false);
    expect(isModelId('GPT-5.4')).toBe(false); // case-sensitive
  });

  it('rejects non-string values', () => {
    expect(isModelId(null)).toBe(false);
    expect(isModelId(undefined)).toBe(false);
    expect(isModelId(42)).toBe(false);
    expect(isModelId({})).toBe(false);
    expect(isModelId([])).toBe(false);
  });
});

describe('module invariants', () => {
  it('DEFAULT_MODEL is one of MODEL_IDS', () => {
    expect(MODEL_IDS).toContain(DEFAULT_MODEL);
  });

  it('MODEL_LABELS has a label for every model id', () => {
    for (const id of MODEL_IDS) {
      expect(MODEL_LABELS[id]).toBeTruthy();
    }
  });
});
