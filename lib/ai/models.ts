export const MODEL_IDS = ['gpt-5.3'] as const;
export type ModelId = (typeof MODEL_IDS)[number];

export const DEFAULT_MODEL: ModelId = 'gpt-5.3';

export const MODEL_LABELS: Record<ModelId, string> = {
  'gpt-5.3': 'GPT-5.3+',
};

export function isModelId(value: unknown): value is ModelId {
  return typeof value === 'string' && (MODEL_IDS as readonly string[]).includes(value);
}
