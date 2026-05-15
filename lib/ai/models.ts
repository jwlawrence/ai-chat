export const MODEL_IDS = ['gpt-5.4', 'gpt-5.3-codex'] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const DEFAULT_MODEL: ModelId = 'gpt-5.4';

export const MODEL_LABELS: Record<ModelId, string> = {
  'gpt-5.4': 'GPT-5.4',
  'gpt-5.3-codex': 'GPT-5.3 Codex',
};

export function isModelId(value: unknown): value is ModelId {
  return typeof value === 'string' && (MODEL_IDS as readonly string[]).includes(value);
}
