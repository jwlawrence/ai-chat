import { afterEach, describe, expect, it, vi } from 'vitest';

const MODEL_STUB = { _isModelStub: true };

vi.mock('@/lib/ai/providers', () => ({
  getModel: vi.fn(() => MODEL_STUB),
}));
vi.mock('ai', () => ({
  generateText: vi.fn(async () => ({ text: 'ok' })),
}));

import { generateText } from 'ai';
import { getModel } from '@/lib/ai/providers';
import { validateByokCredentials } from './validate';

afterEach(() => vi.clearAllMocks());

describe('validateByokCredentials', () => {
  it('returns ok:true when a tiny call through the user key succeeds', async () => {
    const r = await validateByokCredentials({ key: 'vck_xxx' });
    expect(r.ok).toBe(true);
  });

  it('validates through the provider seam on the default model with the user key', async () => {
    await validateByokCredentials({ key: 'vck_xxx' });
    expect(getModel).toHaveBeenCalledWith('gpt-5.4-mini', { apiKey: 'vck_xxx' });
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODEL_STUB, maxOutputTokens: 5 }),
    );
  });

  it('returns ok:false with the error message when the SDK throws', async () => {
    vi.mocked(generateText).mockRejectedValueOnce(new Error('401 unauthorized'));
    const r = await validateByokCredentials({ key: 'vck_bad' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('401');
  });

  it('falls back to HTTP status when the thrown value is a plain object with status', async () => {
    vi.mocked(generateText).mockRejectedValueOnce({ status: 403 });
    const r = await validateByokCredentials({ key: 'vck_bad' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('HTTP 403');
  });

  it('uses a generic gateway message when the error carries no detail', async () => {
    vi.mocked(generateText).mockRejectedValueOnce({});
    const r = await validateByokCredentials({ key: 'vck_bad' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('AI Gateway rejected the credentials (no details)');
  });
});
