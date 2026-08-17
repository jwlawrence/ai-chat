# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: recruiters and hiring managers, evaluating in about 90 seconds.** They arrive
cold — usually from a LinkedIn link — on a phone or a work laptop, with no context, no
account, and no patience for a README. They click one thing, watch what happens, and form
an impression. Success is that they understand what was built and who built it without
reading an explanation.

Everything else the app supports — signed-in exploration, BYOK, persistent history — serves
that primary visit rather than competing with it. Anonymous, first-touch, zero-instruction
use is the design case; the signed-in experience is the follow-on for the minority who stay.

## Product Purpose

A publicly hosted chat where the model answers by composing live interactive UI instead of
prose. The visitor sends a prompt; the model calls an internal `renderUI` tool and streams
back a validated JSON spec that renders as real components — charts, tables, KPIs, forms,
cards, stateful buttons — inside the transcript.

It exists as a portfolio piece for Joshua Lawrence. Success is that a cold visitor gets the
idea from a single interaction, and that the piece reads as a shipped product — auth, budget
ledger, kill switches, tests, Storybook — rather than a demo.

## Positioning

**GenUI all the way down.** The generated-UI capability is not a feature inside the product;
it is the product surface. The same json-render pipeline that answers a question also builds
the sign-in card, the quota wall, and the settings form. A neighboring chat app can render a
chart in an answer. It cannot truthfully claim that its walls, gates, and configuration
screens are the same generated system as its answers.

## Operating Context

- Reached primarily by a shared link (LinkedIn, résumé, direct send), often on mobile. The
  root `/` serves a real 200 to crawlers so the link unfurls with an OG card, and redirects
  humans to `/chat`.
- First contact is anonymous: a Cloudflare Turnstile challenge issues a trust cookie, and a
  signed `pac_anon` cookie carries a 7-day anonymous identity that scopes session history.
- Anonymous visitors do not type. They pick from four curated chip prompts, ordered as a
  narrative arc: `dashboard` → `composition` → `charts` → `interactive` (the last one closes
  the loop with a contact form). Short chip text appears in the transcript; the server swaps
  in a longer spec-grade prompt before the model call.
- Sign-in (Google or GitHub OAuth) unlocks free typing, a larger daily cap, persistent
  history, `webSearch`, and BYOK. Signing in re-parents the current device's anonymous chat
  sessions onto the account — best-effort, never blocking sign-in.
- Runs on Vercel at `https://ai-chat-by-josh.vercel.app` against an Azure AI Foundry
  deployment, with Postgres (Neon/Vercel Postgres) for sessions, messages, and the usage
  ledger.

## Capabilities and Constraints

**Binding — future work preserves these:**

- **Cost caps and quota walls are a permanent product fact.** Defaults in
  `lib/budget/preflight.ts`: $0.20/day per anonymous actor, $1.00/day per signed-in user,
  $5/day and $30/month global kill switch. BYOK requests bypass the global caps. Every cap
  is env-overridable but the mechanism stays. A visitor hitting a wall is an expected,
  designed state, not an error — the wall is rendered, not thrown.
- **Anonymous means chips only, behind Turnstile.** No free typing before sign-in. The
  Turnstile gate plus cookie identity is a permanent part of the anonymous experience, and
  the four-chip deck is the anonymous visitor's entire input vocabulary.

**Current implementation, not binding — changeable with reason:**

- Auth cards, the quota wall, and the BYOK settings form are currently rendered through
  json-render rather than hand-built React. This expresses the positioning but is not itself
  a frozen requirement.
- Non-BYOK traffic is locked to `gpt-5.4-mini`; BYOK users may target their own deployments.
  Model IDs live in `lib/ai/models.ts`, prices in `lib/ai/pricing.ts`.
- Per-turn output ceiling of 10,000 tokens (`MAX_OUTPUT_TOKENS_PER_TURN`) and a sliding
  context window of 50 messages (`CONTEXT_WINDOW_MESSAGES`).

