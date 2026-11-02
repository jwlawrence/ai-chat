import { createGateway, type LanguageModel } from 'ai';
import type { ModelId } from './models';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/**
 * Model id → Gateway slug. The AI Gateway addresses models as `vendor/model`;
 * this is the only place that knows the vendor. Adding a model is one line
 * here plus its entries in `models.ts` and `pricing.ts`.
 */
const GATEWAY_SLUGS: Record<ModelId, string> = {
  'gpt-5.4': 'openai/gpt-5.4',
  'gpt-5.4-mini': 'openai/gpt-5.4-mini',
  'gpt-5.3-codex': 'openai/gpt-5.3-codex',
  'o4-mini': 'openai/o4-mini',
};

/**
 * BYOK: a signed-in user's own Gateway key. Their turns go through the same
 * provider path as the app's, billed to their key, with every model available.
 */
export interface ProviderOverride {
  apiKey: string;
}

/**
 * Provider options every call that replays conversation history MUST pass.
 *
 * This app is the sole owner of conversation state (Postgres): every turn
 * sends the full window and never a `previous_response_id`. The upstream
 * OpenAI Responses API defaults to `store: true`, and the AI SDK's Responses
 * converter, when it believes the server is storing items, collapses replayed
 * assistant turns into `{ type: 'item_reference', id }` pointers. On a
 * provider that does not retain them that is a `400 Item with id 'fc_…' not
 * found` on every turn after the first (the Foundry-era failure this guards).
 *
 * `store: false` keeps every request self-contained. The gateway forwards the
 * `openai` namespace to the upstream provider unchanged.
 */
export const STATELESS_PROVIDER_OPTIONS = { openai: { store: false } } as const;

export function getModel(id: ModelId, override?: ProviderOverride): LanguageModel {
  const apiKey = override ? override.apiKey : required('AI_GATEWAY_API_KEY');
  const gateway = createGateway({ apiKey });
  return gateway(GATEWAY_SLUGS[id]);
}
