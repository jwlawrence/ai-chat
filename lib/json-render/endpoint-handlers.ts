// server-only — this module is imported only by app/api/actions/[action]/route.ts.
// It is intentionally separate from catalog.ts, which is imported by both client
// and server code (conversation.tsx + render-ui.ts). Keeping handlers here ensures
// server-only dependencies (DB calls, secrets, etc.) never leak to the client bundle.

/**
 * Per-action handler map for registered server-side actions.
 * Covers both endpoint-mode and redirect-mode ACTION_REGISTRY entries.
 * Each entry receives the validated params object and returns a Response.
 *
 * Handlers are registered by the same name as their ACTION_REGISTRY entry.
 * The route at app/api/actions/[action]/route.ts looks up by that name.
 */
export const endpointHandlers = new Map<string, (params: unknown) => Promise<Response> | Response>([
  [
    'refreshData',
    (_params: unknown) => {
      // Phase 4: stub implementation — wiring exercise only.
      // A real implementation would trigger a backend data refresh here.
      return Response.json({ ok: true });
    },
  ],
  [
    'fetchWeather',
    (params: unknown) => {
      const p = params as { mode: string };
      const mode = p.mode;
      const summary =
        mode === 'weekly'
          ? '7-day: avg 68°F, mostly sunny, light rain Wed'
          : `Today: 72°F sunny, feels like 70°F (${new Date().toLocaleTimeString()})`;
      return Response.json({ summary, mode });
    },
  ],
  [
    'signInWith',
    (params: unknown) => {
      // ACTION_REGISTRY's z.enum(['google','github']) already validated this.
      const { provider } = params as { provider: 'google' | 'github' };
      // Relative URL — client (window.location.assign) resolves against current origin.
      // This keeps the handler signature pure (no req) while letting BYOK-style
      // header dependencies live in their own modules. Trailing path matches
      // NextAuth's signin route convention.
      return Response.json({ redirectTo: `/api/auth/signin/${provider}` });
    },
  ],
]);
