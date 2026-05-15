import { createAzure } from '@ai-sdk/azure';
import type { LanguageModel } from 'ai';
import type { ModelId } from './models';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const azure = createAzure({
  baseURL: required('AZURE_FOUNDRY_BASE_URL'),
  apiKey: required('AZURE_FOUNDRY_API_KEY'),
  apiVersion: process.env.AZURE_FOUNDRY_API_VERSION ?? '2025-04-01-preview',
});

// Foundry deployments are addressed by deployment name, not OpenAI model id.
const FOUNDRY_DEPLOYMENT_NAMES: Record<ModelId, string> = {
  'gpt-5.4': 'gpt-5.4',
  'gpt-5.4-mini': 'gpt-5.4-mini',
  'gpt-5.3-codex': 'gpt-5.3-codex',
  'o4-mini': 'o4-mini',
};

export function getModel(id: ModelId): LanguageModel {
  return azure.responses(FOUNDRY_DEPLOYMENT_NAMES[id]);
}
