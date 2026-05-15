export const MODEL_IDS = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'o4-mini'] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const DEFAULT_MODEL: ModelId = 'gpt-5.4';

export const MODEL_LABELS: Record<ModelId, string> = {
  'gpt-5.4': 'GPT-5.4',
  'gpt-5.4-mini': 'GPT-5.4 mini',
  'gpt-5.3-codex': 'GPT-5.3 Codex',
  'o4-mini': 'o4-mini',
};

export function isModelId(value: unknown): value is ModelId {
  return typeof value === 'string' && (MODEL_IDS as readonly string[]).includes(value);
}
