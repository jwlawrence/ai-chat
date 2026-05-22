import { describe, expect, it } from 'vitest';
import { kpiPrimitive } from './kpi-schema';

describe('kpi primitive schema', () => {
  it('accepts minimum required fields', () => {
    const r = kpiPrimitive.propsSchema.safeParse({ label: 'Revenue', value: '$12.4M' });
    expect(r.success).toBe(true);
  });

  it('accepts a delta with positive/negative/neutral trend', () => {
    for (const trend of ['up', 'down', 'flat'] as const) {
      const r = kpiPrimitive.propsSchema.safeParse({
        label: 'Active users',
        value: '12,345',
        delta: { value: '+8%', trend },
      });
      expect(r.success).toBe(true);
    }
  });

  it('rejects unknown trend values', () => {
    const r = kpiPrimitive.propsSchema.safeParse({
      label: 'X',
      value: '1',
      delta: { value: '+1', trend: 'sideways' },
    });
    expect(r.success).toBe(false);
  });
});
