import { afterEach, describe, expect, it, vi } from 'vitest';

const responsesMock = vi.fn(() => ({
  /* opaque LanguageModel stub */
}));

vi.mock('@ai-sdk/azure', () => ({
  createAzure: vi.fn(() => ({ responses: responsesMock })),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('getModel', () => {
  it('uses the override credentials when provided', async () => {
    const { createAzure } = await import('@ai-sdk/azure');
    const createAzureMock = createAzure as unknown as ReturnType<typeof vi.fn>;
    const { getModel } = await import('./providers');

    getModel('gpt-5.4-mini', {
      apiKey: 'sk-byok',
      baseUrl: 'https://byok.openai.azure.com',
      deployments: { 'gpt-5.4-mini': 'byok-mini-deployment' },
    });

    expect(createAzureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://byok.openai.azure.com',
        apiKey: 'sk-byok',
        apiVersion: '2025-04-01-preview',
      }),
    );
    expect(responsesMock).toHaveBeenCalledWith('byok-mini-deployment');
  });

  it('honors override apiVersion when set', async () => {
    const { createAzure } = await import('@ai-sdk/azure');
    const createAzureMock = createAzure as unknown as ReturnType<typeof vi.fn>;
    const { getModel } = await import('./providers');

    getModel('gpt-5.4-mini', {
      apiKey: 'sk',
      baseUrl: 'https://x.openai.azure.com',
      deployments: { 'gpt-5.4-mini': 'd' },
      apiVersion: '2024-12-01-preview',
    });

    expect(createAzureMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiVersion: '2024-12-01-preview' }),
    );
  });

  it('throws when override is missing a deployment for the requested model', async () => {
    const { getModel } = await import('./providers');
    expect(() =>
      getModel('gpt-5.4', {
        apiKey: 'sk',
        baseUrl: 'https://x.openai.azure.com',
        deployments: { 'gpt-5.4-mini': 'd' },
      }),
    ).toThrow(/missing a deployment name for model gpt-5\.4/);
  });

  it('uses env vars when no override', async () => {
    vi.stubEnv('AZURE_FOUNDRY_BASE_URL', 'https://env.openai.azure.com');
    vi.stubEnv('AZURE_FOUNDRY_API_KEY', 'env-key');
    vi.stubEnv('AZURE_FOUNDRY_API_VERSION', '2025-04-01-preview');
    const { createAzure } = await import('@ai-sdk/azure');
    const createAzureMock = createAzure as unknown as ReturnType<typeof vi.fn>;
    const { getModel } = await import('./providers');

    getModel('gpt-5.4');

    expect(createAzureMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://env.openai.azure.com',
        apiKey: 'env-key',
      }),
    );
    expect(responsesMock).toHaveBeenCalledWith('gpt-5.4');
    vi.unstubAllEnvs();
  });
});
