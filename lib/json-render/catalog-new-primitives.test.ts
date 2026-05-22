import { describe, expect, it } from 'vitest';
import { catalog } from './catalog';

describe('catalog registers new primitives', () => {
  it('exposes Chart, Table, KPI', () => {
    const components = (catalog.data as { components: Record<string, unknown> }).components;
    expect(components).toHaveProperty('Chart');
    expect(components).toHaveProperty('Table');
    expect(components).toHaveProperty('KPI');
  });

  it('lists Chart, Table, KPI in componentNames', () => {
    expect(catalog.componentNames).toContain('Chart');
    expect(catalog.componentNames).toContain('Table');
    expect(catalog.componentNames).toContain('KPI');
  });
});
