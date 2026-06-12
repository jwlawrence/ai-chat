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
