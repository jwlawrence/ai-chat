import { describe, expect, it } from 'vitest';
import { chartPrimitive } from './chart-schema';

describe('chart primitive schema', () => {
  it('accepts a minimal line chart with 1 series', () => {
    const result = chartPrimitive.propsSchema.safeParse({
      kind: 'line',
      data: [
        { x: 'Jan', revenue: 100 },
        { x: 'Feb', revenue: 150 },
      ],
      series: [{ key: 'revenue', label: 'Revenue' }],
      xKey: 'x',
    });
    expect(result.success).toBe(true);
  });

  it('rejects when series array is empty', () => {
    const result = chartPrimitive.propsSchema.safeParse({
      kind: 'line',
      data: [{ x: 'Jan', revenue: 100 }],
      series: [],
      xKey: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown kinds', () => {
    const result = chartPrimitive.propsSchema.safeParse({
      kind: 'radar',
      data: [],
      series: [{ key: 'x' }],
      xKey: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('accepts bar, area, pie kinds', () => {
    for (const kind of ['bar', 'area', 'pie'] as const) {
      const result = chartPrimitive.propsSchema.safeParse({
        kind,
        data: [{ x: 'A', value: 1 }],
        series: [{ key: 'value' }],
        xKey: 'x',
      });
      expect(result.success).toBe(true);
    }
  });

  it('caps data length to prevent runaway specs', () => {
    const result = chartPrimitive.propsSchema.safeParse({
      kind: 'line',
      data: Array.from({ length: 101 }, (_, i) => ({ x: `${i}`, v: i })),
      series: [{ key: 'v' }],
      xKey: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('caps series length at 8', () => {
    const result = chartPrimitive.propsSchema.safeParse({
      kind: 'line',
      data: [{ x: 'A', value: 1 }],
      series: Array.from({ length: 9 }, (_, i) => ({ key: `s${i}` })),
      xKey: 'x',
    });
    expect(result.success).toBe(false);
  });
});
