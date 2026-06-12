# GSAP Staggered Card Entrance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give model-rendered `renderUI` cards a subtle entrance — the card container fades and rises, then its content children cascade in with a small stagger — firing once per card mount and respecting reduced-motion.

**Architecture:** One new isolated client component, `AnimatedCardShell`, replaces the bare `<div data-spec-id>` wrapper in `RenderUIPart`. It uses `@gsap/react`'s `useGSAP` to run a GSAP entrance on mount, scoped to its own DOM subtree. A pure helper `getStaggerTargets` decides which DOM nodes cascade (card content children, or the root container's direct children). No changes to the 25 json-render registry components.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, GSAP + `@gsap/react`, Vitest + Testing Library (jsdom), Biome.

**Spec:** `docs/superpowers/specs/2026-06-12-gsap-card-entrance-design.md`

---

## File Structure

- **Create:** `components/chat/animated-card-shell.tsx` — exports `AnimatedCardShell` (the wrapper component) and the pure `getStaggerTargets` helper. Single responsibility: the entrance animation for one rendered card.
- **Create:** `components/chat/animated-card-shell.test.tsx` — unit tests for `getStaggerTargets` + component tests for `AnimatedCardShell` (with `gsap` / `@gsap/react` mocked).
- **Modify:** `components/chat/conversation.tsx` — `RenderUIPart` swaps its `<div data-spec-id>` for `<AnimatedCardShell>`, plus one import.
- **Modify:** `package.json` / `pnpm-lock.yaml` — add `gsap`, `@gsap/react`.

---

## Notes for the implementer

- **Test command (IMPORTANT):** run only the single new test file — `pnpm test components/chat/animated-card-shell.test.tsx`. Never run the full suite (`pnpm test` with no path): its global setup loads `.env.local`, which points at the real production Neon DB. A single non-DB test file is safe.
- **Node:** the repo is Volta-pinned to arm64 node 22.13.1, so `pnpm test <path>` works directly.
- **pnpm registry:** `.npmrc` pins to LinkedIn artifactory. From a non-corp network, `pnpm add` needs `npm_config_registry=https://registry.npmjs.org/` prefixed (shown in Task 1). On the corp network the plain command works — try plain first if the override fails.

---

### Task 1: Add GSAP dependencies

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install gsap and @gsap/react**

Run:

```bash
npm_config_registry=https://registry.npmjs.org/ pnpm add gsap @gsap/react
```

(If on the corp network and that errors, retry without the prefix: `pnpm add gsap @gsap/react`.)

Expected: install succeeds; `gsap` and `@gsap/react` are added under `dependencies` in `package.json`.

- [ ] **Step 2: Verify the dependencies are present**

Run:

```bash
node -e "const p=require('./package.json'); console.log('gsap', p.dependencies.gsap, '| @gsap/react', p.dependencies['@gsap/react'])"
```

Expected: prints both version strings (e.g. `gsap ^3.x.x | @gsap/react ^2.x.x`), neither `undefined`.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build(chip): add gsap + @gsap/react for card entrance animations"
```

---

### Task 2: `getStaggerTargets` pure helper (TDD)

The helper that, given a card's scope element, returns the DOM nodes that should cascade. Card root → its own `card-content` children; everything else → the root element's direct children.

**Files:**
- Create: `components/chat/animated-card-shell.tsx`
- Test: `components/chat/animated-card-shell.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/chat/animated-card-shell.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm test components/chat/animated-card-shell.test.tsx
```

Expected: FAIL — the module `./animated-card-shell` does not exist / `getStaggerTargets` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Create `components/chat/animated-card-shell.tsx`:

```tsx
/**
 * Returns the DOM nodes inside a rendered card's scope that should cascade in.
 *
 * - Card root (`[data-slot="card"]`): the direct children of the card's own
 *   `card-content` (title/footer ride with the container fade). `:scope >`
 *   keeps targeting at this card's depth, never a nested card's content.
 * - Anything else (Grid / Row / Form / single primitive): the root element's
 *   direct children.
 */
