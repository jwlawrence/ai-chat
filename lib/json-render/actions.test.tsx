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

import type { Spec } from '@json-render/core';
import { JSONUIProvider, Renderer } from '@json-render/react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyLockToSpec, registry, SpecRenderer } from '@/lib/json-render/registry';

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
// ---------------------------------------------------------------------------
// Fix #3: $cond-based toggle pattern
// ---------------------------------------------------------------------------

describe('local-mode actions — Fix #3: $cond toggle', () => {
  it('flips visibility on each press using $cond expression value', async () => {
    const spec: Spec = {
      root: 'card',
      state: { open: false },
      elements: {
        card: {
          type: 'Card',
          props: {},
          children: ['toggle-btn', 'detail-text'],
        },
        'toggle-btn': {
          type: 'Button',
          props: { label: 'Toggle details' },
          on: {
            press: {
              action: 'setState',
              params: {
                statePath: '/open',
                value: { $cond: { $state: '/open' }, $then: false, $else: true },
              },
            },
          },
          children: [],
        },
        'detail-text': {
          type: 'Text',
          props: { text: 'Here are the details.' },
          visible: { $state: '/open' },
          children: [],
        },
      },
    };

    // Seed state with open: false (plain key, no leading slash).
    renderSpec(spec, { open: false });

    // Initially hidden (open is false).
    expect(screen.queryByText('Here are the details.')).not.toBeInTheDocument();

    // First click → open flips to true → text appears.
    const btn = screen.getByRole('button', { name: 'Toggle details' });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.getByText('Here are the details.')).toBeInTheDocument();

    // Second click → open flips back to false → text hidden again.
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(screen.queryByText('Here are the details.')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Fix #14: $and/$or composite visibility
// ---------------------------------------------------------------------------

describe('local-mode actions — Fix #14: $and/$or composite visibility', () => {
  it('$or: shows element when at least one condition is truthy', () => {
    const spec: Spec = {
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: {},
          children: ['or-text'],
        },
        'or-text': {
          type: 'Text',
          props: { text: 'Or-condition text' },
          // Visible when /a OR /b is truthy; seed /b = true, /a = false
          visible: { $or: [{ $state: '/a' }, { $state: '/b' }] },
          children: [],
        },
      },
    };

    // Only /b is truthy — should be visible via $or.
    renderSpec(spec, { a: false, b: true });
    expect(screen.getByText('Or-condition text')).toBeInTheDocument();
  });

  it('$or: hides element when all conditions are falsy', () => {
    const spec: Spec = {
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: {},
          children: ['or-text'],
        },
        'or-text': {
          type: 'Text',
          props: { text: 'Or-condition text' },
          visible: { $or: [{ $state: '/a' }, { $state: '/b' }] },
          children: [],
        },
      },
    };

    // Both /a and /b falsy — should be hidden.
    renderSpec(spec, { a: false, b: false });
    expect(screen.queryByText('Or-condition text')).not.toBeInTheDocument();
  });

  it('$and: hides element when any condition is falsy', () => {
    const spec: Spec = {
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: {},
          children: ['and-text'],
        },
        'and-text': {
          type: 'Text',
          props: { text: 'And-condition text' },
          // Visible only when BOTH /a AND /b are truthy
          visible: { $and: [{ $state: '/a' }, { $state: '/b' }] },
          children: [],
        },
      },
    };

    // /a is true but /b is false — $and should be false → hidden.
    renderSpec(spec, { a: true, b: false });
    expect(screen.queryByText('And-condition text')).not.toBeInTheDocument();
  });

  it('$and: shows element when all conditions are truthy', () => {
    const spec: Spec = {
      root: 'card',
      elements: {
        card: {
          type: 'Card',
          props: {},
          children: ['and-text'],
        },
        'and-text': {
          type: 'Text',
          props: { text: 'And-condition text' },
          visible: { $and: [{ $state: '/a' }, { $state: '/b' }] },
          children: [],
        },
      },
    };

    // Both /a and /b truthy — $and should be true → visible.
    renderSpec(spec, { a: true, b: true });
    expect(screen.getByText('And-condition text')).toBeInTheDocument();
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
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    });
    expect(screen.getByText('Toggle panel')).toBeInTheDocument();

    // Press Hide → hidden again
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    });
    expect(screen.queryByText('Toggle panel')).not.toBeInTheDocument();

    // Press Show again → visible again (no lock state)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    });
    expect(screen.getByText('Toggle panel')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Phase 3: applyLockToSpec + rendered lock state
// ---------------------------------------------------------------------------

describe('Phase 3: applyLockToSpec + model-mode lock display', () => {
  const reviewSpec: Spec = {
    root: 'card',
    elements: {
      card: { type: 'Card', props: {}, children: ['approve', 'reject'] },
      approve: {
        type: 'Button',
        props: { label: 'Approve' },
        on: { press: { action: 'sendToModel', params: { label: 'Approve' } } },
        children: [],
      },
      reject: {
        type: 'Button',
        props: { label: 'Reject' },
        on: { press: { action: 'sendToModel', params: { label: 'Reject' } } },
        children: [],
      },
    },
  };

  it('returns the spec unchanged when isLocked is false', () => {
    const result = applyLockToSpec(reviewSpec, false);
    expect(result).toBe(reviewSpec); // strict equality — no allocation
  });

  it('injects disabled:true into every model-mode Button when isLocked is true', () => {
    const result = applyLockToSpec(reviewSpec, true);
    expect((result.elements.approve.props as { disabled?: boolean }).disabled).toBe(true);
    expect((result.elements.reject.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('does not modify local-mode Buttons (e.g. setState) when isLocked is true', () => {
    const localSpec: Spec = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['local-btn'] },
        'local-btn': {
          type: 'Button',
          props: { label: 'Toggle' },
          on: { press: { action: 'setState', params: { statePath: '/x', value: true } } },
          children: [],
        },
      },
    };
    const result = applyLockToSpec(localSpec, true);
    expect((result.elements['local-btn'].props as { disabled?: boolean }).disabled).toBeUndefined();
  });

  it('does not modify Buttons without an on.press binding', () => {
    const noActionSpec: Spec = {
      root: 'card',
      elements: {
        card: { type: 'Card', props: {}, children: ['plain-btn'] },
        'plain-btn': { type: 'Button', props: { label: 'Just a button' }, children: [] },
      },
    };
    const result = applyLockToSpec(noActionSpec, true);
    expect(
      (result.elements['plain-btn'].props as { disabled?: boolean }).disabled,
    ).toBeUndefined();
  });

  it('renders model-mode Buttons as disabled when the locked spec is mounted', () => {
    const locked = applyLockToSpec(reviewSpec, true);
    renderSpec(locked);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });
});
