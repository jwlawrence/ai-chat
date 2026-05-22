import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Accordion', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const accordionSpec: Spec = {
  root: 'acc',
  elements: {
    acc: {
      type: 'Accordion',
      props: {
        items: [
          { id: 'shipping', label: 'Shipping', children: ['ship-text'] },
          { id: 'returns', label: 'Returns', children: ['ret-text'] },
          { id: 'faq', label: 'FAQ', children: ['faq-text'] },
        ],
      },
      children: [],
    },
    'ship-text': {
      type: 'Text',
      props: { text: 'We ship Monday through Friday. Orders placed after 3pm ship the next day.' },
      children: [],
    },
    'ret-text': {
      type: 'Text',
      props: { text: 'Free returns within 30 days. Items must be unused with tags attached.' },
      children: [],
    },
    'faq-text': {
      type: 'Text',
      props: { text: 'Common questions and answers.' },
      children: [],
    },
  },
};

export const ThreeSections: Story = { args: { spec: accordionSpec } };
