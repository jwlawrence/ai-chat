import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Link', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const linkSpec = (href: string, text: string): Spec => ({
  root: 'l',
  elements: { l: { type: 'Link', props: { href, text }, children: [] } },
});

export const Default: Story = {
  args: { spec: linkSpec('https://example.com', 'Visit example.com') },
};
export const LongText: Story = {
  args: {
    spec: linkSpec(
      'https://example.com/very/long/path/to/some/resource',
      'A link whose text is quite a bit longer than usual',
    ),
  },
};
