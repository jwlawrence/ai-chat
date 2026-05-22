import { describe, expect, it } from 'vitest';
import { rowPrimitive, rowPropsSchema } from './row-schema';

describe('row primitive schema', () => {
  it('accepts empty props (defaults applied)', () => {
    const r = rowPropsSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.gap).toBe('normal');
      expect(r.data.align).toBe('stretch');
    }
  });

  it('accepts all 3 gap values', () => {
    for (const gap of ['tight', 'normal', 'loose'] as const) {
      const r = rowPropsSchema.safeParse({ gap });
      expect(r.success, `gap=${gap} should be accepted`).toBe(true);
    }
  });

  it('accepts all 4 align values', () => {
    for (const align of ['start', 'center', 'end', 'stretch'] as const) {
      const r = rowPropsSchema.safeParse({ align });
      expect(r.success, `align=${align} should be accepted`).toBe(true);
    }
  });

  it('rejects an unknown gap value', () => {
    const r = rowPropsSchema.safeParse({ gap: 'gigantic' });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown align value', () => {
    const r = rowPropsSchema.safeParse({ align: 'baseline' });
    expect(r.success).toBe(false);
  });

  it('exposes rowPrimitive metadata', () => {
    expect(rowPrimitive.description).toContain('horizontal');
    expect(rowPrimitive.propsSchema).toBe(rowPropsSchema);
  });
});
