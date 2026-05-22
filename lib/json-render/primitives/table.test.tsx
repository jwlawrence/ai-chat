// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table } from './table';

describe('Table renderer', () => {
  it('renders headers and data rows', () => {
    render(
      <Table
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'role', label: 'Role' },
        ]}
        rows={[
          { name: 'Ada', role: 'Eng' },
          { name: 'Grace', role: 'Eng' },
        ]}
      />,
    );
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('Grace')).toBeInTheDocument();
  });

  it('renders empty state when rows is empty', () => {
    render(<Table columns={[{ key: 'x', label: 'X' }]} rows={[]} />);
    expect(screen.getByText(/no rows/i)).toBeInTheDocument();
  });

  it('formats null, booleans, and numbers via formatCell', () => {
    render(
      <Table
        columns={[
          { key: 'a', label: 'A' },
          { key: 'b', label: 'B' },
          { key: 'c', label: 'C' },
          { key: 'd', label: 'D' },
        ]}
        rows={[{ a: null, b: true, c: false, d: 42 }]}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('applies the correct alignment class to header and cell', () => {
    render(
      <Table columns={[{ key: 'val', label: 'Value', align: 'right' }]} rows={[{ val: 'x' }]} />,
    );
    expect(screen.getByText('Value')).toHaveClass('text-right');
    expect(screen.getByText('x')).toHaveClass('text-right');
  });
});
