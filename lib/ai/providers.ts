import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { ModelId } from './models';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const FOUNDRY_API_KEY = required('AZURE_FOUNDRY_API_KEY');

function makeProvider(baseURL: string) {
  // Foundry uses the "api-key" header, not "Authorization: Bearer". We must NOT pass
  // `apiKey` to createOpenAICompatible — that would inject an Authorization header
  // alongside our custom one, which Foundry rejects. Only `headers` is set.
  return createOpenAICompatible({
    name: 'azure-foundry',
    baseURL,
    headers: { 'api-key': FOUNDRY_API_KEY },
  });
}

const gpt = makeProvider(required('AZURE_FOUNDRY_GPT_URL'));

// Foundry deployments use the deployment name as the model identifier.
// Adjust this string if your deployment name differs.
const FOUNDRY_DEPLOYMENT_NAMES: Record<ModelId, string> = {
  'gpt-5.3': 'gpt-5.3',
};

export function getModel(id: ModelId): LanguageModel {
  switch (id) {
    case 'gpt-5.3':
      return gpt.chatModel(FOUNDRY_DEPLOYMENT_NAMES[id]);
  }
}
