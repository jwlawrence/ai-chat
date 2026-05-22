import { describe, expect, it } from 'vitest';
import {
  ACTION_REGISTRY,
  catalog,
  catalogPrompt,
  resolveActionMode,
  validateElementProps,
} from './catalog';

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

  it('catalogPrompt fits within the expected size envelope', () => {
    // catalogPrompt is appended to the renderUI tool description on every chat
    // turn. Phase 1 produced ~3.6 KB; Phase 2 added local-action docs (~8 KB);
    // Phase 3 added model-mode docs (~10 KB); Phase 4 added endpoint section
    // (~12 KB); Phase 4.1 added dynamic-prop section + weather example (~17 KB);
    // Phase 6 added annotated-list pattern (~20.3 KB actual).
    // Bound = actual (~20_325) + 2_000 so a silent doubling would trip this guard.
    expect(catalogPrompt.length).toBeLessThan(22_500);
  });
});

// ---------------------------------------------------------------------------
// Phase 3: action registry + resolveActionMode
// ---------------------------------------------------------------------------

describe('ACTION_REGISTRY + resolveActionMode', () => {
  it('exposes setState as a local-mode built-in', () => {
    expect(ACTION_REGISTRY.has('setState')).toBe(true);
    expect(resolveActionMode('setState')).toBe('local');
  });

  it('exposes sendToModel as a model-mode action', () => {
    expect(ACTION_REGISTRY.has('sendToModel')).toBe(true);
    expect(resolveActionMode('sendToModel')).toBe('model');
  });

  it('returns undefined for unknown action names', () => {
    expect(resolveActionMode('doesntExist')).toBeUndefined();
  });

  it('every registered action declares a Zod params schema', () => {
    for (const [name, def] of ACTION_REGISTRY) {
      expect(def.params, `action "${name}" missing params schema`).toBeDefined();
      // params must be a Zod schema — confirm via safeParse on an empty object
      expect(typeof def.params.safeParse).toBe('function');
    }
  });

  it('catalogPrompt mentions sendToModel and its required label param', () => {
    expect(catalogPrompt).toMatch(/sendToModel/);
    expect(catalogPrompt).toMatch(/label/);
  });
});

// ---------------------------------------------------------------------------
// Phase 4: endpoint-mode action — refreshData
// ---------------------------------------------------------------------------

describe('ACTION_REGISTRY + resolveActionMode — Phase 4: refreshData', () => {
  it('exposes refreshData as an endpoint-mode action', () => {
    expect(ACTION_REGISTRY.has('refreshData')).toBe(true);
    expect(resolveActionMode('refreshData')).toBe('endpoint');
  });

  it('refreshData has a Zod params schema that accepts an empty object', () => {
    const def = ACTION_REGISTRY.get('refreshData');
    expect(def).toBeDefined();
    const result = def?.params.safeParse({});
    expect(result?.success).toBe(true);
  });

  it('catalogPrompt contains an Endpoint section header', () => {
    expect(catalogPrompt).toMatch(/Endpoint/);
  });

  it('catalogPrompt mentions refreshData', () => {
    expect(catalogPrompt).toContain('refreshData');
  });

  it('catalogPrompt still fits within the expected size envelope after Phase 4 endpoint section', () => {
    expect(catalogPrompt.length).toBeLessThan(22_500);
  });
});

// ---------------------------------------------------------------------------
// Phase 4.1: dynamic prop values via $state refs
// ---------------------------------------------------------------------------

