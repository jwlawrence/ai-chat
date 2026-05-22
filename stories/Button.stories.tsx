import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = {
  title: 'Primitives/Button',
  component: SpecStory,
};

export default meta;
type Story = StoryObj<typeof SpecStory>;

const buttonSpec = (
  label: string,
  variant: 'primary' | 'secondary' | 'ghost' | 'destructive',
  opts: { disabled?: boolean } = {},
): Spec => ({
  root: 'btn',
  elements: {
    btn: {
      type: 'Button',
      props: { label, variant, disabled: opts.disabled ?? false },
      on: {
        press: {
          action: 'sendToModel',
          params: { label, message: `Pressed ${label}` },
        },
      },
      children: [],
    },
  },
});

export const Primary: Story = { args: { spec: buttonSpec('Continue', 'primary') } };
export const Secondary: Story = { args: { spec: buttonSpec('Cancel', 'secondary') } };
export const Ghost: Story = { args: { spec: buttonSpec('Skip', 'ghost') } };
export const Destructive: Story = { args: { spec: buttonSpec('Delete', 'destructive') } };
export const Disabled: Story = {
  args: { spec: buttonSpec('Submit', 'primary', { disabled: true }) },
};
export const Locked: Story = {
  args: { spec: buttonSpec('Approve', 'primary'), locked: true },
};
