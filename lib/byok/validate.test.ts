import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateByokCredentials } from './validate';

vi.mock('@ai-sdk/azure', () => ({
  createAzure: vi.fn(() => ({
    responses: vi.fn(() => ({
      /* opaque model stub — generateText is mocked */
    })),
  })),
}));
vi.mock('ai', () => ({
  generateText: vi.fn(async () => ({ text: 'ok' })),
}));

afterEach(() => vi.clearAllMocks());

describe('validateByokCredentials', () => {
  it('returns ok:true when the tiny call succeeds', async () => {
    const r = await validateByokCredentials({
      key: 'sk-xxx',
      baseUrl: 'https://example.openai.azure.com',
      deploymentName: 'my-deploy',
    });
    expect(r.ok).toBe(true);
  });

  it('returns ok:false with error message when SDK throws', async () => {
    const { generateText } = await import('ai');
    (generateText as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('401 unauthorized'),
    );
    const r = await validateByokCredentials({
      key: 'sk-bad',
      baseUrl: 'https://example.openai.azure.com',
      deploymentName: 'my-deploy',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('401');
  });

  it('passes apiVersion to createAzure when provided', async () => {
    const { createAzure } = await import('@ai-sdk/azure');
    const createAzureMock = createAzure as unknown as ReturnType<typeof vi.fn>;
    await validateByokCredentials({
      key: 'sk-xxx',
      baseUrl: 'https://example.openai.azure.com',
      deploymentName: 'my-deploy',
      apiVersion: '2024-12-01-preview',
    });
    expect(createAzureMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiVersion: '2024-12-01-preview' }),
    );
  });

  it('falls back to default apiVersion when omitted', async () => {
    const { createAzure } = await import('@ai-sdk/azure');
    const createAzureMock = createAzure as unknown as ReturnType<typeof vi.fn>;
    await validateByokCredentials({
      key: 'sk-xxx',
      baseUrl: 'https://example.openai.azure.com',
      deploymentName: 'my-deploy',
    });
    expect(createAzureMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiVersion: '2025-04-01-preview' }),
    );
  });

  it('extracts HTTP status from a plain-object rejection with no .message', async () => {
    const { generateText } = await import('ai');
    (generateText as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce({ status: 401 });
    const r = await validateByokCredentials({
      key: 'sk-bad',
      baseUrl: 'https://example.openai.azure.com',
      deploymentName: 'my-deploy',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('HTTP 401');
  });

  it('uses fallback message when rejection has no extractable info', async () => {
    const { generateText } = await import('ai');
    (generateText as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(null);
    const r = await validateByokCredentials({
      key: 'sk-bad',
      baseUrl: 'https://example.openai.azure.com',
      deploymentName: 'my-deploy',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('Azure rejected the credentials (no details)');
  });

  it('uses Error .message when it is a real Error', async () => {
    const { generateText } = await import('ai');
    (generateText as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('connection refused'),
    );
    const r = await validateByokCredentials({
      key: 'sk-bad',
      baseUrl: 'https://example.openai.azure.com',
      deploymentName: 'my-deploy',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('connection refused');
  });
});
