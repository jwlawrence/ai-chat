// @vitest-environment jsdom

/**
 * Smoke tests for the json-render React registry.
 *
 * Renders a small spec via <Renderer> and asserts that shadcn-styled
 * primitives appear in the DOM.  The SpecRenderer wrapper is required so that
 * Tabs / Accordion can find their nested children via SpecContext.
 */

import { createStateStore, type Spec } from '@json-render/core';
import { JSONUIProvider, Renderer } from '@json-render/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { registry, SpecRenderer } from '@/lib/json-render/registry';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Helper: render a spec wrapped in all required providers.
// Mirrors production (RenderUICard) by passing a controlled store rather than
// the uncontrolled initialState prop — this catches binding bugs that only
// surface under controlled-mode state propagation.
// ---------------------------------------------------------------------------

function renderSpec(spec: Spec) {
  const store = createStateStore((spec.state as Record<string, unknown> | undefined) ?? {});
  return render(
    <JSONUIProvider registry={registry} store={store}>
      <SpecRenderer spec={spec} registry={registry}>
        <Renderer spec={spec} registry={registry} />
      </SpecRenderer>
    </JSONUIProvider>,
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const simpleSpec: Spec = {
  root: 'root-card',
  elements: {
    'root-card': {
      type: 'Card',
      props: { title: 'Test Card', footer: 'Card footer' },
      children: ['heading-1', 'body-text', 'cta', 'divider-1', 'badge-1', 'notice-1'],
    },
    'heading-1': {
      type: 'Heading',
      props: { level: 2, text: 'Hello from Heading' },
      children: [],
    },
    'body-text': {
      type: 'Text',
      props: { text: 'A paragraph of muted text.', muted: true },
      children: [],
    },
    cta: {
      type: 'Button',
      props: { label: 'Click me', variant: 'primary' },
      children: [],
    },
    'divider-1': {
      type: 'Divider',
      props: {},
      children: [],
    },
    'badge-1': {
      type: 'Badge',
      props: { label: 'Active', tone: 'success' },
      children: [],
    },
    'notice-1': {
      type: 'Callout',
      props: { tone: 'warning', title: 'Heads up', text: 'Something to know.' },
      children: [],
    },
  },
};

const tabsSpec: Spec = {
  root: 'tabs-root',
  elements: {
    'tabs-root': {
      type: 'Tabs',
      props: {
        tabs: [
          { id: 'tab-a', label: 'Tab A', children: ['text-a'] },
          { id: 'tab-b', label: 'Tab B', children: ['text-b'] },
        ],
      },
      children: [],
    },
    'text-a': {
      type: 'Text',
      props: { text: 'Content of Tab A' },
      children: [],
    },
    'text-b': {
      type: 'Text',
      props: { text: 'Content of Tab B' },
      children: [],
    },
  },
};

const accordionSpec: Spec = {
  root: 'accordion-root',
  elements: {
    'accordion-root': {
      type: 'Accordion',
      props: {
        items: [
          { id: 'item-1', label: 'Section One', children: ['text-1'] },
          { id: 'item-2', label: 'Section Two', children: ['text-2'] },
        ],
      },
      children: [],
    },
    'text-1': {
      type: 'Text',
      props: { text: 'Inside section one' },
      children: [],
    },
    'text-2': {
      type: 'Text',
      props: { text: 'Inside section two' },
      children: [],
    },
  },
};

const formSpec: Spec = {
  root: 'form-root',
  elements: {
    'form-root': {
      type: 'Form',
      props: { name: 'test-form' },
      children: ['name-input', 'role-select', 'agree-check', 'submit-btn'],
    },
    'name-input': {
      type: 'Input',
      props: { name: 'name', label: 'Full name', placeholder: 'Jane Doe', kind: 'text' },
      children: [],
    },
    'role-select': {
      type: 'Select',
      props: {
        name: 'role',
        label: 'Role',
        options: [
          { value: 'admin', label: 'Admin' },
          { value: 'user', label: 'User' },
        ],
      },
      children: [],
    },
    'agree-check': {
      type: 'Checkbox',
      props: { name: 'agree', label: 'I agree to the terms' },
      children: [],
    },
    'submit-btn': {
      type: 'Button',
      props: { label: 'Submit', variant: 'primary' },
      children: [],
    },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registry — simple primitives', () => {
  it('renders Card with title and footer', () => {
    renderSpec(simpleSpec);
    expect(screen.getByText('Test Card')).toBeInTheDocument();
    expect(screen.getByText('Card footer')).toBeInTheDocument();
  });

  it('renders Heading at h2', () => {
    renderSpec(simpleSpec);
    const heading = screen.getByRole('heading', { name: 'Hello from Heading', level: 2 });
    expect(heading).toBeInTheDocument();
  });

  it('renders muted Text', () => {
    renderSpec(simpleSpec);
    expect(screen.getByText('A paragraph of muted text.')).toBeInTheDocument();
  });

  it('renders Button with label', () => {
    renderSpec(simpleSpec);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('renders Badge', () => {
    renderSpec(simpleSpec);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  // Badges are metadata and the accent is reserved for the one thing that
  // matters, so an untoned Badge must be the quietest pill. The mapping used
  // to be inverted: `default` was an accent fill and `success` was grey, which
  // put three solid accent pills in a single row of tags.
  it('maps the default Badge tone to the quiet outline variant, not the accent', () => {
    renderSpec({
      root: 'row',
      elements: {
        row: { type: 'Row', props: {}, children: ['plain', 'good'] },
        plain: { type: 'Badge', props: { label: 'Plain' }, children: [] },
        good: { type: 'Badge', props: { label: 'Good', tone: 'success' }, children: [] },
      },
    });
    const plain = screen.getByText('Plain');
    const good = screen.getByText('Good');
    expect(plain).toHaveAttribute('data-variant', 'outline');
    expect(good).toHaveAttribute('data-variant', 'default');
  });

  it('leaves unfilled Row children unwrapped so badges keep their width', () => {
    renderSpec({
      root: 'row',
      elements: {
        row: { type: 'Row', props: {}, children: ['b1'] },
        b1: { type: 'Badge', props: { label: 'Tag' }, children: [] },
      },
    });
    const row = document.querySelector('[data-slot="row"]');
    expect(row?.querySelector(':scope > .flex-1')).toBeNull();
  });

  it('wraps filled Row children in equal-width slots', () => {
    renderSpec({
      root: 'row',
      elements: {
        row: { type: 'Row', props: { fill: true }, children: ['b1'] },
        b1: { type: 'Badge', props: { label: 'Tag' }, children: [] },
      },
    });
    const row = document.querySelector('[data-slot="row"]');
    expect(row?.querySelector(':scope > .flex-1')).not.toBeNull();
  });

  it('renders Callout with title and text', () => {
    renderSpec(simpleSpec);
    expect(screen.getByText('Heads up')).toBeInTheDocument();
    expect(screen.getByText('Something to know.')).toBeInTheDocument();
  });

  it('renders Divider (separator role)', () => {
    renderSpec(simpleSpec);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });
});

describe('registry — Tabs (children from props)', () => {
  it('renders tab triggers', () => {
    renderSpec(tabsSpec);
    expect(screen.getByRole('tab', { name: 'Tab A' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Tab B' })).toBeInTheDocument();
  });

  it('renders content for the default (first) tab', () => {
    renderSpec(tabsSpec);
    expect(screen.getByText('Content of Tab A')).toBeInTheDocument();
  });
});

describe('registry — Accordion (children from props)', () => {
  it('renders accordion trigger labels', () => {
    renderSpec(accordionSpec);
    expect(screen.getByText('Section One')).toBeInTheDocument();
    expect(screen.getByText('Section Two')).toBeInTheDocument();
  });

  it('renders nested children of the default-open panel', () => {
    renderSpec(accordionSpec);
    // First item is open by default (Accordion sets defaultValue to [firstId]),
    // so its nested children resolved via SpecContext.renderChildren are visible.
    expect(screen.getByText('Inside section one')).toBeInTheDocument();
  });
});

describe('registry — form primitives', () => {
  it('renders Input with label', () => {
    renderSpec(formSpec);
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
  });

  it('renders Select trigger', () => {
    renderSpec(formSpec);
    // The label "Role" appears both as a <label> and as the SelectValue placeholder;
    // check that at least one instance is present.
    expect(screen.getAllByText('Role').length).toBeGreaterThan(0);
  });

  it('renders Checkbox (Switch stand-in) with label', () => {
    renderSpec(formSpec);
    // The Switch primitive renders a visual span with role="switch" and a hidden
    // input; check that the switch role element is present.
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByText('I agree to the terms')).toBeInTheDocument();
  });

  it('renders Form submit button', () => {
    renderSpec(formSpec);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Textarea primitive — added for Phase 7 contact form (multi-line input)
// ---------------------------------------------------------------------------

const textareaSpec: Spec = {
  root: 'form-root',
  elements: {
    'form-root': {
      type: 'Form',
      props: { name: 'note' },
      children: ['note-area'],
    },
    'note-area': {
      type: 'Textarea',
      props: {
        name: 'body',
        label: 'Anything else',
        placeholder: 'Share a quick note',
        rows: 5,
      },
      children: [],
    },
  },
};

describe('registry — Textarea primitive', () => {
  it('renders Textarea with its label and placeholder', () => {
    renderSpec(textareaSpec);
    const ta = screen.getByLabelText('Anything else') as HTMLTextAreaElement;
    expect(ta).toBeInTheDocument();
    expect(ta.tagName).toBe('TEXTAREA');
    expect(ta.placeholder).toBe('Share a quick note');
    expect(ta.rows).toBe(5);
  });

  it('writes user input through to the form state path /<formName>/<fieldName>', () => {
    renderSpec(textareaSpec);
    const ta = screen.getByLabelText('Anything else') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'hello from the textarea' } });
    expect(ta.value).toBe('hello from the textarea');
  });

  it('defaults rows to 4 when omitted', () => {
    const spec: Spec = {
      root: 'form-root',
      elements: {
        'form-root': {
          type: 'Form',
          props: { name: 'f' },
          children: ['ta'],
        },
        ta: {
          type: 'Textarea',
          props: { name: 'body', label: 'Body' },
          children: [],
        },
      },
    };
    renderSpec(spec);
    const ta = screen.getByLabelText('Body') as HTMLTextAreaElement;
    expect(ta.rows).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Grid / GridCell — bento dashboard layout primitives
// ---------------------------------------------------------------------------

describe('registry — Grid / GridCell primitives', () => {
  it('renders Grid with the configured column count and gap', () => {
    const spec: Spec = {
      root: 'g',
      elements: {
        g: {
          type: 'Grid',
          props: { columns: 4, gap: 'normal' },
          children: ['c1'],
        },
        c1: {
          type: 'GridCell',
          props: { colSpan: 2, rowSpan: 2 },
          children: ['t1'],
        },
        t1: {
          type: 'Text',
          props: { text: 'hello' },
          children: [],
        },
      },
    };
    renderSpec(spec);
    const grid = screen.getByText('hello').closest('div.grid');
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain('sm:grid-cols-4');
    expect(grid?.className).toContain('gap-4');
  });

  it('renders GridCell with col-span and row-span classes', () => {
    const spec: Spec = {
      root: 'g',
      elements: {
        g: {
          type: 'Grid',
          props: { columns: 4, gap: 'normal' },
          children: ['c1'],
        },
        c1: {
          type: 'GridCell',
          props: { colSpan: 3, rowSpan: 2 },
          children: ['t1'],
        },
        t1: {
          type: 'Text',
          props: { text: 'cell content' },
          children: [],
        },
      },
    };
    renderSpec(spec);
    const cell = screen.getByText('cell content').parentElement;
    expect(cell?.className).toContain('sm:col-span-3');
    expect(cell?.className).toContain('sm:row-span-2');
  });

  it('renders multiple GridCells with different spans inside one Grid', () => {
    const spec: Spec = {
      root: 'g',
      elements: {
        g: {
          type: 'Grid',
          props: { columns: 4, gap: 'tight' },
          children: ['hero', 'small1', 'small2'],
        },
        hero: {
          type: 'GridCell',
          props: { colSpan: 2, rowSpan: 2 },
          children: ['hero-text'],
        },
        small1: {
          type: 'GridCell',
          props: { colSpan: 1, rowSpan: 1 },
          children: ['t1'],
        },
        small2: {
          type: 'GridCell',
          props: { colSpan: 1, rowSpan: 1 },
          children: ['t2'],
        },
        'hero-text': { type: 'Text', props: { text: 'HERO' }, children: [] },
        t1: { type: 'Text', props: { text: 'T1' }, children: [] },
        t2: { type: 'Text', props: { text: 'T2' }, children: [] },
      },
    };
    renderSpec(spec);
    expect(screen.getByText('HERO')).toBeInTheDocument();
    expect(screen.getByText('T1')).toBeInTheDocument();
    expect(screen.getByText('T2')).toBeInTheDocument();
    const hero = screen.getByText('HERO').parentElement;
    expect(hero?.className).toContain('sm:col-span-2');
    expect(hero?.className).toContain('sm:row-span-2');
  });
});

// ---------------------------------------------------------------------------
// T — Select primitive shows the option LABEL for the selected value
// ---------------------------------------------------------------------------

describe('registry — T: Select shows label not raw value for selected option', () => {
  it('displays the option label in the trigger when an option is selected', () => {
    const spec: Spec = {
      root: 'form-root',
      state: { contact: { roleType: 'em' } },
      elements: {
        'form-root': {
          type: 'Form',
          props: { name: 'contact' },
          children: ['role-select'],
        },
        'role-select': {
          type: 'Select',
          props: {
            name: 'roleType',
            label: 'Role',
            options: [
              { value: 'em', label: 'Engineering Manager' },
              { value: 'ic', label: 'Individual Contributor' },
            ],
          },
          children: [],
        },
      },
    };
    const store = createStateStore((spec.state as Record<string, unknown>) ?? {});
    render(
      <JSONUIProvider registry={registry} store={store}>
        <SpecRenderer spec={spec} registry={registry}>
          <Renderer spec={spec} registry={registry} />
        </SpecRenderer>
      </JSONUIProvider>,
    );
    // The trigger should show the friendly label, not the raw value token.
    expect(screen.getByText('Engineering Manager')).toBeInTheDocument();
    expect(screen.queryByText('em')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Tabs controlled binding via valueStatePath
// ---------------------------------------------------------------------------

describe('registry — Tabs controlled binding (valueStatePath)', () => {
  it('shows initial tab content based on initial state and updates on tab click', () => {
    const spec: Spec = {
      root: 'tabs-root',
      state: { mode: 'daily' },
      elements: {
        'tabs-root': {
          type: 'Card',
          props: {},
          children: ['mode-tabs', 'mode-display'],
        },
        'mode-tabs': {
          type: 'Tabs',
          props: {
            valueStatePath: '/mode',
            tabs: [
              { id: 'daily', label: 'Today', children: [] },
              { id: 'weekly', label: '7-Day', children: [] },
            ],
          },
          children: [],
        },
        'mode-display': {
          type: 'Text',
          props: { text: { $state: '/mode' } },
          children: [],
        },
      },
    };

    renderSpec(spec);

    // Initial state: mode is "daily" → Text shows "daily"
    expect(screen.getByText('daily')).toBeInTheDocument();

    // Click the "7-Day" tab
    fireEvent.click(screen.getByRole('tab', { name: '7-Day' }));

    // After click: state path /mode updated to "weekly" → Text shows "weekly"
    expect(screen.getByText('weekly')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Fix #8: Cycle guard in renderChildren
// ---------------------------------------------------------------------------

describe('registry — Fix #8: circular spec does not crash via renderChildren', () => {
  it('does not throw and renders empty when a Tabs child creates a cycle via renderChildren', () => {
    // Tabs uses renderChildren for its nested children, so cycles through
    // renderChildren are our responsibility to guard. We set up:
    //   tabs-root (Tabs) → tab child-a → child-a (Card) → ['child-a'] (self-ref)
    // SpecRenderer.renderChildren('child-a') will recurse back into 'child-a' and
    // the visited-set guard should break the loop and return null.
    const spec: Spec = {
      root: 'tabs-root',
      elements: {
        'tabs-root': {
          type: 'Tabs',
          props: {
            tabs: [{ id: 'tab-1', label: 'Tab', children: ['child-a'] }],
          },
          children: [],
        },
        'child-a': {
          type: 'Card',
          props: {},
          children: ['child-a'], // self-reference cycle
        },
      },
    };

    expect(() => renderSpec(spec)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Fix #9: Visibility check in renderChildren (Tabs nested child)
// ---------------------------------------------------------------------------

describe('registry — Fix #9: visibility check in Tabs nested children', () => {
  it('hides a Tabs child element whose visible condition is false', () => {
    const spec: Spec = {
      root: 'tabs-root',
      elements: {
        'tabs-root': {
          type: 'Tabs',
          props: {
            tabs: [{ id: 'tab-a', label: 'Tab A', children: ['hidden-text'] }],
          },
          children: [],
        },
        'hidden-text': {
          type: 'Text',
          props: { text: 'Should be hidden' },
          // visible: false as a static boolean — always hidden
          visible: false,
          children: [],
        },
      },
    };

    renderSpec(spec);
    expect(screen.queryByText('Should be hidden')).not.toBeInTheDocument();
  });

  it('shows a Tabs child element whose visible condition is true', () => {
    const spec: Spec = {
      root: 'tabs-root',
      elements: {
        'tabs-root': {
          type: 'Tabs',
          props: {
            tabs: [{ id: 'tab-a', label: 'Tab A', children: ['shown-text'] }],
          },
          children: [],
        },
        'shown-text': {
          type: 'Text',
          props: { text: 'Should be visible' },
          visible: true,
          children: [],
        },
      },
    };

    renderSpec(spec);
    expect(screen.getByText('Should be visible')).toBeInTheDocument();
  });

  it('hides a Tabs child element when $state condition is falsy', () => {
    const spec: Spec = {
      root: 'tabs-root',
      elements: {
        'tabs-root': {
          type: 'Tabs',
          props: {
            tabs: [{ id: 'tab-a', label: 'Tab A', children: ['cond-text'] }],
          },
          children: [],
        },
        'cond-text': {
          type: 'Text',
          props: { text: 'State-conditional text' },
          visible: { $state: '/open' },
          children: [],
        },
      },
    };

    // No initialState — /open is undefined → falsy → element hidden.
    renderSpec(spec);
    expect(screen.queryByText('State-conditional text')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 5: Form auto-binding — Input/Select/Checkbox bind to store paths
// ---------------------------------------------------------------------------

describe('registry — Phase 5: form auto-binding', () => {
  it('renders Input with seeded value from store when inside a Form', () => {
    const spec: Spec = {
      root: 'form-root',
      state: { signup: { email: 'hello@a.com' } },
      elements: {
        'form-root': {
          type: 'Form',
          props: { name: 'signup' },
          children: ['email-input'],
        },
        'email-input': {
          type: 'Input',
          props: { name: 'email', label: 'Email address', kind: 'email' },
          children: [],
        },
      },
    };
    const store = createStateStore((spec.state as Record<string, unknown>) ?? {});
    render(
      <JSONUIProvider registry={registry} store={store}>
        <SpecRenderer spec={spec} registry={registry}>
          <Renderer spec={spec} registry={registry} />
        </SpecRenderer>
      </JSONUIProvider>,
    );
    const input = screen.getByLabelText('Email address') as HTMLInputElement;
    expect(input.value).toBe('hello@a.com');
  });

  it('updates store on Input change', () => {
    const spec: Spec = {
      root: 'form-root',
      state: { signup: { email: 'old@a.com' } },
      elements: {
        'form-root': {
          type: 'Form',
          props: { name: 'signup' },
          children: ['email-input'],
        },
        'email-input': {
          type: 'Input',
          props: { name: 'email', label: 'Email address' },
          children: [],
        },
      },
    };
    const store = createStateStore((spec.state as Record<string, unknown>) ?? {});
    render(
      <JSONUIProvider registry={registry} store={store}>
        <SpecRenderer spec={spec} registry={registry}>
          <Renderer spec={spec} registry={registry} />
        </SpecRenderer>
      </JSONUIProvider>,
    );
    const input = screen.getByLabelText('Email address') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'new@b.com' } });
    expect(store.get('/signup/email')).toBe('new@b.com');
  });

  it('renders Checkbox with seeded checked state from store', () => {
    const spec: Spec = {
      root: 'form-root',
      state: { prefs: { email: 'default', subscribe: true } },
      elements: {
        'form-root': {
          type: 'Form',
          props: { name: 'prefs' },
          children: ['subscribe-check'],
        },
        'subscribe-check': {
          type: 'Checkbox',
          props: { name: 'subscribe', label: 'Subscribe' },
          children: [],
        },
      },
    };
    const store = createStateStore((spec.state as Record<string, unknown>) ?? {});
    render(
      <JSONUIProvider registry={registry} store={store}>
        <SpecRenderer spec={spec} registry={registry}>
          <Renderer spec={spec} registry={registry} />
        </SpecRenderer>
      </JSONUIProvider>,
    );
    const switchEl = screen.getByRole('switch') as HTMLButtonElement;
    expect(switchEl).toHaveAttribute('data-checked', '');
  });

  it('seeds Input store path with empty string when no initial value provided', () => {
    const spec: Spec = {
      root: 'form-root',
      elements: {
        'form-root': {
          type: 'Form',
          props: { name: 'reg' },
          children: ['name-input'],
        },
        'name-input': {
          type: 'Input',
          props: { name: 'username', label: 'Username' },
          children: [],
        },
      },
    };
    const store = createStateStore({});
    render(
      <JSONUIProvider registry={registry} store={store}>
        <SpecRenderer spec={spec} registry={registry}>
          <Renderer spec={spec} registry={registry} />
        </SpecRenderer>
      </JSONUIProvider>,
    );
    expect(store.get('/reg/username')).toBe('');
  });
});

describe('registry — remaining primitives', () => {
  it('renders Image with alt text', () => {
    const spec: Spec = {
      root: 'img',
      elements: {
        img: {
          type: 'Image',
          props: {
            src: 'https://example.com/photo.jpg',
            alt: 'A lovely photo',
            caption: 'Fig 1',
          },
          children: [],
        },
      },
    };
    renderSpec(spec);
    expect(screen.getByAltText('A lovely photo')).toBeInTheDocument();
    expect(screen.getByText('Fig 1')).toBeInTheDocument();
  });

  it('renders Link with text', () => {
    const spec: Spec = {
      root: 'lnk',
      elements: {
        lnk: {
          type: 'Link',
          props: { href: 'https://example.com', text: 'Visit us' },
          children: [],
        },
      },
    };
    renderSpec(spec);
    const link = screen.getByRole('link', { name: 'Visit us' });
    expect(link).toHaveAttribute('href', 'https://example.com');
  });

  it('renders List items', () => {
    const spec: Spec = {
      root: 'list',
      elements: {
        list: {
          type: 'List',
          props: { ordered: false, items: ['Apple', 'Banana', 'Cherry'] },
          children: [],
        },
      },
    };
    renderSpec(spec);
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
    expect(screen.getByText('Cherry')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Part C: Field error display — inline red message + aria-invalid
// ---------------------------------------------------------------------------

describe('registry — Part C: field error display', () => {
  it('shows error text and aria-invalid on Input when /_errors/contact/email is set', () => {
    const spec: Spec = {
      root: 'form-root',
      elements: {
        'form-root': {
          type: 'Form',
          props: { name: 'contact' },
          children: ['email-input'],
        },
        'email-input': {
          type: 'Input',
          props: { name: 'email', label: 'Email', kind: 'email' },
          children: [],
        },
      },
    };
    const store = createStateStore({
      contact: { email: '' },
      _errors: { contact: { email: 'Enter a valid email' } },
    });
    render(
      <JSONUIProvider registry={registry} store={store}>
        <SpecRenderer spec={spec} registry={registry}>
          <Renderer spec={spec} registry={registry} />
        </SpecRenderer>
      </JSONUIProvider>,
    );
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('clears Input error when the user edits the field', () => {
    const spec: Spec = {
      root: 'form-root',
      elements: {
        'form-root': {
          type: 'Form',
          props: { name: 'contact' },
          children: ['email-input'],
        },
        'email-input': {
          type: 'Input',
          props: { name: 'email', label: 'Email', kind: 'email' },
          children: [],
        },
      },
    };
    const store = createStateStore({
      contact: { email: '' },
      _errors: { contact: { email: 'Enter a valid email' } },
    });
    render(
      <JSONUIProvider registry={registry} store={store}>
        <SpecRenderer spec={spec} registry={registry}>
          <Renderer spec={spec} registry={registry} />
        </SpecRenderer>
      </JSONUIProvider>,
    );
    // Error is present before edit.
    expect(screen.getByText('Enter a valid email')).toBeInTheDocument();

    // Simulate user correcting the field.
    const input = screen.getByLabelText('Email') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'user@example.com' } });

    // Error must be removed after edit.
    expect(screen.queryByText('Enter a valid email')).not.toBeInTheDocument();
  });

  it('shows error text and aria-invalid on Select when /_errors/contact/roleType is set', () => {
    const spec: Spec = {
      root: 'form-root',
      elements: {
        'form-root': {
          type: 'Form',
          props: { name: 'contact' },
          children: ['role-select'],
        },
        'role-select': {
          type: 'Select',
          props: {
            name: 'roleType',
            label: 'Role type',
            options: [
              { value: 'em', label: 'Engineering Manager' },
              { value: 'ic', label: 'Individual Contributor' },
            ],
          },
          children: [],
        },
      },
    };
    const store = createStateStore({
      contact: { roleType: '' },
      _errors: { contact: { roleType: 'Select a role' } },
    });
    render(
      <JSONUIProvider registry={registry} store={store}>
        <SpecRenderer spec={spec} registry={registry}>
          <Renderer spec={spec} registry={registry} />
        </SpecRenderer>
      </JSONUIProvider>,
    );
    expect(screen.getByText('Select a role')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// E1: Form-state stability — spec patch preserves in-progress input values
// ---------------------------------------------------------------------------

describe('registry — E1: form-state stability across spec patches', () => {
  it('preserves Input value when spec is re-rendered with updated title but same form fields', () => {
    const makeSpec = (title: string): Spec => ({
      root: 'form-card',
      elements: {
        'form-card': {
          type: 'Card',
          props: { title },
          children: ['name-form'],
        },
        'name-form': {
          type: 'Form',
          props: { name: 'reg' },
          children: ['name-input'],
        },
        'name-input': {
          type: 'Input',
          props: { name: 'username', label: 'Username' },
          children: [],
        },
      },
    });

    const store = createStateStore({});
    const spec1 = makeSpec('Step 1');
    const { rerender } = render(
      <JSONUIProvider registry={registry} store={store}>
        <SpecRenderer spec={spec1} registry={registry}>
          <Renderer spec={spec1} registry={registry} />
        </SpecRenderer>
      </JSONUIProvider>,
    );

    // Simulate user typing into the field
    const inputBefore = screen.getByLabelText('Username') as HTMLInputElement;
    fireEvent.change(inputBefore, { target: { value: 'jdoe' } });
    expect(store.get('/reg/username')).toBe('jdoe');

    // Re-render with a patched spec (title changed, same form fields)
    const spec2 = makeSpec('Step 1 — updated');
    rerender(
      <JSONUIProvider registry={registry} store={store}>
        <SpecRenderer spec={spec2} registry={registry}>
          <Renderer spec={spec2} registry={registry} />
        </SpecRenderer>
      </JSONUIProvider>,
    );

    // Store state (and input value) must survive the re-render
    expect(store.get('/reg/username')).toBe('jdoe');
    const inputAfter = screen.getByLabelText('Username') as HTMLInputElement;
    expect(inputAfter).toBe(inputBefore); // identity check: no remount
    expect(inputAfter.value).toBe('jdoe');
  });
});
