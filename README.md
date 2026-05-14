# AI Chat (Foundry)

Single-user Next.js chat against Azure AI Foundry deployments (GPT-5.3+ and Kimi K2.6) with Postgres-backed session save/load.

## Setup

```bash
pnpm install
cp .env.example .env.local
# Edit .env.local — see notes below
pnpm db:generate
pnpm db:migrate
pnpm dev
```

## Env vars

- `POSTGRES_URL` — Neon / Vercel Postgres connection string.
- `AZURE_FOUNDRY_API_KEY` — single key reused for both Foundry deployments.
- `AZURE_FOUNDRY_GPT_URL` — base URL for the GPT-5.3+ deployment (the `…/models` root).
- `AZURE_FOUNDRY_KIMI_URL` — base URL for the Kimi K2.6 deployment.
- `CONTEXT_WINDOW_MESSAGES` — sliding window size (default 50).
- `TITLE_MODEL` — model used for the auto-title call (default `kimi-k2.6`).

## Notes

- AI SDK v6 with `@ai-sdk/openai-compatible`. Foundry expects the `api-key` header — see `lib/ai/providers.ts`.
- Sessions and messages are persisted in `onFinish`; aborted turns are discarded.
- New-session id is sent to the client via a `data-session` event mid-stream; the client `router.replace()`s.
- DB driver is `postgres` (postgres-js) via `drizzle-orm/postgres-js` — substituted for `@vercel/postgres` because the package isn't in our pnpm registry mirror. The connection string format is identical.
- shadcn primitives use `@base-ui/react@1.4.1` — several AI Elements files were patched / removed for API compatibility. See git log for details.

## Scripts

- `pnpm dev` — Next.js dev server.
- `pnpm lint` / `pnpm format` — Biome.
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` — Drizzle.
