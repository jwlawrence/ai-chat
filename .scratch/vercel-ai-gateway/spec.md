# Spec: Replace Azure AI Foundry with Vercel AI Gateway

**Status:** ready-for-agent

## Problem Statement

The app's only model provider is an Azure AI Foundry deployment, and access to it is ending.
Without a replacement every chat turn, title generation, and BYOK validation fails. The
Foundry-specific shape (deployment names, api versions, resource base URLs) also leaks into
the BYOK feature, the settings form, env configuration, CI, and documentation.

## Solution

Route every model call through Vercel AI Gateway, which the app already deploys next to. The
app keeps its own Model ids and maps them to Gateway slugs at a single seam. BYOK becomes
"bring your own Gateway key". Configuration collapses to one secret, `AI_GATEWAY_API_KEY`.
Nothing about sessions, caps, the ledger, or the generated-UI pipeline changes.

## User Stories

1. As an anonymous visitor, I want chip prompts to keep answering with rendered cards, so that the first-tap experience is unaffected by the provider change.
2. As a signed-in user, I want typed prompts, web search, and multi-turn conversations to work exactly as before, so that the migration is invisible to me.
3. As a signed-in user, I want the second and later turns of a conversation to succeed, so that the provider swap does not reintroduce stateful-history errors.
4. As a signed-in user, I want new chats to still receive an auto-generated title, so that my history stays navigable.
5. As a signed-in user, I want to enter a single Vercel AI Gateway key on the settings page, so that my turns bill to my own account.
6. As a signed-in user, I want the settings page to tell me whether my Gateway key was accepted before it is saved, so that I do not discover a bad key mid-chat.
7. As a signed-in user with a saved Gateway key, I want every app model to be available to me, so that I am not limited by a deployment map.
8. As a signed-in user with a saved Gateway key, I want the quota walls bypassed as they were for Azure BYOK, so that my own spending is not capped by the app.
9. As a signed-in user with a saved Gateway key, I want chat titles generated with my key, so that the app's budget is not spent on my behalf.
10. As a signed-in user who had Azure BYOK configured, I want the stale Azure credentials removed from my browser and the settings page to show BYOK as not configured, so that a dead secret is not kept around.
11. As the operator, I want a single `AI_GATEWAY_API_KEY` secret to configure the app, so that setup and rotation are one step.
12. As the operator, I want a clear startup error when `AI_GATEWAY_API_KEY` is missing at the first model call, so that misconfiguration is obvious.
13. As the operator, I want the usage ledger and budget caps to keep working with the existing pricing table, so that cost enforcement is unaffected.
14. As the operator, I want CI to run without any Azure variables, so that the pipeline reflects the real configuration.
15. As the operator, I want a guided cutover script for the live environment swap, so that I do not have to re-derive the steps.
16. As a maintainer, I want the Azure provider package removed from dependencies, so that the lockfile and bundle do not carry dead code.
17. As a maintainer, I want README, PRODUCT.md, env example, and code comments to describe the gateway, so that the docs match the code.
18. As a maintainer, I want the provider seam to be the only place that knows Gateway slugs, so that adding a model is a two-line change.

## Implementation Decisions

- **Provider seam.** `getModel(modelId, override?)` stays the single place that builds a
  language model. It creates a gateway provider with `createGateway` from `ai` (bundled, no
  new dependency), keyed by `AI_GATEWAY_API_KEY` by default or by the user's Gateway key
  under BYOK, and addresses the model by Gateway slug from a `Model id → slug` table
  (`openai/<model id>` for all four current models).
- **Stateless turns.** The chat route keeps passing the stateless provider option, now as
  `{ openai: { store: false } }`, which the gateway forwards upstream. The constant keeps its
  name and doc comment, updated for the gateway.
- **BYOK shape.** The provider override becomes `{ apiKey }`. The request header set shrinks
  to the key header; the browser record becomes `{ key }` under a new storage key, and the
  legacy Azure record key is removed on load. The validate endpoint accepts `{ key }` and
  validates through `getModel` on the default model. The settings form has one password
  field and copy that says "AI Gateway key".
- **Chat route.** The `byokModelMissing` 400 branch is removed; `getModel` cannot fail for
  BYOK anymore. `generateTitle` uses the override whenever one is present.
- **Configuration.** `AZURE_FOUNDRY_API_KEY`, `AZURE_FOUNDRY_BASE_URL`,
  `AZURE_FOUNDRY_GPT_URL`, `AZURE_FOUNDRY_API_VERSION` are removed from code, env example,
  README, and CI; `AI_GATEWAY_API_KEY` replaces them. `@ai-sdk/azure` is removed.
- **Cost.** The pricing table and `estimateCostUSD` remain the ledger's cost source;
  comments point at the gateway catalog as the reference. Using the gateway's per-generation
  cost metadata is out of scope.
- **Prompt caching.** System-prompt ordering is unchanged; comments describe OpenAI prompt
  caching reached through the gateway.
- **Cutover.** A committed bash wizard walks the operator through creating a Gateway key,
  setting it on the Vercel project, deleting the Azure variables, and redeploying.

## Testing Decisions

- Good tests here assert observable behaviour at module boundaries: which provider factory
  was called with which key, which slug a Model id resolves to, what `streamText` received,
  what an HTTP route returns, what a browser record parses to. They never reach into the
  gateway client.
- **Seams under test** (all pre-existing):
  - `getModel` (unit): default key from env, BYOK key from override, slug mapping. Catches
    wrong env var names and wrong slugs; misses live gateway acceptance.
  - Chat route `POST` (integration with mocked `ai`): stateless option passed, BYOK header
    parsed into the override, title generation under BYOK. Catches wiring regressions.
  - `headersToOverride` / `recordToHeaders` / `loadByok` / `saveByok` (unit): new BYOK shape,
    legacy record discarded.
  - `validateByokCredentials` and `/api/byok/validate` (unit + route): key accepted /
    rejected / HTTP mapping.
  - Pricing table completeness (existing test keeps guarding every Model id).
- Prior art: `lib/ai/providers.test.ts`, `app/api/chat/route.store.test.ts`,
  `app/api/chat/route.byok.test.ts`, `lib/byok/*.test.ts`, `app/api/byok/validate/route.test.ts`.
- Mocking: mock `createGateway`/`generateText` from `ai` and the DB query module, as sibling
  tests already do. No network.

## Out of Scope

- Using `providerMetadata.gateway.cost` as the ledger's cost source.
- Verifying the pricing table against the live gateway catalog (unreachable from the
  implementation sandbox; flagged in PRODUCT.md).
- Vercel OIDC authentication instead of an API key.
- Adding non-OpenAI models, gateway routing options (`order`, `only`, `sort`), or
  zero-data-retention flags.
- Request-scoped upstream BYOK (`providerOptions.gateway.byok`).
- Server-side storage of BYOK credentials.

## Further Notes

- Pre-existing drift: `.env.example` and CI set `AZURE_FOUNDRY_GPT_URL` while the code read
  `AZURE_FOUNDRY_BASE_URL`. The migration removes both.
- The AI Elements model-selector contains a generic provider icon list that includes the
  string `'azure'`; it is vendored UI, not configuration, and is left alone.
