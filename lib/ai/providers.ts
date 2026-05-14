import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { ModelId } from './models';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function makeProvider(baseURL: string) {
  return createOpenAICompatible({
    name: 'azure-foundry',
    baseURL,
    apiKey: required('AZURE_FOUNDRY_API_KEY'),
    // Azure AI Foundry expects "api-key" header rather than "Authorization: Bearer".
    // The provider forwards `apiKey` via Authorization by default; override the header here.
    headers: { 'api-key': required('AZURE_FOUNDRY_API_KEY') },
  });
}

const gpt = makeProvider(required('AZURE_FOUNDRY_GPT_URL'));
const kimi = makeProvider(required('AZURE_FOUNDRY_KIMI_URL'));

// Foundry deployments use the deployment name as the model identifier.
// Adjust these strings if your deployment names differ.
const FOUNDRY_DEPLOYMENT_NAMES: Record<ModelId, string> = {
  'gpt-5.3': 'gpt-5.3',
  'kimi-k2.6': 'kimi-k2.6',
};

export function getModel(id: ModelId): LanguageModel {
  switch (id) {
    case 'gpt-5.3':
      return gpt.chatModel(FOUNDRY_DEPLOYMENT_NAMES[id]);
    case 'kimi-k2.6':
      return kimi.chatModel(FOUNDRY_DEPLOYMENT_NAMES[id]);
  }
}
