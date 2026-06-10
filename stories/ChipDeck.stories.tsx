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

/**
 * The space-constrained variant used in the anonymous bottom-bar (where the
 * deck replaces the composer). Resize the viewport below `sm` to see it drop
 * to a 2-column grid with tighter padding and the blurb hidden.
 */
export const Compact: Story = {
  args: { compact: true },
  decorators: [
    (Story) => (
      <div className="w-full max-w-sm">
        <Story />
      </div>
    ),
  ],
};

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
