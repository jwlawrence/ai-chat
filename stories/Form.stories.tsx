import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Form', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const minimalForm: Spec = {
  root: 'form',
  state: { demo: { name: '' } },
  elements: {
    form: { type: 'Form', props: { name: 'demo' }, children: ['name-input'] },
    'name-input': {
      type: 'Input',
      props: { name: 'name', label: 'Name', placeholder: 'Your name' },
      children: [],
    },
  },
};

const formWithSubmit: Spec = {
  root: 'card',
  state: { demo: { name: '' } },
  elements: {
    card: { type: 'Card', props: { title: 'Quick form' }, children: ['form'] },
    form: { type: 'Form', props: { name: 'demo' }, children: ['name-input', 'submit-btn'] },
    'name-input': {
      type: 'Input',
      props: { name: 'name', label: 'Name', placeholder: 'Your name' },
      children: [],
    },
    'submit-btn': {
      type: 'Button',
      props: { label: 'Submit', variant: 'primary' },
      on: { press: { action: 'submitForm', params: { formName: 'demo' } } },
      children: [],
    },
  },
};

export const SingleField: Story = { args: { spec: minimalForm } };
export const WithSubmitButton: Story = { args: { spec: formWithSubmit } };
