import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Divider', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

export const Solo: Story = {
  args: { spec: { root: 'd', elements: { d: { type: 'Divider', props: {}, children: [] } } } },
};

export const BetweenText: Story = {
  args: {
    spec: {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['t1', 'div', 't2'] },
        t1: { type: 'Text', props: { text: 'Section one.' }, children: [] },
        div: { type: 'Divider', props: {}, children: [] },
        t2: { type: 'Text', props: { text: 'Section two.' }, children: [] },
      },
    },
  },
};
