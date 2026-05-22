import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Heading', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const headingSpec = (level: 1 | 2 | 3 | 4, text: string): Spec => ({
  root: 'h',
  elements: { h: { type: 'Heading', props: { level, text }, children: [] } },
});

export const Level1: Story = { args: { spec: headingSpec(1, 'Level 1 heading') } };
export const Level2: Story = { args: { spec: headingSpec(2, 'Level 2 heading') } };
export const Level3: Story = { args: { spec: headingSpec(3, 'Level 3 heading') } };
export const Level4: Story = { args: { spec: headingSpec(4, 'Level 4 heading') } };

export const AllLevels: Story = {
  args: {
    spec: {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['h1', 'h2', 'h3', 'h4'] },
        h1: { type: 'Heading', props: { level: 1, text: 'H1 — major section' }, children: [] },
        h2: { type: 'Heading', props: { level: 2, text: 'H2 — sub-section' }, children: [] },
        h3: { type: 'Heading', props: { level: 3, text: 'H3 — group' }, children: [] },
        h4: { type: 'Heading', props: { level: 4, text: 'H4 — minor' }, children: [] },
      },
    },
  },
};
