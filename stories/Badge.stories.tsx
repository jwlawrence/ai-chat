import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Badge', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const badgeSpec = (label: string, tone?: 'default' | 'success' | 'warning' | 'danger'): Spec => ({
  root: 'b',
  elements: { b: { type: 'Badge', props: { label, tone }, children: [] } },
});

export const Default: Story = { args: { spec: badgeSpec('Default') } };
export const Success: Story = { args: { spec: badgeSpec('Done', 'success') } };
export const Warning: Story = { args: { spec: badgeSpec('Pending', 'warning') } };
export const Danger: Story = { args: { spec: badgeSpec('Failed', 'danger') } };

export const AllTones: Story = {
  args: {
    spec: {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['b1', 'b2', 'b3', 'b4'] },
        b1: { type: 'Badge', props: { label: 'Default', tone: 'default' }, children: [] },
        b2: { type: 'Badge', props: { label: 'Success', tone: 'success' }, children: [] },
        b3: { type: 'Badge', props: { label: 'Warning', tone: 'warning' }, children: [] },
        b4: { type: 'Badge', props: { label: 'Danger', tone: 'danger' }, children: [] },
      },
    },
  },
};
