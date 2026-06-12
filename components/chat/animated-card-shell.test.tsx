// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimatedCardShell, getStaggerTargets } from './animated-card-shell';

// Hoisted handles so the vi.mock factories below can reference them.
const { fromSpy, motion } = vi.hoisted(() => ({
  fromSpy: vi.fn(),
  motion: { allowed: true },
}));

// Mock GSAP: record `from` calls; `matchMedia().add` runs the callback only
// when motion is "allowed" (simulates prefers-reduced-motion: no-preference).
vi.mock('gsap', () => ({
  default: {
    from: (...args: unknown[]) => fromSpy(...args),
    matchMedia: () => ({
      add: (_query: string, cb: () => void) => {
        if (motion.allowed) cb();
      },
    }),
  },
}));

// Mock useGSAP to run the callback once in a layout effect (after the DOM is
// committed), matching the real hook's pre-paint timing closely enough to test.
vi.mock('@gsap/react', async () => {
  const React = await import('react');
  return {
    useGSAP: (cb: () => void) => {
      React.useLayoutEffect(() => {
        cb();
      }, []);
    },
  };
});

function makeScope(innerHTML: string): HTMLElement {
  const scope = document.createElement('div');
  scope.setAttribute('data-spec-id', 'root');
  scope.innerHTML = innerHTML;
  return scope;
}

describe('getStaggerTargets', () => {
  it('returns the card-content children for a Card root (not header/footer)', () => {
    const scope = makeScope(`
      <div data-slot="card">
        <div data-slot="card-header"><div data-slot="card-title">T</div></div>
        <div data-slot="card-content">
          <div data-testid="c1"></div><div data-testid="c2"></div><div data-testid="c3"></div>
        </div>
        <div data-slot="card-footer">F</div>
      </div>
    `);
    expect(getStaggerTargets(scope).map((el) => el.getAttribute('data-testid'))).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
  });

  it('returns the root element direct children for a Grid root', () => {
    const scope = makeScope(`
      <div class="grid"><div data-testid="g1"></div><div data-testid="g2"></div></div>
    `);
    expect(getStaggerTargets(scope).map((el) => el.getAttribute('data-testid'))).toEqual([
      'g1',
      'g2',
    ]);
  });

  it('targets the grid cells (not nested card-content) for a Grid-of-Cards root', () => {
    const scope = makeScope(`
      <div class="grid">
        <div data-testid="cell1"><div data-slot="card"><div data-slot="card-content"><div>x</div></div></div></div>
        <div data-testid="cell2"><div data-slot="card"><div data-slot="card-content"><div>y</div></div></div></div>
      </div>
    `);
    expect(getStaggerTargets(scope).map((el) => el.getAttribute('data-testid'))).toEqual([
      'cell1',
      'cell2',
    ]);
  });

  it('returns the root element direct children for a Row root', () => {
    const scope = makeScope(`
      <div class="flex"><div data-testid="r1"></div><div data-testid="r2"></div></div>
    `);
    expect(getStaggerTargets(scope).map((el) => el.getAttribute('data-testid'))).toEqual([
      'r1',
      'r2',
    ]);
  });

  it('returns an empty array when the scope has no element child', () => {
    expect(getStaggerTargets(makeScope(''))).toEqual([]);
  });
});

describe('AnimatedCardShell', () => {
  beforeEach(() => {
    fromSpy.mockClear();
    motion.allowed = true;
  });
  afterEach(cleanup);

  it('renders children inside a div carrying data-spec-id', () => {
    render(
      <AnimatedCardShell specId="spec-1">
        <div data-testid="content">hi</div>
      </AnimatedCardShell>,
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(document.querySelector('[data-spec-id="spec-1"]')).not.toBeNull();
  });

  it('animates the container and the stagger targets when motion is allowed', () => {
    render(
      <AnimatedCardShell specId="spec-xyz">
        <div data-slot="card">
          <div data-slot="card-content">
            <div data-testid="kid">hello</div>
          </div>
        </div>
      </AnimatedCardShell>,
    );

    expect(fromSpy).toHaveBeenCalledTimes(2);

    const [containerArg] = fromSpy.mock.calls[0];
    expect((containerArg as HTMLElement).getAttribute('data-spec-id')).toBe('spec-xyz');

    const [targetsArg, varsArg] = fromSpy.mock.calls[1];
    expect(Array.isArray(targetsArg)).toBe(true);
    expect((targetsArg as Element[]).length).toBe(1);
    expect((varsArg as { stagger?: unknown }).stagger).toBeDefined();
  });

  it('does not animate when prefers-reduced-motion is set', () => {
    motion.allowed = false;
    render(
      <AnimatedCardShell specId="spec-2">
        <div data-slot="card">
          <div data-slot="card-content">
            <div data-testid="kid2">hello</div>
          </div>
        </div>
      </AnimatedCardShell>,
    );
    expect(screen.getByTestId('kid2')).toBeInTheDocument();
    expect(fromSpy).not.toHaveBeenCalled();
  });
});
