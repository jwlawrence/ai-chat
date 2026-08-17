import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RICH_CHIP_PROMPTS } from '@/lib/chat/rich-prompts';
import { extractSpecShape } from '@/lib/chat/rich-prompts/extract-spec';
import { SpecStory } from './_render-spec-story';

/**
 * The four starter chips are the only thing an anonymous visitor can produce,
 * which makes their specs the most-seen output in the product — and until now
 * the only place to look at one was a live model turn. These stories render the
 * REAL spec extracted from each rich prompt, so what you review here is exactly
 * what the model is told to draw.
 */
const meta: Meta<typeof SpecStory> = { title: 'Chip specs', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const spec = (id: keyof typeof RICH_CHIP_PROMPTS) =>
  extractSpecShape(RICH_CHIP_PROMPTS[id]) as Spec;

export const Dashboard: Story = { args: { spec: spec('dashboard') } };
export const Composition: Story = { args: { spec: spec('composition') } };
export const Charts: Story = { args: { spec: spec('charts') } };
export const Interactive: Story = { args: { spec: spec('interactive') } };