describe('validateElementProps — dynamic $state refs', () => {
  it('Text accepts { $state: "/foo" } for text prop', () => {
    const result = validateElementProps('Text', { text: { $state: '/foo' } });
    expect(result.success).toBe(true);
  });

  it('Heading accepts { $state: "/foo" } for text prop (level stays literal)', () => {
    const result = validateElementProps('Heading', { level: 1, text: { $state: '/foo' } });
    expect(result.success).toBe(true);
  });

  it('Button accepts { $state: "/foo" } for label prop', () => {
    const result = validateElementProps('Button', { label: { $state: '/foo' } });
    expect(result.success).toBe(true);
  });

  it('Image rejects { $state: "/foo" } for src prop (URL stays literal)', () => {
    const result = validateElementProps('Image', { src: { $state: '/foo' }, alt: 'x' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 4.1: fetchWeather action registration
// ---------------------------------------------------------------------------

describe('ACTION_REGISTRY — fetchWeather', () => {
  it('exposes fetchWeather as an endpoint-mode action', () => {
    expect(ACTION_REGISTRY.has('fetchWeather')).toBe(true);
    expect(resolveActionMode('fetchWeather')).toBe('endpoint');
  });

  it('fetchWeather params accept daily mode', () => {
    const def = ACTION_REGISTRY.get('fetchWeather');
    expect(def).toBeDefined();
    expect(def?.params.safeParse({ mode: 'daily' }).success).toBe(true);
  });

  it('fetchWeather params accept weekly mode', () => {
    const def = ACTION_REGISTRY.get('fetchWeather');
    expect(def?.params.safeParse({ mode: 'weekly' }).success).toBe(true);
  });

  it('fetchWeather params reject omitted mode (now required)', () => {
    const def = ACTION_REGISTRY.get('fetchWeather');
    expect(def?.params.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tabs valueStatePath schema
// ---------------------------------------------------------------------------

describe('validateElementProps — Tabs valueStatePath', () => {
  const validTabs = [
    { id: 'daily', label: 'Today', children: [] },
    { id: 'weekly', label: '7-Day', children: [] },
  ];

  it('accepts Tabs with valueStatePath and tabs (controlled)', () => {
    const result = validateElementProps('Tabs', { valueStatePath: '/mode', tabs: validTabs });
    expect(result.success).toBe(true);
  });

  it('accepts Tabs without valueStatePath (uncontrolled)', () => {
    const result = validateElementProps('Tabs', { tabs: validTabs });
    expect(result.success).toBe(true);
  });

  it('rejects Tabs when valueStatePath is not a string (e.g. number)', () => {
    const result = validateElementProps('Tabs', { valueStatePath: 5, tabs: validTabs });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fetchWeather mode required
// ---------------------------------------------------------------------------

describe('ACTION_REGISTRY — fetchWeather mode required', () => {
  it('rejects empty params (mode is now required)', () => {
    const def = ACTION_REGISTRY.get('fetchWeather');
    expect(def?.params.safeParse({}).success).toBe(false);
  });

  it('accepts mode: "daily"', () => {
    const def = ACTION_REGISTRY.get('fetchWeather');
    expect(def?.params.safeParse({ mode: 'daily' }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 4.1: catalogPrompt new keywords
// ---------------------------------------------------------------------------

describe('catalogPrompt — Phase 4.1 keywords', () => {
  it('mentions $state', () => {
    expect(catalogPrompt).toContain('$state');
  });

  it('mentions _writeResponseTo', () => {
    expect(catalogPrompt).toContain('_writeResponseTo');
  });

  it('mentions _setPendingAt', () => {
    expect(catalogPrompt).toContain('_setPendingAt');
  });

  it('mentions fetchWeather', () => {
    expect(catalogPrompt).toContain('fetchWeather');
  });

  it('catalogPrompt still fits within the expected size envelope after Phase 4.1 additions', () => {
    expect(catalogPrompt.length).toBeLessThan(22_500);
  });

  it('mentions valueStatePath', () => {
    expect(catalogPrompt).toContain('valueStatePath');
  });

  it('contains the common-mistake warning about on.<event> inside tab items', () => {
    expect(catalogPrompt).toContain('do NOT nest `on.<event>` inside individual tabs[i] entries');
  });
});

// ---------------------------------------------------------------------------
// Phase 5: submitForm action registration + catalog prompt coverage
// ---------------------------------------------------------------------------

describe('ACTION_REGISTRY — Phase 5: submitForm', () => {
  it('exposes submitForm as a model-mode action', () => {
    expect(ACTION_REGISTRY.has('submitForm')).toBe(true);
    expect(resolveActionMode('submitForm')).toBe('model');
  });

  it('submitForm params require formName', () => {
    const def = ACTION_REGISTRY.get('submitForm');
    expect(def).toBeDefined();
    expect(def?.params.safeParse({}).success).toBe(false);
  });

  it('submitForm params accept formName with optional label and message', () => {
    const def = ACTION_REGISTRY.get('submitForm');
    expect(def?.params.safeParse({ formName: 'contact' }).success).toBe(true);
    expect(
      def?.params.safeParse({ formName: 'contact', label: 'Sent', message: 'Hello' }).success,
    ).toBe(true);
  });

  it('submitForm params reject missing formName', () => {
    const def = ACTION_REGISTRY.get('submitForm');
    expect(def?.params.safeParse({ label: 'Go' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// I1 — Nested dynStr refs silently render [object Object]
// ---------------------------------------------------------------------------

describe('validateElementProps — nested $state refs must NOT be accepted (I1)', () => {
  it('rejects Tabs with $state ref in tab label (nested field must be literal)', () => {
    const result = validateElementProps('Tabs', {
      tabs: [{ id: 'x', label: { $state: '/foo' }, children: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts Tabs with literal tab label', () => {
    const result = validateElementProps('Tabs', {
      tabs: [{ id: 'x', label: 'Today', children: [] }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects Accordion with $state ref in item label (nested field must be literal)', () => {
    const result = validateElementProps('Accordion', {
      items: [{ id: 'a', label: { $state: '/foo' }, children: [] }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts Accordion with literal item label', () => {
    const result = validateElementProps('Accordion', {
      items: [{ id: 'a', label: 'Section', children: [] }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects Select with $state ref in option value (nested field must be literal)', () => {
    const result = validateElementProps('Select', {
      name: 'colour',
      options: [{ value: { $state: '/foo' }, label: 'Red' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects Select with $state ref in option label (nested field must be literal)', () => {
    const result = validateElementProps('Select', {
      name: 'colour',
      options: [{ value: 'red', label: { $state: '/bar' } }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts Select with literal option value and label', () => {
    const result = validateElementProps('Select', {
      name: 'colour',
      options: [{ value: 'red', label: 'Red' }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects List with $state ref as a list item element (nested field must be literal)', () => {
    const result = validateElementProps('List', {
      items: [{ $state: '/foo' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts List with literal string items', () => {
    const result = validateElementProps('List', {
      items: ['Apple', 'Banana'],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 6 / B1: annotated-list composition pattern
// ---------------------------------------------------------------------------

describe('catalogPrompt — Phase 6/B1: annotated list pattern', () => {
  it('contains an Annotated lists section', () => {
    expect(catalogPrompt).toContain('Annotated lists');
  });

  it('teaches Badge+Text row composition instead of flat List + Badge', () => {
    expect(catalogPrompt).toContain('Text');
    expect(catalogPrompt).toContain('Badge');
    // The pattern example uses 'row-1' as a text element alongside badge-1
    expect(catalogPrompt).toContain('row-1');
    expect(catalogPrompt).toContain('badge-1');
  });

  it('catalogPrompt size is within expected bound after Phase 6 additions', () => {
    // Actual size after Phase 6 annotated-list addition: ~20_325 bytes.
    // Bound = actual + 2_000 to catch accidental bloat.
    expect(catalogPrompt.length).toBeGreaterThan(19_000);
    expect(catalogPrompt.length).toBeLessThan(22_500);
  });
});

describe('catalogPrompt — Phase 5: form submission section', () => {
  it('mentions submitForm', () => {
    expect(catalogPrompt).toContain('submitForm');
  });

  it('contains the Form submission section header', () => {
    expect(catalogPrompt).toContain('Form submission');
  });

  it('explains auto-binding of fields inside a Form', () => {
    expect(catalogPrompt).toContain('auto-bind');
  });

  it('contains the common-mistake warning about not using $bindState manually', () => {
    expect(catalogPrompt).toContain('$bindState');
    expect(catalogPrompt).toContain('Form auto-binding handles it');
  });

  it('catalogPrompt still fits within the expected size envelope after Phase 5 additions', () => {
    expect(catalogPrompt.length).toBeLessThan(22_500);
  });
});
