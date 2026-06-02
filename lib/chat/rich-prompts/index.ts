import type { ChipId } from '../chips';
import { CHARTS_RICH_PROMPT } from './charts';
import { COMPOSITION_RICH_PROMPT } from './composition';
import { DASHBOARD_RICH_PROMPT } from './dashboard';
import { INTERACTIVE_RICH_PROMPT } from './interactive';

/**
 * Per-chip spec-grade prompts the chat route substitutes for the short
 * transcript text. Each entry encodes the exact card structure, the
 * numbers, and the style rules the model must honour.
 *
 * Splitting these into one file per chip keeps `lib/chat/chips.ts` lean
 * (the control plane: types, ordering, helpers) while the heavy prompt
 * payloads live alongside one another for at-a-glance comparison and
 * easier diffs when polishing.
 */
export const RICH_CHIP_PROMPTS: Record<ChipId, string> = {
  dashboard: DASHBOARD_RICH_PROMPT,
  composition: COMPOSITION_RICH_PROMPT,
  charts: CHARTS_RICH_PROMPT,
  interactive: INTERACTIVE_RICH_PROMPT,
};
