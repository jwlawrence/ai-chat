// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-budget', () => ({
  useBudget: vi.fn(() => ({ data: { usedFraction: 0 } })),
}));

import { useBudget } from '@/hooks/use-budget';
import { UsageMeter } from './usage-meter';

afterEach(cleanup);

describe('UsageMeter', () => {
  it('shows "100% left" when usedFraction is 0', () => {
    vi.mocked(useBudget).mockReturnValue({ data: { usedFraction: 0 } } as ReturnType<
      typeof useBudget
    >);
    render(<UsageMeter />);
    expect(screen.getByText('100% left')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar.className).not.toContain('bg-destructive');
  });

  it('shows "73% left" and non-destructive bar when usedFraction is 0.27', () => {
    vi.mocked(useBudget).mockReturnValue({ data: { usedFraction: 0.27 } } as ReturnType<
      typeof useBudget
    >);
    render(<UsageMeter />);
    expect(screen.getByText('73% left')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar.className).not.toContain('bg-destructive');
  });

  it('shows "5% left" and destructive bar when usedFraction is 0.95', () => {
    vi.mocked(useBudget).mockReturnValue({ data: { usedFraction: 0.95 } } as ReturnType<
      typeof useBudget
    >);
    render(<UsageMeter />);
    expect(screen.getByText('5% left')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar.className).toContain('bg-destructive');
  });
});
