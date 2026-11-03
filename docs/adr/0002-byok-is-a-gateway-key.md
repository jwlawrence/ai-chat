---
status: accepted
---

# BYOK means bringing your own AI Gateway key

With Foundry gone, "bring your own key" can no longer mean an Azure key plus a base URL plus a
per-model deployment map. We redefine BYOK as a single Vercel AI Gateway key: the user's
turns are routed through the same provider path as the app's, but billed to their key, so
every app model is available to them and the quota walls are bypassed as before.

## Considered options

- **Bring your own OpenAI key via request-scoped gateway BYOK.** Viable, but it adds a second
  credential shape, needs provider-specific validation, and bills the user at OpenAI while
  the app's own traffic bills at Vercel; two billing stories for one feature.
- **Drop BYOK.** Rejected: it is a documented product capability and part of the sign-in
  value proposition.

## Consequences

- The browser-side BYOK record changes shape; old Azure records are discarded (and the stale
  secret removed from localStorage) rather than migrated, since they cannot work anymore.
- A BYOK user can no longer end up with a model that has "no deployment", so the
  `byokModelMissing` failure mode disappears.
