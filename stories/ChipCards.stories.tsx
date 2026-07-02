import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RICH_CHIP_PROMPTS } from '@/lib/chat/rich-prompts';
import { SpecStory } from './_render-spec-story';

/**
 * The four predefined chip cards, rendered from the exact "Spec shape:" JSON
 * embedded in each rich prompt. Parsing the spec out of the prompt (instead
 * of pasting a copy here) means these previews can never drift from what the
 * model is instructed to emit — lib/chat/rich-prompts/spec-shapes.test.ts
 * guarantees the blocks stay valid.
 *
 * Use these stories to eyeball tab switching, the chart-kind switcher, the
 * composition tab's setState demo button, and the contact form's locked state.
 */
function specFromPrompt(prompt: string): Spec {
  const marker = 'Spec shape:';
  const idx = prompt.lastIndexOf(marker);
  if (idx < 0) throw new Error('rich prompt is missing its "Spec shape:" block');
  return JSON.parse(prompt.slice(idx + marker.length)) as Spec;
}

const meta: Meta<typeof SpecStory> = { title: 'Chip cards', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

export const Dashboard: Story = {
  args: { spec: specFromPrompt(RICH_CHIP_PROMPTS.dashboard) },
};

export const Composition: Story = {
  args: { spec: specFromPrompt(RICH_CHIP_PROMPTS.composition) },
};

export const Charts: Story = {
  args: { spec: specFromPrompt(RICH_CHIP_PROMPTS.charts) },
};

export const Interactive: Story = {
  args: { spec: specFromPrompt(RICH_CHIP_PROMPTS.interactive) },
};

export const InteractiveLocked: Story = {
  name: 'Interactive (locked after submit)',
  args: { spec: specFromPrompt(RICH_CHIP_PROMPTS.interactive), locked: true },
};
