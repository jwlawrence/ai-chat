export type ChipId = 'dashboard' | 'interactive' | 'composition' | 'charts';

export interface ChipPrompt {
  id: ChipId;
  label: string;
  prompt: string;
}

// Phase-4 working placeholders — wording chosen to reliably trip
// hasUIRenderIntent (UI verb + UI noun, or "render" alone) so the
// model actually emits a renderUI card. Phase 7 will tune these for
// quality after dogfooding; labels stay stable as the UI contract.
export const CHIP_PROMPTS: ChipPrompt[] = [
  {
    id: 'dashboard',
    label: 'Show me a dashboard',
    prompt: 'Render a dashboard card with three sample KPIs and a chart of weekly traffic.',
  },
  {
    id: 'interactive',
    label: 'Build me a form',
    prompt: 'Build a form with name, email, and a submit button, then echo the values in a card.',
  },
  {
    id: 'composition',
    label: 'Compose a card layout',
    prompt: 'Render a card with tabs (Overview, Details, Activity) and a small list in each tab.',
  },
  {
    id: 'charts',
    label: 'Plot some data',
    prompt: 'Render a card containing a bar chart of five days of sample sales.',
  },
];

export function isChipId(value: unknown): value is ChipId {
  return typeof value === 'string' && CHIP_PROMPTS.some((c) => c.id === value);
}
