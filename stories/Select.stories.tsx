import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Select', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const selectSpec = (
  options: Array<{ value: string; label: string }>,
  opts: { label?: string; seed?: string } = {},
): Spec => ({
  root: 'form',
  state: opts.seed !== undefined ? { demo: { choice: opts.seed } } : undefined,
  elements: {
    form: { type: 'Form', props: { name: 'demo' }, children: ['sel'] },
    sel: {
      type: 'Select',
      props: { name: 'choice', label: opts.label, options },
      children: [],
    },
  },
});

export const ShortList: Story = {
  args: {
    spec: selectSpec(
      [
        { value: 'red', label: 'Red' },
        { value: 'green', label: 'Green' },
        { value: 'blue', label: 'Blue' },
      ],
      { label: 'Favorite color' },
    ),
  },
};

export const Seeded: Story = {
  args: {
    spec: selectSpec(
      [
        { value: 'daily', label: 'Today' },
        { value: 'weekly', label: '7-Day' },
      ],
      { label: 'Forecast view', seed: 'weekly' },
    ),
  },
};

export const LongList: Story = {
  args: {
    spec: selectSpec(
      Array.from({ length: 12 }, (_, i) => ({
        value: `m${i + 1}`,
        label: new Date(2026, i, 1).toLocaleString('en', { month: 'long' }),
      })),
      { label: 'Month' },
    ),
  },
};