**Terminology used throughout the code and copy:**

- *renderUI* — the model-facing tool that emits a UI spec.
- *json-render / catalog / primitive* — the constrained component vocabulary the model may
  compose from (`lib/json-render/`), described to the model as a cached prompt prefix.
- *spec* — a `{ root, elements }` JSON document; *card* — a rendered spec in the transcript.
- *chip* — one of the four curated anonymous prompts.
- *actor* — the billing identity, either a signed-in `user` or an anonymous cookie ID.
- *server card* — a spec the server injects into the stream without a model call.

**Explicitly undecided:**

- No accessibility standard or conformance target has been agreed for this project.
- Pricing figures in `lib/ai/pricing.ts` originated as estimates; whether they have been
  verified against current Azure Foundry pricing is not recorded.
- LinkedIn OAuth was planned but is not implemented; only Google and GitHub are wired up.
  Whether LinkedIn is still wanted is undecided.

## Brand Commitments

- Identity is centralized in `lib/brand/site.ts` — name **AI Chat**, tagline *"A chat that
  responds with interactive UI"*, title *"AI Chat, a chat that responds with interactive
  UI"*, and the description *"A portfolio piece by Joshua Lawrence. The model dynamically
  answers with interactive components, not plain text."* A rename or URL change lands in one
  place; do not fork these strings into components.
- Author attribution is part of the product, not decoration: Joshua Lawrence, linked to
  `https://linkedin.com/in/joshlawrence`, with `jlawrence@linkedin.com` as the contact
  fallback when form delivery fails.
- Existing assets: `public/logo.svg`, plus generated `app/icon.tsx`, `app/apple-icon.tsx`,
  `app/opengraph-image.tsx`, and `app/twitter-image.tsx`. The OG card is a load-bearing part
  of the first impression, since the primary arrival path is a shared link.
- Light and dark themes both ship (`next-themes`, with a visible theme toggle).

## Evidence on Hand

- **The working app itself is the evidence.** Deployed, with OAuth, a Postgres usage ledger,
  Turnstile, BYOK, and streaming genUI.
- **Four curated demonstrations** — `lib/chat/chips.ts` with full prompts in
  `lib/chat/rich-prompts/` (dashboard, composition, charts, interactive/contact form).
- **A component catalog with tests** — `lib/json-render/` primitives (Chart, Table, KPI, and
  the base vocabulary), each with schema and renderer tests.
- **Storybook** — `stories/` covers the catalog primitives and compositions.
- **A working contact path** — Web3Forms delivery with rate limiting and auto-reply
  (`lib/contact/`), reachable from the fourth chip.
- **Planning and spec documents** — `plans/` and `docs/superpowers/` record the reasoning
  behind the public-hosting build.

**Absences future work must not fabricate:** there are no testimonials, no customers, no
case studies, no press, no usage or traffic numbers, no benchmarks, and no team. This is one
person's portfolio piece. Any metric, quote, or logo that appears on a surface must be
labeled as sample data inside a demonstration, never presented as a real claim.

## Product Principles

1. **The first interaction carries the whole argument.** A cold visitor with no instructions
   must reach a rendered, interactive answer in one tap. Anything that delays that tap is
   working against the product.
2. **The capability demonstrates itself.** Wherever a surface could be hand-built or
   generated, generation is the point — including the walls and the settings.
3. **Constraints are designed states.** Quota walls, Turnstile gates, and the chips-only
   input are part of the experience a visitor is meant to have, not failures to hide. They
   read as deliberate.
4. **Everything shown is honest.** Sample data inside a demonstration is fine and expected;
   an invented customer, metric, or endorsement is not.
5. **Identity and cost live in one place each.** Brand strings resolve through
   `lib/brand/site.ts`; spend resolves through the budget modules and ledger. Future surfaces
   read from those sources rather than restating them.
