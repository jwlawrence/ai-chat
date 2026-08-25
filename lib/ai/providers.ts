import { createAzure } from '@ai-sdk/azure';
import type { LanguageModel } from 'ai';
import type { ModelId } from './models';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

// Foundry deployments are addressed by deployment name, not OpenAI model id.
const FOUNDRY_DEPLOYMENT_NAMES: Record<ModelId, string> = {
  'gpt-5.4': 'gpt-5.4',
  'gpt-5.4-mini': 'gpt-5.4-mini',
  'gpt-5.3-codex': 'gpt-5.3-codex',
  'o4-mini': 'o4-mini',
};

export interface ProviderOverride {
  apiKey: string;
  baseUrl: string;
  deployments: Partial<Record<ModelId, string>>;
  apiVersion?: string;
}

export const DEFAULT_AZURE_API_VERSION = '2025-04-01-preview';

/**
 * Provider options every call that replays conversation history MUST pass.
 *
 * The Responses provider builds its request `input` with
 * `store: openaiOptions?.store ?? true` but forwards `store` to the API
 * verbatim — so leaving it unset means the converter BELIEVES the server is
 * holding prior items while the request says nothing. Under that belief it
 * collapses every replayed assistant turn into `{ type: 'item_reference', id }`
 * instead of sending its content. OpenAI stores responses by default so the
 * pointer resolves; Azure does not, so the second turn of any conversation
 * died with `400 Item with id 'fc_…' not found` (tool calls) or
 * `'msg_…' not found` (plain assistant replies).
 *
 * `store: false` makes the converter inline `function_call` / `assistant`
 * items, so each request is self-contained. That is the only correct mode
 * here: this app is the sole owner of conversation state (Postgres), and it
 * never sends `previous_response_id` or `conversation`.
 *
 * The key must be `azure`: the provider resolves its namespace with
 * `config.provider.includes('azure') ? 'azure' : 'openai'`, and both the
 * default and BYOK models are built with `createAzure`.
 */
export const STATELESS_PROVIDER_OPTIONS = { azure: { store: false } } as const;

export function getModel(id: ModelId, override?: ProviderOverride): LanguageModel {
  if (override) {
    const deployment = override.deployments[id];
    if (!deployment) {
      throw new Error(`BYOK override is missing a deployment name for model ${id}`);
    }
    const azure = createAzure({
      baseURL: override.baseUrl,
      apiKey: override.apiKey,
      apiVersion: override.apiVersion ?? DEFAULT_AZURE_API_VERSION,
    });
    return azure.responses(deployment);
  }
  const azure = createAzure({
    baseURL: required('AZURE_FOUNDRY_BASE_URL'),
    apiKey: required('AZURE_FOUNDRY_API_KEY'),
    apiVersion: process.env.AZURE_FOUNDRY_API_VERSION ?? DEFAULT_AZURE_API_VERSION,
  });
  return azure.responses(FOUNDRY_DEPLOYMENT_NAMES[id]);
}
