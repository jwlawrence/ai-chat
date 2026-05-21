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
      props: { title: 'Welcome' },
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
      props: { tone: 'info', title: 'Note', text: 'Action wiring is not yet supported.' },
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
// URL validator — Fix #1: Image.src and Link.href reject javascript: URLs
// ---------------------------------------------------------------------------

describe('URL validators — http(s) enforcement', () => {
  it('Image.src accepts a valid https URL', () => {
    const result = validateElementProps('Image', {
      src: 'https://example.com/img.png',
      alt: 'A photo',
    });
    expect(result.success).toBe(true);
  });

  it('Image.src rejects a javascript: URL', () => {
    const result = validateElementProps('Image', {
      src: 'javascript:alert(1)',
      alt: 'XSS attempt',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBeDefined();
  });

  it('Link.href accepts a valid https URL', () => {
    const result = validateElementProps('Link', {
      href: 'https://example.com',
      text: 'Visit',
    });
    expect(result.success).toBe(true);
  });

  it('Link.href rejects a javascript: URL', () => {
    const result = validateElementProps('Link', {
      href: 'javascript:alert(1)',
      text: 'Click me',
    });
    expect(result.success).toBe(false);
    if (result.success) return;
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
    if (result.success) return; // narrow the discriminated union
    expect(result.error.issues[0].path).toEqual(['level']);
  });

  it('rejects Callout with unknown tone "error"', () => {
    const result = validateElementProps('Callout', { tone: 'error', text: 'Something went wrong' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBeDefined();
  });

  it('rejects Button with unknown variant "danger"', () => {
    // Valid variants are primary|secondary|ghost|destructive — "danger" is not one
    const result = validateElementProps('Button', { label: 'Delete', variant: 'danger' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBeDefined();
  });

  it('rejects Select with empty options array (min(1) violated)', () => {
    const result = validateElementProps('Select', { name: 'colour', options: [] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBeDefined();
  });

  it('rejects Heading missing required "text" field', () => {
    const result = validateElementProps('Heading', { level: 1 });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0].path).toEqual(['text']);
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

  it('catalogPrompt fits within ~10 KB', () => {
    // catalogPrompt is appended to the renderUI tool description on every chat
    // turn. Phase 1 produced ~3.6 KB; Phase 2 added local-action docs (on.press,
    // visible, state, a worked example) which grew it to ~6.5 KB. The bound is
    // set to ~1.5x the current size to catch accidental regressions without
    // flaking on minor wording tweaks. Still well below the old ~12 KB baseline.
    expect(catalogPrompt.length).toBeLessThan(10_000);
  });
});
