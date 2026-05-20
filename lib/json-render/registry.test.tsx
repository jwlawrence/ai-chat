// @vitest-environment jsdom

/**
 * Smoke tests for the json-render React registry.
 *
 * Renders a small spec via <Renderer> and asserts that shadcn-styled
 * primitives appear in the DOM.  The SpecRenderer wrapper is required so that
 * Tabs / Accordion can find their nested children via SpecContext.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { Renderer, JSONUIProvider } from '@json-render/react';
import type { Spec } from '@json-render/core';

import { registry, SpecRenderer } from '@/lib/json-render/registry';

// ---------------------------------------------------------------------------
// Helper: render a spec wrapped in all required providers
// ---------------------------------------------------------------------------

function renderSpec(spec: Spec) {
  return render(
    <JSONUIProvider registry={registry}>
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
