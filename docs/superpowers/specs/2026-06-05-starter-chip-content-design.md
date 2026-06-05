# Starter-chip content → "the app explains itself"

- **Date:** 2026-06-05
- **Status:** Approved (design); pending spec review
- **Author:** Josh Lawrence (with Claude)

## Context & goal

The home screen shows four starter "chips." Clicking one sends a short prompt
(shown verbatim in the transcript) that the chat route swaps server-side for a
spec-grade **rich prompt**, so the model renders a generative-UI artifact. Today
all four rich prompts carry **career-achievement** content (EngX platform
metrics, "career proof points," partner-team contributor growth, "Tell Josh
about the role").

We want to **shift the content away from the résumé and toward the app itself** —
its architecture, the generative-UI engine, and the engineering decisions behind
it. The app stays **portfolio-facing**, but it proves the author's skills by
*demoing what was built* (show, don't tell) rather than listing past wins. The
hook is recursion: the generative-UI engine renders explanations of the
generative-UI engine.

This is a **content + copy** change. We keep the four layouts, the chip IDs, the
labels, the icons, the short transcript prompts, and the chip→rich-prompt swap
mechanism. We change the rich-prompt content, the chip blurbs, and — because the
4th chip is a working contact form wired end-to-end — the contact form's fields
and the server-side code/tests that depend on them.

## Concept (approved)

| # | Chip ID | New title | New blurb | Layout (unchanged) |
|---|---------|-----------|-----------|--------------------|
| 1 | `dashboard` | "Under the hood." | "How this app is built, at a glance." | KPIs + donut bento |
| 2 | `composition` | "What makes it tick." | "The four pieces that power the engine." | 4-card 2×2 grid |
| 3 | `charts` | "Caching pays off." | "Cost per turn, cached vs uncached." | dual-line time-series |
| 4 | `interactive` | "Get in touch." | "Say hello or ask about the build." | form + auto-reply |

## What stays / what changes

**Stays (no churn):**
- Chip IDs (`dashboard`, `composition`, `charts`, `interactive`) — keys used by
  `isChipId`, route metadata, the rich-prompt map, and rate-limit lineage
  (`hasInteractiveChipChain` keys off `chipId === 'interactive'`).
- Chip `label`s ("Show a dashboard", "Compose a card layout", "Plot some data in
  a graph", "Build a form") and short `prompt`s — they still describe the layout
  and keep the transcript clean.
- Chip icons (`LayoutDashboard`, `LayoutGrid`, `BarChart3`, `MailPlus`).
- The `applyRichChipPrompts` swap mechanism and the `name="contact"` form
  contract that drives `detectContactFormSubmit` → server-side auto-reply.
- Each rich prompt's authoring rigor: primitive whitelist, "no em/en-dashes"
  rule, verbatim-string rule, and the embedded `Spec shape` JSON.

**Changes:**
- The four rich-prompt payloads and their file-level doc comments.
- The four chip blurbs in `components/chat/chip-deck.tsx`.
- The contact-form field model and every server-side consumer of it (validator,
  email send, auto-reply copy) plus their tests.
- The narrative-arc comment in `lib/chat/chips.ts` (cosmetic).

## Honesty / sourcing rules (cross-cutting)

This is a portfolio piece a technical reviewer will scrutinize, so displayed
numbers must be defensible:

1. **Real constants, sourced at implementation time.** The primitive count, the
   model count, and the catalog token figure must come from the actual code
   (the json-render catalog, `lib/ai/models.ts`, and the catalog token-budget
   test), not from this doc's estimates. Confirm them when implementing.
2. **Label illustrative data as illustrative.** The donut split (chip 1) and the
   cost-per-turn curve (chip 3) illustrate real *mechanisms* but are not live
   telemetry. Their subtitles/labels must make that clear, and chip 3 uses a
   unitless relative **cost index** (turn 1 = 100) rather than asserting a
   specific price or discount percentage.
3. **No invented precision.** Where an exact value isn't readily measurable
   (e.g. steering-prompt token size for the donut), use a clearly-illustrative
   split and keep the surrounding copy honest ("most of the system prompt is the
   cached catalog").

## Per-chip content spec

> Values below marked **[verify]** must be reconciled with the code at
> implementation time. Values marked **[illustrative]** are representative and
> must be labeled as such in the rendered copy.

### Chip 1 — `dashboard` · "Under the hood."

Reuses the existing 6-cell bento skeleton (one 2×2 hero, four 1×1 tiles, one
4×1 banner) so the layout stays balanced.

- **Outer Card** title: `Under the hood.`
- **Hero** (GridCell colSpan=2 rowSpan=2): inner Card titled `System-prompt budget.`
  - `Heading` level=1 = the catalog token count, `~5.4K tokens` (confirmed ~5,438, under the 6,000-token cap; kept rounded so it survives catalog drift)
  - `Chart` kind=`pie`, `legend=false`, data = catalog vs the rest of the system
    prompt, e.g. `[{"label":"Cached catalog","value":78},{"label":"Steering and tools","value":22}]` **[illustrative]** — the dominant slice is the cached catalog.
- **Tile s1** (1×1): `KPI` value=`23` label=`Renderable UI primitives in the catalog` (confirmed: 23 component types)
- **Tile s2** (1×1): `KPI` value=`4` label=`Models you can switch between` (confirmed: gpt-5.4, gpt-5.4-mini, gpt-5.3-codex, o4-mini)
- **Tile s3** (1×1): titleless Card with two stacked mini-stats:
  - `Heading` level=3 `1024 tok` / `Text` muted `Azure auto-cache threshold`
  - `Heading` level=3 `position 0` / `Text` muted `Where the catalog is pinned`
- **Tile s4** (1×1): `KPI` value=`Anon + BYOK` label=`Open access: Turnstile-gated guests, bring-your-own Azure key`
- **Banner** (4×1): `KPI` value=`Daily-cap metered` label=`Preflight check before each turn, usage ledger after`

Same strict rules as today (Card/Grid/GridCell/KPI/Heading/Text/Chart only; KPI
props `{value,label}`; verbatim strings; no em/en-dashes; nothing outside the
outer Card; embedded `Spec shape` JSON).

### Chip 2 — `composition` · "What makes it tick."

2×2 grid; each GridCell holds an inner Card (title + `Heading` level=2 +
`Text` body). Four real capabilities:

1. **Generative UI** — Heading `renderUI tool, 23 primitives` — Body:
   `The model returns a JSON spec, not prose. The json-render engine paints it into Cards, Grids, Charts, Forms, and more, then wires the result up to be interactive on the client.`
2. **Prompt caching** — Heading `Catalog pinned at position 0` — Body:
   `The component catalog (~5.4K tokens) sits at the very start of the system prompt, so Azure's automatic cache reuses it across turns and repeat turns get cheaper.`
3. **Usage metering** — Heading `Preflight check, postflight ledger` — Body:
   `Every turn checks a token budget before the model call and writes to a usage ledger after. A live daily-cap gauge shows the remaining headroom and degrades gracefully at the limit.`
4. **Open access** — Heading `Anonymous, claimable, BYOK` — Body:
   `Guests get a Turnstile-gated, chip-only mode they can later claim to an account. Signed-in users can plug in their own Azure deployment with a bring-your-own-key override.`

Same strict rules as today, **minus** the "don't surface internal product names"
rule (no longer relevant — this content is about the app itself). Keep
Card/Grid/GridCell/Heading/Text only; verbatim strings; no em/en-dashes.

### Chip 3 — `charts` · "Caching pays off."

- **Outer Card** title: `Caching pays off.`
- **Subtitle** muted `Text`: `Relative system-prompt cost per turn (turn 1 = 100). Illustrative.` **[illustrative]**
- **Chart** kind=`line`, xKey=`turn`, legend=true, two series over ~8 turns:
  - `uncached` — flat near 100 each turn (full system prompt re-billed every turn)
  - `cached` — 100 at turn 1, then drops and stays low (catalog served from cache)
  - Representative data **[illustrative]**:
    `[{"turn":1,"uncached":100,"cached":100},{"turn":2,"uncached":100,"cached":34}, … {"turn":8,"uncached":100,"cached":31}]`
  - series endpointLabels, e.g. `Full prompt re-sent` (uncached) and
    `Catalog served from cache` (cached).

Same strict rules as today (Card/Text/Chart only; verbatim data; no em/en-dashes).

### Chip 4 — `interactive` · "Get in touch." (vertical change)

The form stays a working contact form (`name="contact"`) so the
submit → server-side auto-reply round-trip — a genuine feature worth showing —
keeps working. We drop the recruiting-specific framing and fields.

**New field model** (replaces `{name, email, company, roleType, question?}`):

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | Input text | yes | unchanged |
| `email` | Input email | yes | unchanged |
| `topic` | Select | yes | replaces `roleType`; options: `Say hello`, `Question about the build`, `Work together`, `Other` (value == label) |
| `message` | Textarea | **yes** | replaces optional `question`; now required (a message is the point of the form) |

`company` is removed entirely.

**Rich prompt (`interactive.ts`):**
- Outer Card title: `Get in touch.`
- Subtitle muted `Text`: `Say hello, ask about the build, or talk shop. Replies within a business day.`
- `Form name="contact"` with: `name`, `email`, `topic` (Select), `message`
  (Textarea, rows=3, placeholder e.g. `e.g. How does the engine decide what to render?`), and a `Send` Button wiring
  `on.press = { action: "submitForm", params: { formName: "contact" } }`.
- Same strict rules (Card/Text/Form/Input/Select/Textarea/Button only; verbatim
  options; no em/en-dashes; embedded `Spec shape` JSON).

**Server-side consumers that must change (`lib/contact/`):**
- `web3forms.ts`:
  - `ContactFormSubmission` type → `{ name, email, topic, message }`.
  - `parseContactFormFields` → require `name`/`email`/`topic`/`message`; drop
    `company`/`roleType`/optional-`question`. `message` uses the long cap
    (reuse `CONTACT_QUESTION_MAX`; optionally rename to `CONTACT_MESSAGE_MAX`).
  - `validateContactFields` + `CONTACT_REQUIRED_FIELDS` →
    `['name','email','topic','message']` with matching per-field messages.
  - `sendContactFormToEmail` → subject e.g. `Portfolio contact: ${topic} (from ${name})`; message lines Name/Email/Topic/Message.
  - `detectContactFormSubmit`, `extractContactSubmissionId`,
    `hasInteractiveChipChain` keep keying off `formName === 'contact'` /
    `chipId === 'interactive'` — unchanged.
- `auto-reply.ts` → `buildSummary` no longer reads `roleType`/`company`. New copy
  derives from `topic` + `message`, e.g.
  `Thanks for reaching out${topic !== 'Other' ? ` about ${lower(topic)}` : ''}.`
  followed by an echo of the message
  (`You wrote: "${stripTrailingPunctuation(message)}."`). Card title
  (`Thanks, ${firstName}.`) and the commitment line stay.

## Change surface (files)

| File | Change |
|------|--------|
| `lib/chat/rich-prompts/dashboard.ts` | Rewrite payload + doc comment → "Under the hood." |
| `lib/chat/rich-prompts/composition.ts` | Rewrite payload + doc comment → "What makes it tick." |
| `lib/chat/rich-prompts/charts.ts` | Rewrite payload + doc comment → "Caching pays off." |
| `lib/chat/rich-prompts/interactive.ts` | Reframe form (keep `name="contact"`) + doc comment |
| `components/chat/chip-deck.tsx` | Update `CHIP_BLURBS` (4 strings) |
| `lib/chat/chips.ts` | Update narrative-arc comment (cosmetic) |
| `lib/contact/web3forms.ts` | New field model: type, parse, validate, required-fields, email send |
| `lib/contact/auto-reply.ts` | New summary copy from `topic`/`message` |
| `components/chat/conversation.tsx` | **No change** — already iterates `CONTACT_REQUIRED_FIELDS` and calls the validators generically; adapts to the new field set automatically. Verified. |
| `lib/contact/web3forms.test.ts` | Rewrite fixtures + parse/validate/email assertions for `{name,email,topic,message}` |
| `lib/contact/auto-reply.test.ts` | Rewrite summary-copy assertions for the new `topic`/`message` openers |
| `app/api/chat/route.contact.test.ts` | Update the `contactSubmitRequest` fixture + the auto-reply body assertions ("Got it: you're hiring for…" → new copy); the "omits the question summary" case becomes a topic/message case |
| `app/api/chat/route.logout-session.test.ts` | Update contact-submit fixtures (lines ~143, ~194) to the new field shape |
| `components/chat/conversation.test.ts` | Update fixtures + the `/_errors/contact/roleType` assertion → `/_errors/contact/topic` (or `/message`) |
| `components/chat/conversation.dispatcher.test.ts` | Update the contact fixture (line ~208) to the new field shape |
| `lib/json-render/registry.test.tsx` | **Leave as-is** — uses `roleType` only as a generic Select field name in self-contained binding/error tests; not coupled to the contact schema |

## Integration risks & testing

- **Field rename ripples.** The contact field model is a shared contract across
  client validation, server parse, email send, and auto-reply. Change the type
  first and let the compiler surface every consumer; don't hand-hunt.
- **Preserve the `contact` contract.** `name="contact"`, the `submitForm` action,
  and the `interactive` chip lineage must stay intact or the round-trip and the
  anonymous rate-limit lineage break.
- **Targeted tests only.** Run the unit tests for the touched modules
  (`lib/contact/*`, `lib/chat/*`, `lib/json-render/*`). **Do not run the full
  suite** — it hits the real Neon prod DB. Use the arm64 node runner.
- **Catalog token ceiling.** Rich-prompt edits don't touch the system-prompt
  catalog, but if any change does, the ~6000-token ceiling test still guards it.
- **Verify the displayed numbers** (primitive count, model count, catalog tokens)
  against code before finalizing copy.

## Out of scope (YAGNI)

- No new chips, no layout/primitive changes, no icon or label changes.
- No live telemetry wiring for the dashboard/chart (illustrative is fine, and
  labeled as such).
- No change to the swap mechanism, auth, metering, or BYOK.
- The "live playground" form variant (considered and rejected in favor of
  keeping the contact round-trip).

## Decision to confirm at review

- **`message` becomes required** (it was an optional `question` before). If you'd
  rather keep it optional to reduce friction, say so and we'll relax the
  validator + rich-prompt accordingly.
