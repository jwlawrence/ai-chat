import { describe, expect, it } from 'vitest';
import { tablePrimitive } from './table-schema';

describe('table primitive schema', () => {
  it('accepts a 3-column table with 2 rows', () => {
    const r = tablePrimitive.propsSchema.safeParse({
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'role', label: 'Role' },
        { key: 'tenure', label: 'Tenure', align: 'right' },
      ],
      rows: [
        { name: 'Ada', role: 'Eng', tenure: '5y' },
        { name: 'Grace', role: 'Eng', tenure: '12y' },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects when columns is empty', () => {
    const r = tablePrimitive.propsSchema.safeParse({ columns: [], rows: [] });
    expect(r.success).toBe(false);
  });

  it('caps row count to prevent spec bloat', () => {
    const r = tablePrimitive.propsSchema.safeParse({
      columns: [{ key: 'x', label: 'X' }],
      rows: Array.from({ length: 51 }, () => ({ x: '1' })),
    });
    expect(r.success).toBe(false);
  });
});
