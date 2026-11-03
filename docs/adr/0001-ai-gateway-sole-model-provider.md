---
status: accepted
---

# Vercel AI Gateway is the sole model provider

Azure AI Foundry access is ending, and the app is deployed on Vercel. Every model turn now
goes through Vercel AI Gateway via the AI SDK's bundled `createGateway`, addressed by
Gateway slug (`openai/<model id>`), authenticated with a single `AI_GATEWAY_API_KEY`. We keep
the app's own Model ids and map them to slugs at one seam (`getModel`) so sessions, pricing,
and the UI are untouched by the provider swap.

## Considered options

- **Direct `@ai-sdk/openai` with an OpenAI key.** Rejected: ties us to one vendor again, and
  we lose the gateway's per-request BYOK, routing fallbacks, and spend reporting.
- **OpenAI-compatible endpoint of the gateway.** Rejected: the native gateway provider is
  already bundled in `ai`, needs no extra dependency, and returns gateway cost metadata.

## Consequences

- The app still owns conversation state (Postgres) and sends every turn stateless; we keep
  passing `store: false` under the `openai` namespace so the upstream Responses API never
  relies on server-stored items.
- The Foundry-specific "deployment name" indirection is gone; a Model id is enough.
