import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Checkbox', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const checkboxSpec = (label: string, seed?: boolean): Spec => ({
  root: 'form',
  state: seed !== undefined ? { demo: { agree: seed } } : undefined,
  elements: {
    form: { type: 'Form', props: { name: 'demo' }, children: ['cb'] },
    cb: { type: 'Checkbox', props: { name: 'agree', label }, children: [] },
  },
});

export const Unchecked: Story = { args: { spec: checkboxSpec('Subscribe to updates') } };
export const SeededChecked: Story = {
  args: { spec: checkboxSpec('I agree to the terms', true) },
};
export const LongLabel: Story = {
  args: {
    spec: checkboxSpec(
      'I have read and agree to the full set of terms of service and the privacy policy referenced therein',
    ),
  },
};
