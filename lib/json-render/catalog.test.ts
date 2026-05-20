import { describe, expect, it } from 'vitest';
import { catalog, catalogPrompt, validateElementProps } from './catalog';

// ---------------------------------------------------------------------------
// Fixture: a nested layout combining Card, Heading, Text, Button, Callout
// ---------------------------------------------------------------------------

const validSpec = {
  root: 'page-card',
  elements: {
    'page-card': {
      type: 'Card',
      props: { title: 'Welcome', children: ['hero-heading', 'intro-text', 'cta-btn', 'notice'] },
      children: ['hero-heading', 'intro-text', 'cta-btn', 'notice'],
    },
    'hero-heading': {
      type: 'Heading',
      props: { level: 1, text: 'Hello, World!' },
      children: [],
    },
    'intro-text': {
      type: 'Text',
      props: { text: 'This is a sample layout combining five primitives.', muted: false },
      children: [],
    },
    'cta-btn': {
      type: 'Button',
      props: { label: 'Get Started', variant: 'primary' },
      children: [],
    },
    notice: {
      type: 'Callout',
      props: { tone: 'info', title: 'Note', text: 'No action wiring yet — Phase 2 adds that.' },
      children: [],
    },
  },
};

// ---------------------------------------------------------------------------
// Catalog registration
// ---------------------------------------------------------------------------

describe('catalog', () => {
  it('has all 15 primitives registered', () => {
    const expected = [
      'Card',
      'Heading',
      'Text',
      'Image',
      'Link',
      'Button',
      'List',
      'Input',
      'Select',
      'Checkbox',
      'Form',
      'Tabs',
      'Accordion',
      'Callout',
      'Badge',
      'Divider',
    ];
    expect(catalog.componentNames).toEqual(expect.arrayContaining(expected));
    expect(catalog.componentNames).toHaveLength(expected.length);
  });

  // -------------------------------------------------------------------------
  // Positive round-trip: catalog.validate() checks spec structure
  // -------------------------------------------------------------------------

  it('validates a well-formed nested spec successfully', () => {
    const result = catalog.validate(validSpec);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('round-trips: validated spec preserves the original structure', () => {
    const result = catalog.validate(validSpec);
    if (!result.success) throw new Error('Expected valid spec');
    expect(result.data?.root).toBe('page-card');
    expect(Object.keys(result.data?.elements ?? {})).toHaveLength(5);
  });

  // -------------------------------------------------------------------------
  // Structural validation via catalog.validate()
  // -------------------------------------------------------------------------

  it('catalog.validate() rejects a spec referencing an unknown component type', () => {
    const spec = {
      root: 'x',
      elements: {
        x: {
          type: 'VideoPlayer', // not in catalog
          props: {},
          children: [],
        },
      },
    };
    const result = catalog.validate(spec);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('catalog.validate() rejects a spec that is missing the root field', () => {
    // Missing `root` — violates the spec object schema
    const spec = {
      elements: {
        h: { type: 'Heading', props: { level: 1, text: 'Hi' }, children: [] },
      },
    };
    const result = catalog.validate(spec);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Per-component prop validation via validateElementProps()
//
// catalog.validate() validates spec structure (root, element types, children).
// validateElementProps() validates individual component props — this is the
// secondary-pass API that Task 1.3 will call inside renderUI.execute.
// ---------------------------------------------------------------------------

describe('validateElementProps — valid props pass', () => {
  it('accepts a well-formed Heading', () => {
    const result = validateElementProps('Heading', { level: 2, text: 'Section' });
    expect(result.success).toBe(true);
  });

  it('accepts Callout with all required props', () => {
    const result = validateElementProps('Callout', { tone: 'success', text: 'Saved!' });
    expect(result.success).toBe(true);
  });

  it('accepts Divider with empty props', () => {
    const result = validateElementProps('Divider', {});
    expect(result.success).toBe(true);
  });

  it('accepts a Select with valid options', () => {
    const result = validateElementProps('Select', {
      name: 'colour',
      options: [
        { value: 'red', label: 'Red' },
        { value: 'blue', label: 'Blue' },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('validateElementProps — invalid props fail', () => {
  it('rejects Heading with level 5 (out-of-range union)', () => {
    const result = validateElementProps('Heading', { level: 5, text: 'Bad heading' });
    expect(result.success).toBe(false);
    expect((result as { error: unknown }).error).toBeDefined();
  });

  it('rejects Callout with unknown tone "error"', () => {
    const result = validateElementProps('Callout', { tone: 'error', text: 'Something went wrong' });
    expect(result.success).toBe(false);
    expect((result as { error: unknown }).error).toBeDefined();
  });

  it('rejects Button with unknown variant "danger"', () => {
    // Valid variants are primary|secondary|ghost|destructive — "danger" is not one
    const result = validateElementProps('Button', { label: 'Delete', variant: 'danger' });
    expect(result.success).toBe(false);
    expect((result as { error: unknown }).error).toBeDefined();
  });

  it('rejects Select with empty options array (min(1) violated)', () => {
    const result = validateElementProps('Select', { name: 'colour', options: [] });
    expect(result.success).toBe(false);
    expect((result as { error: unknown }).error).toBeDefined();
  });

  it('rejects Heading missing required "text" field', () => {
    const result = validateElementProps('Heading', { level: 1 });
    expect(result.success).toBe(false);
    expect((result as { error: unknown }).error).toBeDefined();
  });

  it('rejects an unknown component name', () => {
    const result = validateElementProps('VideoPlayer', {});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// catalogPrompt smoke test
// ---------------------------------------------------------------------------

describe('catalogPrompt', () => {
  it('is a non-empty string', () => {
    expect(typeof catalogPrompt).toBe('string');
    expect(catalogPrompt.length).toBeGreaterThan(0);
  });

  it('mentions every registered component name', () => {
    for (const name of catalog.componentNames) {
      expect(catalogPrompt).toContain(name);
    }
  });
});
