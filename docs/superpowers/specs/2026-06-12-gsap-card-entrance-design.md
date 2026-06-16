# GSAP staggered entrance for rendered UI cards

- **Date:** 2026-06-12
- **Status:** Approved (design); pending spec review
- **Author:** Josh Lawrence (with Claude)

## Context & goal

The chat renders model-emitted generative-UI artifacts. The model calls the
`renderUI` tool (`lib/ai/tools/render-ui.ts`), which returns a flat JSON spec
(`{ root, elements, state }`). That spec flows through `RenderUIPart` →
`RenderUICard` → `JSONUIProvider` / `SpecRenderer` / `Renderer`
(`components/chat/conversation.tsx`, `lib/json-render/registry.tsx`) and mounts
as a card in the transcript once the tool part reaches
`state === 'output-available'`.

Today these cards appear instantly with no entrance treatment. We want a
**subtle entrance animation**: when a card mounts, the card container does a
gentle fade + slight rise, then its content children **cascade in** with a small
stagger. The effect should feel polished and "alive" without being flashy or
slowing perceived load.

The only animation library currently in the repo is `motion` (Framer Motion's
successor, v12), used in exactly one place — the looping "Thinking…" shimmer
(`components/ai-elements/shimmer.tsx`, consumed at
`components/ai-elements/reasoning.tsx:148`). That code is a continuous loop, not
entrance choreography, so none of it is reusable here.

## Decision: GSAP

We will use **GSAP** (`gsap` + `@gsap/react`) for the entrance, decided over the
already-installed `motion` and over pure CSS. Rationale:

- GSAP's select-and-stagger model (`gsap.from(targets, { stagger })`) targets
  DOM nodes directly, which is a clean fit for staggering the children of a
  **dynamically rendered, recursive spec** — no need to thread `motion` variants
  through 25 registry components or wrap every child in a `motion.div`.
- `@gsap/react`'s `useGSAP()` hook gives correct pre-paint timing
  (`useLayoutEffect`) plus automatic scoped cleanup/revert.
- GSAP (incl. all plugins) became fully free in 2025, so there is no licensing
  cost to adding it.

Trade-off accepted: this introduces a second animation system alongside
`motion`. The cost is low because `motion`'s footprint is a single shimmer; the
two never overlap (GSAP does entrances, `motion` does the one loop).

## Scope

**In scope:**

- Entrance animation for `renderUI` card parts **only**.
- Two-level effect: container fade+rise, then a stagger of the card's content
  children.
- Fires **once per card mount**, never on re-render.
- `prefers-reduced-motion` respected (instant, un-animated cards).

**Out of scope (YAGNI — easy to add later on this foundation):**

- Exit animations.
- Hover / press micro-interactions.
- Animating streamed text or the reasoning shimmer.
- Cross-card sequencing (each card animates independently on its own mount).
- Layout / FLIP animations on state change.

## Dependencies

Add two packages:

- `gsap` — core (~23KB gzipped)
- `@gsap/react` — the `useGSAP()` hook

Install with the artifactory registry override required from non-corp networks:

```sh
npm_config_registry=https://registry.npmjs.org/ pnpm add gsap @gsap/react
```

## Architecture

One new isolated unit + one integration point. No changes to the 25 registry
components.

### New file: `components/chat/animated-card-shell.tsx` (`'use client'`)

A thin wrapper that replaces the bare `<div data-spec-id={spec?.root}>`
currently emitted by `RenderUIPart` (`conversation.tsx:466`).

```tsx
<AnimatedCardShell specId={spec.root}>
  <RenderUICard spec={spec} initialState={initialState} sendMessage={sendMessage} initiallyLocked={initiallyLocked} />
</AnimatedCardShell>
```

It renders:

```tsx
<div data-spec-id={specId} ref={scopeRef}>{children}</div>
```

and runs the entrance via `useGSAP`. Because `JSONUIProvider` and `SpecRenderer`
emit no DOM, `scopeRef.current.firstElementChild` is always the root component's
outer DOM node (Card / Grid / Row / Form / etc.).

### Pure helper: `getStaggerTargets(scope: HTMLElement): Element[]`

The only non-trivial logic, kept pure and independently unit-testable. Rule:

- If the root element is a shadcn Card (`[data-slot="card"]`), stagger the direct
  children of its own content: `:scope > [data-slot="card-content"]` → that
  element's `children`. (Title/footer ride with the container fade. `:scope >`
  ensures a nested card's content is not captured.)