export function getStaggerTargets(scope: HTMLElement): Element[] {
  const rootEl = scope.firstElementChild;
  if (!rootEl) return [];
  if (rootEl.matches('[data-slot="card"]')) {
    const content = rootEl.querySelector(':scope > [data-slot="card-content"]');
    if (content) return Array.from(content.children);
  }
  return Array.from(rootEl.children);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm test components/chat/animated-card-shell.test.tsx
```

Expected: PASS — all 5 `getStaggerTargets` tests green.

- [ ] **Step 5: Commit**

```bash
git add components/chat/animated-card-shell.tsx components/chat/animated-card-shell.test.tsx
git commit -m "feat(chip): add getStaggerTargets helper for card entrance"
```

---

### Task 3: `AnimatedCardShell` component (TDD)

The wrapper that renders the `data-spec-id` div and runs the GSAP entrance once on mount.

**Files:**
- Modify: `components/chat/animated-card-shell.tsx`
- Modify: `components/chat/animated-card-shell.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Replace the entire contents of `components/chat/animated-card-shell.test.tsx` with the following (keeps the helper tests, adds mocks + component tests):

```tsx
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
```

- [ ] **Step 2: Run the tests to verify the component tests fail**

Run:

```bash
pnpm test components/chat/animated-card-shell.test.tsx
```

Expected: the `getStaggerTargets` describe still passes; the `AnimatedCardShell` describe FAILS — `AnimatedCardShell` is not exported from `./animated-card-shell`.

- [ ] **Step 3: Implement the component**

Replace the entire contents of `components/chat/animated-card-shell.tsx` with:

```tsx
'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { type ReactNode, useRef } from 'react';

/**
 * Returns the DOM nodes inside a rendered card's scope that should cascade in.
 *
 * - Card root (`[data-slot="card"]`): the direct children of the card's own
 *   `card-content` (title/footer ride with the container fade). `:scope >`
 *   keeps targeting at this card's depth, never a nested card's content.
 * - Anything else (Grid / Row / Form / single primitive): the root element's
 *   direct children.
 */
export function getStaggerTargets(scope: HTMLElement): Element[] {
  const rootEl = scope.firstElementChild;
  if (!rootEl) return [];
  if (rootEl.matches('[data-slot="card"]')) {
    const content = rootEl.querySelector(':scope > [data-slot="card-content"]');
    if (content) return Array.from(content.children);
  }
  return Array.from(rootEl.children);
}

/**
 * Per-card wrapper that replaces the bare `<div data-spec-id>` in RenderUIPart.
 * Runs a one-shot GSAP entrance on mount: the container fades + rises, then the
 * card's content children cascade in. `from()` keeps the resting DOM state
 * visible, so if GSAP never runs (JS off / load failure) the card still shows.
 * Respects `prefers-reduced-motion` via gsap.matchMedia.
 */
export function AnimatedCardShell({
  specId,
  children,
}: {
  specId?: string;
  children: ReactNode;
}) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const scope = scopeRef.current;
      if (!scope) return;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from(scope, { opacity: 0, y: 12, duration: 0.4, ease: 'power2.out' });
        const targets = getStaggerTargets(scope);
        if (targets.length > 0) {
          gsap.from(targets, {
            opacity: 0,
            y: 8,
            duration: 0.35,
            ease: 'power2.out',
            delay: 0.08,
            stagger: { amount: 0.35 },
            clearProps: 'opacity,transform',
          });
        }
      });
    },
    { scope: scopeRef },
  );

  return (
    <div data-spec-id={specId} ref={scopeRef}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
pnpm test components/chat/animated-card-shell.test.tsx
```

Expected: PASS — all 8 tests green (5 helper + 3 component).

- [ ] **Step 5: Lint/format the new files**

Run:

```bash
pnpm exec biome check --write components/chat/animated-card-shell.tsx components/chat/animated-card-shell.test.tsx
```

Expected: no errors (Biome may reformat; that's fine).

- [ ] **Step 6: Commit**

```bash
git add components/chat/animated-card-shell.tsx components/chat/animated-card-shell.test.tsx
git commit -m "feat(chip): add AnimatedCardShell GSAP entrance wrapper"
```

---

### Task 4: Wire `AnimatedCardShell` into `RenderUIPart`

Swap the bare wrapper div for the animated shell. This is the single integration point — text/reasoning rendering is untouched.

**Files:**
- Modify: `components/chat/conversation.tsx` (import + `RenderUIPart` return, around lines 465–474)

- [ ] **Step 1: Add the import**

In `components/chat/conversation.tsx`, add this line alongside the other relative (`./…`) component imports near the top of the file:

```tsx
import { AnimatedCardShell } from './animated-card-shell';
```

- [ ] **Step 2: Replace the wrapper div in `RenderUIPart`**

Find this block in `RenderUIPart` (currently around lines 465–474):

```tsx
  return (
    <div data-spec-id={spec?.root}>
      <RenderUICard
        spec={spec}
        initialState={initialState}
        sendMessage={sendMessage}
        initiallyLocked={initiallyLocked}
      />
    </div>
  );
```

Replace it with:

```tsx
  return (
    <AnimatedCardShell specId={spec?.root}>
      <RenderUICard
        spec={spec}
        initialState={initialState}
        sendMessage={sendMessage}
        initiallyLocked={initiallyLocked}
      />
    </AnimatedCardShell>
  );
```

- [ ] **Step 3: Typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: no type errors. (`AnimatedCardShell`'s `specId?: string` accepts `spec?.root`, which is `string | undefined`.)

- [ ] **Step 4: Lint the modified file**

Run:

```bash
pnpm exec biome check --write components/chat/conversation.tsx
```

Expected: no errors.

- [ ] **Step 5: Re-run the component tests (regression check)**

Run:

```bash
pnpm test components/chat/animated-card-shell.test.tsx
```

Expected: PASS — still 8 green.

- [ ] **Step 6: Manual verification (do this before committing)**

Run the dev server, then exercise a card render:

```bash
pnpm dev
```

Open `http://localhost:3000`, click a starter chip (e.g. "Under the hood.") or send a prompt that produces a generative-UI card. Confirm:
- The card fades + rises in, and its inner tiles/children cascade with a slight stagger (~0.5–0.7s total).
- No flash of the final layout before the animation.
- Existing behavior (buttons, forms, lock-on-press) still works after the entrance.
- (Optional) Enable OS "Reduce motion" and reload — the card should appear instantly with no animation.

- [ ] **Step 7: Commit**

```bash
git add components/chat/conversation.tsx
git commit -m "feat(chip): animate rendered UI card entrances via AnimatedCardShell"
```

---

## Done criteria

- `gsap` + `@gsap/react` are dependencies.
- `components/chat/animated-card-shell.tsx` exports `AnimatedCardShell` + `getStaggerTargets`.
- `pnpm test components/chat/animated-card-shell.test.tsx` passes (8 tests).
- `pnpm exec tsc --noEmit` is clean.
- Rendered UI cards animate in on mount with a staggered children cascade; reduced-motion users get instant cards; text/reasoning rendering is unchanged.
