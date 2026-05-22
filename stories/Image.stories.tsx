import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Image', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const imageSpec = (src: string, alt: string, caption?: string): Spec => ({
  root: 'img',
  elements: { img: { type: 'Image', props: { src, alt, caption }, children: [] } },
});

export const WithCaption: Story = {
  args: {
    spec: imageSpec(
      'https://picsum.photos/seed/storybook-1/1200/675',
      'Mountain landscape at sunset',
      'Fig 1 — Picsum placeholder image, 16:9 aspect.',
    ),
  },
};

export const NoCaption: Story = {
  args: {
    spec: imageSpec('https://picsum.photos/seed/storybook-2/1200/675', 'Forest scene'),
  },
};

export const Portrait: Story = {
  args: {
    spec: imageSpec(
      'https://picsum.photos/seed/storybook-3/600/900',
      'Tall portrait — confirms max-h-72 cap',
      'A portrait image — the `max-h-72` cap (Phase 6 A2) keeps it from blowing up the card.',
    ),
  },
};
