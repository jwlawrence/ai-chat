// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Chart } from './chart';

afterEach(cleanup);

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

  it('renders annotation labels at the given x positions', () => {
    render(
      <Chart
        kind="line"
        data={[
          { month: 'Jan', v: 1 },
          { month: 'Feb', v: 2 },
          { month: 'Mar', v: 3 },
        ]}
        series={[{ key: 'v' }]}
        xKey="month"
        annotations={[
          { x: 'Feb', label: 'Launch' },
          { x: 'Mar', label: 'Reliability push' },
        ]}
      />,
    );
    expect(screen.getByText('Launch')).toBeInTheDocument();
    expect(screen.getByText('Reliability push')).toBeInTheDocument();
  });

  it('renders endpointLabel for a line series in the caption row', () => {
    render(
      <Chart
        kind="line"
        data={[
          { month: 'Jan', v: 1 },
          { month: 'Feb', v: 2 },
        ]}
        series={[{ key: 'v', label: 'Lifetime', endpointLabel: '122 lifetime' }]}
        xKey="month"
      />,
    );
    expect(screen.getByText(/Lifetime: 122 lifetime/)).toBeInTheDocument();
  });

  it('does not render an endpoint caption row when no series has an endpointLabel', () => {
    render(
      <Chart
        kind="line"
        data={[
          { month: 'Jan', v: 1 },
          { month: 'Feb', v: 2 },
        ]}
        series={[{ key: 'v', label: 'Value' }]}
        xKey="month"
        title="Untagged"
      />,
    );
    expect(screen.queryByTestId('chart-endpoint-captions')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// V — bar and area chart annotations + endpointLabel (regression guards)
// ---------------------------------------------------------------------------

describe('Chart — bar annotations', () => {
  it('renders annotation labels on a bar chart', () => {
    render(
      <Chart
        kind="bar"
        data={[
          { month: 'Jan', v: 10 },
          { month: 'Feb', v: 20 },
          { month: 'Mar', v: 30 },
        ]}
        series={[{ key: 'v' }]}
        xKey="month"
        annotations={[
          { x: 'Feb', label: 'Peak bar' },
          { x: 'Mar', label: 'End bar' },
        ]}
      />,
    );
    expect(screen.getByText('Peak bar')).toBeInTheDocument();
    expect(screen.getByText('End bar')).toBeInTheDocument();
  });

  it('renders endpointLabel caption for a bar series', () => {
    render(
      <Chart
        kind="bar"
        data={[
          { month: 'Jan', v: 10 },
          { month: 'Feb', v: 20 },
        ]}
        series={[{ key: 'v', label: 'Sales', endpointLabel: '20 this month' }]}
        xKey="month"
      />,
    );
    expect(screen.getByText(/Sales: 20 this month/)).toBeInTheDocument();
  });
});

describe('Chart — area annotations', () => {
  it('renders annotation labels on an area chart', () => {
    render(
      <Chart
        kind="area"
        data={[
          { month: 'Jan', v: 5 },
          { month: 'Feb', v: 15 },
          { month: 'Mar', v: 25 },
        ]}
        series={[{ key: 'v' }]}
        xKey="month"
        annotations={[
          { x: 'Jan', label: 'Area launch' },
          { x: 'Mar', label: 'Area milestone' },
        ]}
      />,
    );
    expect(screen.getByText('Area launch')).toBeInTheDocument();
    expect(screen.getByText('Area milestone')).toBeInTheDocument();
  });

  it('renders endpointLabel caption for an area series', () => {
    render(
      <Chart
        kind="area"
        data={[
          { month: 'Jan', v: 5 },
          { month: 'Feb', v: 15 },
        ]}
        series={[{ key: 'v', label: 'Reach', endpointLabel: '15k users' }]}
        xKey="month"
      />,
    );
    expect(screen.getByText(/Reach: 15k users/)).toBeInTheDocument();
  });
});
