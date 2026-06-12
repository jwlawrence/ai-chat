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
export function AnimatedCardShell({ specId, children }: { specId?: string; children: ReactNode }) {
  const scopeRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const scope = scopeRef.current;
      if (!scope) return;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from(scope, {
          opacity: 0,
          y: 12,
          duration: 0.4,
          ease: 'power2.out',
          clearProps: 'opacity,transform',
        });
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
