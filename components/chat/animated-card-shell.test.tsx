// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { getStaggerTargets } from './animated-card-shell';

// Build a scope element (mirrors the `<div data-spec-id>` wrapper) whose
// firstElementChild is the rendered root component's outer node.
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
    const targets = getStaggerTargets(scope);
    expect(targets.map((el) => el.getAttribute('data-testid'))).toEqual(['c1', 'c2', 'c3']);
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
