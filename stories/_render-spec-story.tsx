'use client';

import { createStateStore, type Spec, type StateStore } from '@json-render/core';
import { JSONUIProvider, Renderer } from '@json-render/react';
import { useMemo } from 'react';
import { applyLockToSpec, registry, SpecRenderer } from '@/lib/json-render/registry';

/**
 * Action handler signature matching `JSONUIProviderProps['handlers']` from
 * `@json-render/react`. Kept local so we don't have to re-export the type
 * from the library.
 */
type StoryHandler = (params: Record<string, unknown>) => Promise<unknown> | unknown;

/**
 * Build the default action handlers, closing over the live `StateStore` so
 * model-mode + endpoint-mode handlers can read state (e.g. submitForm logs
 * the current `/{formName}` subtree, not just the action params).
 *
 * - `sendToModel` / `refreshData` — log the params only (no state needed).
 * - `submitForm` — logs params AND the form's state subtree at `/{formName}`.
 * - `fetchWeather` — returns a canned `{ summary, mode }` so the reactive
 *   display + lock visual works without a backend.
 */
function makeDefaultHandlers(store: StateStore): Record<string, StoryHandler> {
  return {
    sendToModel: async (params) => {
      console.log('[story] sendToModel', params);
    },
    submitForm: async (params) => {
      const formName = (params as { formName?: string } | undefined)?.formName;
      const values = formName ? store.get(`/${formName}`) : undefined;
      console.log('[story] submitForm', params, 'values:', values);
    },
    refreshData: async () => {
      console.log('[story] refreshData');
    },
    fetchWeather: async (params) => {
      console.log('[story] fetchWeather', params);
      const mode = (params as { mode?: string } | undefined)?.mode ?? 'daily';
      return {
        summary: mode === 'weekly' ? 'Mild week ahead — highs near 70°F.' : 'Sunny, 72°F.',
        mode,
      };
    },
  };
}

/**
 * Render a json-render `Spec` through the same provider tree production uses.
 *
 * - `locked`: when true, runs `applyLockToSpec` before render so model-mode
 *   buttons and form fields render in their disabled state.
 * - `handlers`: override or extend the default no-op action handlers.
 */
export function SpecStory({
  spec,
  locked = false,
  handlers,
}: {
  spec: Spec;
  locked?: boolean;
  handlers?: Record<string, StoryHandler>;
}) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: store is intentionally created once per story mount; spec.state is the seed value only
  const store = useMemo(
    () => createStateStore((spec.state as Record<string, unknown> | undefined) ?? {}),
    [],
  );
  const effectiveSpec = locked ? applyLockToSpec(spec, true) : spec;
  const mergedHandlers = useMemo(() => {
    const defaults = makeDefaultHandlers(store);
    return handlers ? { ...defaults, ...handlers } : defaults;
  }, [store, handlers]);
  return (
    <JSONUIProvider registry={registry} store={store} handlers={mergedHandlers}>
      <SpecRenderer spec={effectiveSpec} registry={registry}>
        <Renderer spec={effectiveSpec} registry={registry} />
      </SpecRenderer>
    </JSONUIProvider>
  );
}
