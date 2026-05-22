// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chart } from './chart';

describe('Chart renderer', () => {
  const data = [
    { month: 'Jan', revenue: 100 },
    { month: 'Feb', revenue: 200 },
  ];

  it('renders a line chart container with the title', () => {
    render(
      <Chart
        kind="line"
        data={data}
        series={[{ key: 'revenue', label: 'Revenue' }]}
        xKey="month"
        title="Monthly Revenue"
      />,
    );
    expect(screen.getByText('Monthly Revenue')).toBeInTheDocument();
  });

  it('renders all chart kinds with their titles', () => {
    for (const kind of ['line', 'bar', 'area', 'pie'] as const) {
      const { unmount, getByText } = render(
        <Chart
          kind={kind}
          data={data}
          series={[{ key: 'revenue' }]}
          xKey="month"
          title={`${kind} chart`}
        />,
      );
      expect(getByText(`${kind} chart`)).toBeInTheDocument();
      unmount();
    }
  });

  it('renders the "No data" fallback on empty data', () => {
    render(<Chart kind="line" data={[]} series={[{ key: 'revenue' }]} xKey="month" />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});
