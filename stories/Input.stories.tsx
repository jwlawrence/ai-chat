import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Input', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const inputSpec = (props: {
  name: string;
  label?: string;
  placeholder?: string;
  kind?: 'text' | 'email' | 'number' | 'password';
  seed?: string;
}): Spec => ({
  root: 'form',
  state: props.seed !== undefined ? { demo: { [props.name]: props.seed } } : undefined,
  elements: {
    form: { type: 'Form', props: { name: 'demo' }, children: ['inp'] },
    inp: {
      type: 'Input',
      props: {
        name: props.name,
        label: props.label,
        placeholder: props.placeholder,
        kind: props.kind,
      },
      children: [],
    },
  },
});

export const Text: Story = {
  args: { spec: inputSpec({ name: 'fullName', label: 'Full name', placeholder: 'Jane Doe' }) },
};
export const Email: Story = {
  args: {
    spec: inputSpec({
      name: 'email',
      label: 'Email',
      placeholder: 'you@example.com',
      kind: 'email',
    }),
  },
};
export const Password: Story = {
  args: { spec: inputSpec({ name: 'password', label: 'Password', kind: 'password' }) },
};
export const NumberKind: Story = {
  args: { spec: inputSpec({ name: 'age', label: 'Age', kind: 'number', placeholder: '0' }) },
};
export const Seeded: Story = {
  args: {
    spec: inputSpec({ name: 'username', label: 'Username', seed: 'jdoe' }),
  },
};
export const NoLabel: Story = {
  args: { spec: inputSpec({ name: 'query', placeholder: 'Search…' }) },
};
