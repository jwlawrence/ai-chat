import { afterEach, describe, expect, it, vi } from 'vitest';

// The gateway provider is a callable: `gateway('openai/gpt-5.4-mini')` returns
// a LanguageModel. Mock it as a function so we can assert which slug was asked
// for, and mock the factory so we can assert which key built it.
const gatewayMock = vi.fn((_slug: string) => ({
  /* opaque LanguageModel stub */
}));

vi.mock('ai', async (importOriginal) => {
  const real = await importOriginal<typeof import('ai')>();
  return { ...real, createGateway: vi.fn(() => gatewayMock) };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('getModel', () => {
  it('builds a gateway model with the app key from AI_GATEWAY_API_KEY', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'env-gateway-key');
    const { createGateway } = await import('ai');
    const { getModel } = await import('./providers');

    getModel('gpt-5.4');

    expect(createGateway).toHaveBeenCalledWith({ apiKey: 'env-gateway-key' });
    expect(gatewayMock).toHaveBeenCalledWith('openai/gpt-5.4');
  });

  it('maps every app model id to its openai/ gateway slug', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'k');
    const { getModel } = await import('./providers');
    const { MODEL_IDS } = await import('./models');

    for (const id of MODEL_IDS) getModel(id);

    expect(gatewayMock.mock.calls.map((c) => c[0])).toEqual([
      'openai/gpt-5.4',
      'openai/gpt-5.4-mini',
      'openai/gpt-5.3-codex',
      'openai/o4-mini',
    ]);
  });

  it('uses the override key (BYOK) instead of the env key when provided', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'env-gateway-key');
    const { createGateway } = await import('ai');
    const { getModel } = await import('./providers');

    getModel('gpt-5.4-mini', { apiKey: 'user-gateway-key' });

    expect(createGateway).toHaveBeenCalledWith({ apiKey: 'user-gateway-key' });
    expect(createGateway).not.toHaveBeenCalledWith({ apiKey: 'env-gateway-key' });
    expect(gatewayMock).toHaveBeenCalledWith('openai/gpt-5.4-mini');
  });

  it('throws a clear error when AI_GATEWAY_API_KEY is missing and no override is given', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    const { getModel } = await import('./providers');

    expect(() => getModel('gpt-5.4-mini')).toThrow(/Missing required env var: AI_GATEWAY_API_KEY/);
  });
});

describe('STATELESS_PROVIDER_OPTIONS', () => {
  it('disables server-side storage under the openai namespace the gateway forwards upstream', async () => {
    const { STATELESS_PROVIDER_OPTIONS } = await import('./providers');
    expect(STATELESS_PROVIDER_OPTIONS).toEqual({ openai: { store: false } });
  });
});
