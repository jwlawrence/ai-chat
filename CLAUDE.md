# AI Chat

A Next.js 16 / AI SDK v6 chat that answers with generated UI. Product context lives in
`PRODUCT.md`, design rules in `DESIGN.md`, domain vocabulary in `GLOSSARY.md`.

## Commands

- `pnpm lint` / `pnpm typecheck` / `pnpm test` are the fast checks; CI runs all three plus
  `pnpm db:migrate` against a local Postgres.
- Single test file: `pnpm vitest run <path>`.

## Agent skills

### Issue tracker

Issues and specs live as local markdown under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `GLOSSARY.md` at the root, decisions in `docs/adr/`. See `docs/agents/domain.md`.
