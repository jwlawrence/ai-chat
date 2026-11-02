# AI Chat

Next.js chat that answers with generated UI, served by OpenAI models through [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), with Postgres-backed session save/load.

## Setup

Prerequisites: **Node 22.13.1** (pinned in `.nvmrc`; floor enforced by `engines`) and
**pnpm 10**. Nothing switches Node for you, so select it explicitly per shell:

```bash
nvm use                 # reads .nvmrc; `nvm install` first if you don't have it
npm install -g pnpm@10  # once per machine
```

Then:

```bash
pnpm install
cp .env.example .env.local
# Edit .env.local — see notes below
pnpm db:generate
pnpm db:migrate
pnpm dev
```

On an Apple Silicon Mac, confirm `node -p process.arch` reports `arm64`. An x64 build
running under Rosetta fails to load native bindings — Vitest cannot find its rolldown
binary and Storybook refuses to start.

## Env vars

- `POSTGRES_URL` — Neon / Vercel Postgres connection string.
- `AI_GATEWAY_API_KEY` — Vercel AI Gateway API key (Vercel dashboard → AI Gateway → API Keys). The only model credential the app needs.
- `CONTEXT_WINDOW_MESSAGES` — sliding window size (default 50).

## Notes

- AI SDK v6 with the bundled AI Gateway provider (`createGateway` from `ai`). Model ids map to
  gateway slugs (`openai/<id>`) in one place — see `lib/ai/providers.ts`. Every turn is sent
  stateless (`store: false`); the app owns conversation history.
- BYOK: a signed-in user can paste their own AI Gateway key on `/settings`; it is kept in the
  browser and sent as a request header, and their turns bypass the budget caps.
- Cutover from the old Azure AI Foundry deployment: run `scripts/cutover-to-ai-gateway.sh`
  once to create the key and swap the Vercel environment variables.
- Domain vocabulary lives in `GLOSSARY.md`; provider decisions in `docs/adr/`.
- Sessions and messages are persisted in `onFinish`; aborted turns are discarded.
- New-session id is sent to the client via a `data-session` event mid-stream; the client `router.replace()`s.
- DB driver is `postgres` (postgres-js) via `drizzle-orm/postgres-js` — substituted for `@vercel/postgres` because the package isn't in our pnpm registry mirror. The connection string format is identical.
- shadcn primitives use `@base-ui/react@1.4.1` — several AI Elements files were patched / removed for API compatibility. See git log for details.

## Scripts

- `pnpm dev` — Next.js dev server.
- `pnpm lint` / `pnpm format` — Biome.
- `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` — Drizzle.
