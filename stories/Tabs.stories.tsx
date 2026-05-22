import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Tabs', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const twoTabSpec: Spec = {
  root: 'tabs',
  elements: {
    tabs: {
      type: 'Tabs',
      props: {
        tabs: [
          { id: 'overview', label: 'Overview', children: ['ov-text'] },
          { id: 'details', label: 'Details', children: ['det-text'] },
        ],
      },
      children: [],
    },
    'ov-text': {
      type: 'Text',
      props: { text: 'Overview content goes here.' },
      children: [],
    },
    'det-text': { type: 'Text', props: { text: 'Detailed content goes here.' }, children: [] },
  },
};

const threeTabSpec: Spec = {
  root: 'tabs',
  elements: {
    tabs: {
      type: 'Tabs',
      props: {
        tabs: [
          { id: 'a', label: 'Alpha', children: ['a-text'] },
          { id: 'b', label: 'Beta', children: ['b-text'] },
          { id: 'g', label: 'Gamma', children: ['g-text'] },
        ],
      },
      children: [],
    },
    'a-text': { type: 'Text', props: { text: 'Alpha section.' }, children: [] },
    'b-text': { type: 'Text', props: { text: 'Beta section.' }, children: [] },
    'g-text': { type: 'Text', props: { text: 'Gamma section.' }, children: [] },
  },
};

export const TwoTabs: Story = { args: { spec: twoTabSpec } };
export const ThreeTabs: Story = { args: { spec: threeTabSpec } };
