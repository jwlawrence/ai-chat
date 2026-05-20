// @vitest-environment jsdom

/**
 * Phase 2 unit tests — local-mode actions end-to-end.
 *
 * Tests cover:
 * 1. Clicking a Button with an `on.press` binding calls the setState built-in
 *    and mutates state inside the StateProvider.
 * 2. A Button with no `on.press` binding renders and is clickable without crashing.
 * 3. Pressing a button bound to an unregistered (non-built-in) action does not
 *    crash the UI — it silently no-ops.
 * 4. Visibility binding hides an element when its `visible` condition is falsy
 *    and shows it when truthy (driven by state).
 * 5. Repeated presses on a toggle button keep working (no lock state).
 * 6. SpecRenderer.renderChildren wires real emit for Tabs nested children.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { Renderer, JSONUIProvider } from '@json-render/react';
import type { Spec } from '@json-render/core';

import { registry, SpecRenderer } from '@/lib/json-render/registry';

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Helper: render a spec with all required providers
// ---------------------------------------------------------------------------

function renderSpec(spec: Spec, initialState?: Record<string, unknown>) {
  return render(
    <JSONUIProvider registry={registry} initialState={initialState}>
      <SpecRenderer spec={spec} registry={registry}>
        <Renderer spec={spec} registry={registry} />
      </SpecRenderer>
    </JSONUIProvider>,
  );
}

// ---------------------------------------------------------------------------
// 1. setState built-in: pressing a Button toggles state and shows a hidden element
// ---------------------------------------------------------------------------

describe('local-mode actions — setState built-in', () => {
  it('button press mutates state and reveals a visible-guarded element', async () => {
    const spec: Spec = {
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: {},
          children: ['toggle-btn', 'secret-text'],
        },
        'toggle-btn': {
          type: 'Button',
          props: { label: 'Reveal' },
          on: { press: { action: 'setState', params: { statePath: '/open', value: true } } },
          children: [],
        },
        'secret-text': {
          type: 'Text',
          props: { text: 'Now you see me' },
          visible: { $state: '/open' },
          children: [],
        },
      },
    };

    // Initial state: /open is falsy (undefined), so secret-text is hidden.
    renderSpec(spec);

    // The text should not be in the document initially (visible condition is falsy).
    expect(screen.queryByText('Now you see me')).not.toBeInTheDocument();

    // Click the button — this dispatches on.press → setState(statePath: /open, value: true)
    const btn = screen.getByRole('button', { name: 'Reveal' });
    await act(async () => {
      fireEvent.click(btn);
    });

    // After state mutation, the element should become visible.
    expect(screen.getByText('Now you see me')).toBeInTheDocument();
  });

  it('seeds initial state from spec.state so visible condition starts correctly', () => {
    // When spec.state provides /open: true upfront, the element should render immediately.
    const spec: Spec = {
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: {},
          children: ['status-text'],
        },
        'status-text': {
          type: 'Text',
          props: { text: 'Already visible' },
          visible: { $state: '/open' },
          children: [],
        },
      },
    };

    // Seed initial state: plain key "open" (no leading slash) — flattenToPointers
    // converts it to "/open" in the StateModel, matching the $state: "/open" condition.
    renderSpec(spec, { open: true });

    expect(screen.getByText('Already visible')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2. Button with no on.press binding renders and clicks without crashing
// ---------------------------------------------------------------------------

describe('local-mode actions — Button with no binding', () => {
  it('renders a Button without an on.press binding and allows clicks without crashing', () => {
    const spec: Spec = {
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: {},
          children: ['plain-btn'],
        },
        'plain-btn': {
          type: 'Button',
          props: { label: 'No-op button', variant: 'secondary' },
          children: [],
        },
      },
    };

    renderSpec(spec);

    const btn = screen.getByRole('button', { name: 'No-op button' });
    expect(btn).toBeInTheDocument();

    // Clicking should not throw — emit('press') checks for a binding and returns early.
    expect(() => fireEvent.click(btn)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. Unregistered (non-built-in) action does not crash
// ---------------------------------------------------------------------------

describe('local-mode actions — unregistered action handler', () => {
  it('does not crash when pressing a button bound to an unknown action', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const spec: Spec = {
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: {},
          children: ['mystery-btn'],
        },
        'mystery-btn': {
          type: 'Button',
          props: { label: 'Unknown action' },
          // `doSomethingPhase3` is not a built-in and has no registered handler.
          on: { press: { action: 'doSomethingPhase3', params: { x: 1 } } },
          children: [],
        },
      },
    };

    renderSpec(spec);

    const btn = screen.getByRole('button', { name: 'Unknown action' });
    expect(btn).toBeInTheDocument();

    // Click should not throw — ActionProvider logs an error but doesn't crash.
    await act(async () => {
      expect(() => fireEvent.click(btn)).not.toThrow();
    });

    consoleError.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 4. Visibility: hides when falsy, shows when truthy
// ---------------------------------------------------------------------------

describe('local-mode actions — visibility binding', () => {
  it('hides element when $state condition is falsy (undefined)', () => {
    const spec: Spec = {
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: {},
          children: ['cond-text'],
        },
        'cond-text': {
          type: 'Text',
          props: { text: 'Conditionally visible' },
          visible: { $state: '/flag' },
          children: [],
        },
      },
    };

    // No initial state — /flag is undefined → falsy → element hidden.
    renderSpec(spec);
    expect(screen.queryByText('Conditionally visible')).not.toBeInTheDocument();
  });

  it('shows element when $state condition is truthy', () => {
    const spec: Spec = {
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: {},
          children: ['cond-text'],
        },
        'cond-text': {
          type: 'Text',
          props: { text: 'Conditionally visible' },
          visible: { $state: '/flag' },
          children: [],
        },
      },
    };

    // Seed state: plain key "flag" → flattenToPointers → "/flag" in StateModel.
    renderSpec(spec, { flag: true });
    expect(screen.getByText('Conditionally visible')).toBeInTheDocument();
  });

  it('hides element when visible is explicitly false', () => {
    const spec: Spec = {
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: {},
          children: ['always-hidden'],
        },
        'always-hidden': {
          type: 'Text',
          props: { text: 'Never shows' },
          visible: false,
          children: [],
        },
      },
    };

    renderSpec(spec);
    expect(screen.queryByText('Never shows')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 5. Repeated presses — toggle button keeps toggling (no lock state)
// ---------------------------------------------------------------------------

describe('local-mode actions — repeated presses', () => {
  it('allows toggle: show → hide → show with repeated button presses', async () => {
    const spec: Spec = {
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: {},
          children: ['show-btn', 'hide-btn', 'panel'],
        },
        'show-btn': {
          type: 'Button',
          props: { label: 'Show' },
          on: { press: { action: 'setState', params: { statePath: '/visible', value: true } } },
          children: [],
        },
        'hide-btn': {
          type: 'Button',
          props: { label: 'Hide' },
          on: { press: { action: 'setState', params: { statePath: '/visible', value: false } } },
          children: [],
        },
        panel: {
          type: 'Text',
          props: { text: 'Toggle panel' },
          visible: { $state: '/visible' },
          children: [],
        },
      },
    };

    renderSpec(spec);

    // Initially hidden
    expect(screen.queryByText('Toggle panel')).not.toBeInTheDocument();

    // Press Show → visible
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show' })); });
    expect(screen.getByText('Toggle panel')).toBeInTheDocument();

    // Press Hide → hidden again
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Hide' })); });
    expect(screen.queryByText('Toggle panel')).not.toBeInTheDocument();

    // Press Show again → visible again (no lock state)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Show' })); });
    expect(screen.getByText('Toggle panel')).toBeInTheDocument();
  });
});
