// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHIP_PROMPTS } from '@/lib/chat/chips';
import { ChipDeck } from './chip-deck';

afterEach(cleanup);

describe('ChipDeck', () => {
  it('renders all 4 chips with their labels', () => {
    render(<ChipDeck onSelect={() => {}} />);
    for (const chip of CHIP_PROMPTS) {
      expect(screen.getByText(chip.label)).toBeInTheDocument();
    }
  });

  it('calls onSelect with the matching chip on click', () => {
    const onSelect = vi.fn();
    render(<ChipDeck onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /show me a dashboard/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'dashboard' }));
  });

  it('disables all chip buttons when disabled prop set', () => {
    render(<ChipDeck onSelect={() => {}} disabled />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(CHIP_PROMPTS.length);
    for (const b of buttons) expect(b).toBeDisabled();
  });

  it('does not call onSelect when disabled chip is clicked', () => {
    const onSelect = vi.fn();
    render(<ChipDeck onSelect={onSelect} disabled />);
    fireEvent.click(screen.getByRole('button', { name: /show me a dashboard/i }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('exposes accessible names matching each chip label', () => {
    render(<ChipDeck onSelect={() => {}} />);
    for (const chip of CHIP_PROMPTS) {
      const re = new RegExp(chip.label, 'i');
      expect(screen.getByRole('button', { name: re })).toBeInTheDocument();
    }
  });
});
