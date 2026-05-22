import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Card', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const cardSpec = (overrides: { title?: string; footer?: string; bodyText: string }): Spec => ({
  root: 'card',
  elements: {
    card: {
      type: 'Card',
      props: { title: overrides.title, footer: overrides.footer },
      children: ['body'],
    },
    body: { type: 'Text', props: { text: overrides.bodyText }, children: [] },
  },
});

export const TitleAndFooter: Story = {
  args: {
    spec: cardSpec({
      title: 'Server status',
      footer: 'Updated 2 minutes ago',
      bodyText: 'All systems nominal.',
    }),
  },
};

export const TitleOnly: Story = {
  args: { spec: cardSpec({ title: 'Just a title', bodyText: 'Body content goes here.' }) },
};

export const FooterOnly: Story = {
  args: { spec: cardSpec({ footer: 'tiny footer', bodyText: 'Body content goes here.' }) },
};

export const Bare: Story = {
  args: { spec: cardSpec({ bodyText: 'A card with no title or footer.' }) },
};
