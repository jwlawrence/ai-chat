import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/List', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const listSpec = (items: string[], ordered = false): Spec => ({
  root: 'l',
  elements: { l: { type: 'List', props: { items, ordered }, children: [] } },
});

export const Unordered: Story = {
  args: { spec: listSpec(['Apples', 'Bananas', 'Cherries', 'Dates']) },
};
export const Ordered: Story = {
  args: { spec: listSpec(['Wake up', 'Brew coffee', 'Read changelog', 'Ship code'], true) },
};
export const SingleItem: Story = {
  args: { spec: listSpec(['Only one item']) },
};
