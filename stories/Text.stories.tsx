import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Text', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const textSpec = (text: string, muted = false): Spec => ({
  root: 't',
  elements: { t: { type: 'Text', props: { text, muted }, children: [] } },
});

export const Default: Story = {
  args: { spec: textSpec('A paragraph of regular body text.') },
};
export const Muted: Story = {
  args: { spec: textSpec('A paragraph of muted, secondary text.', true) },
};
export const Long: Story = {
  args: {
    spec: textSpec(
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.',
    ),
  },
};
