import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ChipDeck } from '@/components/chat/chip-deck';

const meta: Meta<typeof ChipDeck> = {
  title: 'Chat/ChipDeck',
  component: ChipDeck,
  parameters: {
    layout: 'centered',
  },
  args: {
    onSelect: (chip) => console.log('selected', chip.id),
  },
};

export default meta;
type Story = StoryObj<typeof ChipDeck>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true },
};

export const InCard: Story = {
  decorators: [
    (Story) => (
      <div className="w-full max-w-4xl rounded-2xl border border-border bg-background p-8">
        <Story />
      </div>
    ),
  ],
};
