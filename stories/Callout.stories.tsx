import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Callout', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const calloutSpec = (
  tone: 'info' | 'success' | 'warning' | 'danger',
  text: string,
  title?: string,
): Spec => ({
  root: 'c',
  elements: { c: { type: 'Callout', props: { tone, title, text }, children: [] } },
});

export const Info: Story = {
  args: { spec: calloutSpec('info', 'Heads up — this is informational.', 'FYI') },
};
export const Success: Story = {
  args: { spec: calloutSpec('success', 'Deployed successfully.', 'Done') },
};
export const Warning: Story = {
  args: { spec: calloutSpec('warning', 'You are about to overwrite existing data.', 'Careful') },
};
export const Danger: Story = {
  args: { spec: calloutSpec('danger', 'This action cannot be undone.', 'Stop') },
};

export const InfoNoTitle: Story = {
  args: { spec: calloutSpec('info', 'A callout without a title.') },
};

export const AllTones: Story = {
  args: {
    spec: {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['i', 's', 'w', 'd'] },
        i: {
          type: 'Callout',
          props: { tone: 'info', title: 'Info', text: 'Informational.' },
          children: [],
        },
        s: {
          type: 'Callout',
          props: { tone: 'success', title: 'Success', text: 'It worked.' },
          children: [],
        },
        w: {
          type: 'Callout',
          props: { tone: 'warning', title: 'Warning', text: 'Heads up.' },
          children: [],
        },
        d: {
          type: 'Callout',
          props: { tone: 'danger', title: 'Danger', text: 'Cannot undo.' },
          children: [],
        },
      },
    },
  },
};