- Otherwise (Grid / Row / Form / anything else), stagger the root element's
  direct `children`.
- Empty / no first child → empty array (degrades safely).

shadcn's `data-slot="card"` / `data-slot="card-content"` attributes
(`components/ui/card.tsx`) make this stable without touching the registry.

### Integration point

`RenderUIPart` in `components/chat/conversation.tsx` (around line 465–473):
swap the inline `<div data-spec-id>` for `<AnimatedCardShell specId={spec?.root}>`
wrapping the existing `<RenderUICard …>`.

## Animation behavior

Inside `useGSAP(() => { … }, { scope: scopeRef })`, gated by
`gsap.matchMedia('(prefers-reduced-motion: no-preference)')`:

- **Container:**
  `gsap.from(scope, { opacity: 0, y: 12, duration: 0.4, ease: 'power2.out' })`
- **Children:**
  `gsap.from(getStaggerTargets(scope), { opacity: 0, y: 8, duration: 0.35, ease: 'power2.out', delay: 0.08, stagger: { amount: 0.35 }, clearProps: 'opacity,transform' })`

Notes:

- `stagger: { amount: 0.35 }` spreads **all** children across a fixed ~0.35s
  total regardless of count, so a 2-child card and a 12-child bento grid feel
  consistent and neither drags.
- `clearProps: 'opacity,transform'` removes GSAP's inline styles on completion so
  later hover / interaction / lock restyles aren't polluted.
- Total perceived entrance ≈ 0.5–0.7s.

### Feel (tunable defaults)

12px container rise / 8px child rise, ~0.4s, `power2.out`, cascade bounded to
0.35s. These are the starting values; trivially adjustable.

### Fail-safe & no-flash

- `from()` means the **resting** DOM state is the visible one. If GSAP fails to
  load or JS is disabled, cards render normally (no hidden content).
- `useGSAP` runs in a pre-paint layout effect, so `opacity: 0` is applied before
  the browser paints — no flash of the final state first.

### Reduced motion

Users with `prefers-reduced-motion: reduce` never enter the matchMedia block, so
cards appear instantly with no transform or fade.

## Edge cases handled

- **Lock re-renders:** toggling `isLocked` re-runs `applyLockToSpec` and
  re-renders `RenderUICard`, but that is a re-render, not a remount, and
  `useGSAP` has no deps → it won't re-fire. `clearProps` has already run, so the
  locked-state restyle is clean.
- **Streaming siblings:** token-by-token conversation re-renders don't retrigger
  a card whose `RenderUICard` is already mounted; `RenderUIPart` is `memo`-ized.
- **Charts:** recharts' own mount animation runs inside the faded wrapper; a
  container transform doesn't conflict with the chart's internal SVG animation.
- **Single-child / KPI-only roots:** degrades to one quick fade.
- **Multiple cards in one assistant turn:** each gets its own `RenderUIPart` →
  `AnimatedCardShell` → `useGSAP` scope and animates independently as it mounts.
- **Grid-of-Cards nesting:** `:scope >` in `getStaggerTargets` keeps targeting at
  the correct depth (root's children), not a nested card's content.

## Testing

Per repo constraint, run targeted tests via `pnpm test <path>` on the
Volta-pinned arm64 node — never the full suite (it hits the real prod DB).

Both the helper test and the component test live in a single co-located file,
`components/chat/animated-card-shell.test.tsx`.

- **Unit — `getStaggerTargets`:** jsdom fixtures for Card root, Grid root,
  Grid-of-Cards (nesting), Row root, and empty scope; assert the correct target
  set in each case.
- **Component — `AnimatedCardShell`:** with a mocked `gsap` / `useGSAP`,
  assert (a) children render and `data-spec-id` is present, (b) `gsap.from` is
  called with the container and the correct targets when motion is allowed, and
  (c) no animation calls occur under `prefers-reduced-motion: reduce`.

## Files touched

- **New:** `components/chat/animated-card-shell.tsx` (exports `AnimatedCardShell`
  and the pure `getStaggerTargets` helper)
- **New:** `components/chat/animated-card-shell.test.tsx` (helper + component tests)
- **Edit:** `components/chat/conversation.tsx` — `RenderUIPart` swaps its
  `<div data-spec-id>` for `<AnimatedCardShell>`
- **Edit:** `package.json` / lockfile — add `gsap`, `@gsap/react`
