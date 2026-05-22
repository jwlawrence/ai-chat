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
});
