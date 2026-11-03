# 01: Chat turns run through Vercel AI Gateway

**What to build:** A visitor or signed-in user sends a prompt and the answer streams back
from the AI Gateway instead of Foundry, with every later turn of the conversation also
succeeding. The app is configured by `AI_GATEWAY_API_KEY` alone, CI runs with that variable,
and the Azure provider package is gone.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `getModel(id)` builds a gateway model for the Gateway slug of `id` using `AI_GATEWAY_API_KEY`; a missing key throws the existing "Missing required env var" error.
- [x] The chat route passes the stateless provider option under the `openai` namespace.
- [x] `@ai-sdk/azure` is removed from `package.json` and the lockfile; nothing imports it.
- [x] `.env.example` and CI define `AI_GATEWAY_API_KEY` and no `AZURE_FOUNDRY_*` variables.
- [x] `pnpm typecheck`, `pnpm lint`, and the provider + chat-route tests pass.

## Comments

Test seams: `getModel` unit tests (mock `createGateway` from `ai`), chat-route stateless test.
