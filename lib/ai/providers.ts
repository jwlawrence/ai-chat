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
