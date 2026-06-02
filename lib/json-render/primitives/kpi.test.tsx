// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KPI } from './kpi';

describe('KPI renderer', () => {
  afterEach(cleanup);

  it('renders label, value, and delta', () => {
    render(<KPI label="Revenue" value="$12.4M" delta={{ value: '+8%', trend: 'up' }} />);
    expect(screen.getByText('Revenue')).toBeInTheDocument();
    expect(screen.getByText('$12.4M')).toBeInTheDocument();
    expect(screen.getByText('+8%')).toBeInTheDocument();
  });

  it('renders without a delta', () => {
    render(<KPI label="Users" value="1,234" />);
    expect(screen.queryByText(/\+|-/)).toBeNull();
  });

  it.each([
    { trend: 'up' as const, expectedClass: 'text-emerald-600' },
    { trend: 'down' as const, expectedClass: 'text-rose-600' },
    { trend: 'flat' as const, expectedClass: 'text-muted-foreground' },
  ])('applies the $trend trend color', ({ trend, expectedClass }) => {
    render(<KPI label="X" value="1" delta={{ value: '+1', trend }} />);
    expect(screen.getByText('+1')).toHaveClass(expectedClass);
  });

  // U — structural guard: KPI must carry h-full so tiles stay uniform height
  // in a dashboard row. The Card inside KPI uses h-full; without it a tile
  // with a longer label would be shorter than its neighbour.
  it('renders with h-full class on the card so dashboard tiles stay uniform height', () => {
    const { container } = render(<KPI label="Headcount" value="42" />);
    // The outermost rendered element (the shadcn Card) carries h-full.
    // We identify it as the first element with role="article" or by class.
    const card = container.firstElementChild;
    expect(card?.className).toContain('h-full');
  });

  it('CardContent inside KPI carries h-full so flex column fills the card', () => {
    const { container } = render(<KPI label="Headcount" value="42" />);
    // CardContent sits one level inside the Card root element.
    const content = container.querySelector('[data-slot="card-content"]');
    expect(content?.className).toContain('h-full');
  });
});
