# Plan: json-render UI in chat

> Source PRD: interactive UI rendered inline in chat via a single `renderUI` tool that emits a json-render spec. ~15 generic primitives in v1. Three action modes: model, local, endpoint.

## Architectural decisions

Durable choices that apply across all phases.

- **Library**: [json-render](https://json-render.dev) with `@json-render/core` + `@json-render/react`. Adjacency-list spec (`{ root, elements }`) emitted by the model.
- **Tool shape**: one `renderUI(spec)` tool, server-defined alongside the existing `webSearch` tool. Per-component tools are *not* used — json-render's graph model requires a unified spec.
- **One render per turn**: enforced via `streamText`'s `prepareStep`, which strips `renderUI` from the toolset after its first invocation in a step chain. Other tools remain available in the same chain.
- **Render replaces text**: when the model uses `renderUI`, the rendered card *is* the assistant turn — no separate text bubble. Contextual narrative must live inside the spec (`Heading`, `Callout`, etc.). Steering lives in `SYSTEM_PROMPT`.
- **Streaming UX**: nothing renders until the tool input is fully streamed (`input-available`). The existing "Thinking…" spinner stays visible during input streaming.
- **Validation**: `renderUI.execute` validates the spec envelope (Zod) and then runs a secondary catalog-props validation pass. Invalid spec → tool error → model retries within the existing `stepCountIs(5)` budget. Catalog Zod schemas are *not* part of the outer tool input schema; they are enforced as a follow-up pass.
- **Catalog as source of truth**: components, their prop schemas, and action declarations all live in a single catalog. `catalog.prompt()` text is appended to the `renderUI` tool's description, not to `SYSTEM_PROMPT`.
- **Action modes** (per-action tag in the catalog):
  - `local` — pure client-side; mutates json-render `StateProvider` state scoped to the rendered subtree. Model never sees the press.
  - `model` — fires a synthetic `role: 'user'` turn carrying both a styled chip in the transcript and an injected text representation for the model. **Card locks the instant the press is issued** to preempt double-fire.
  - `endpoint` — POST to a convention-routed `/api/actions/<name>` with action params. Toast via `sonner` on failure only; silent on success. **Card stays unlocked** so the user can re-press (e.g., refetch).
- **Routes**:
  - Existing: `POST /api/chat` — adds `renderUI` to its `tools` registration and adds a `prepareStep` to enforce one render per turn.
  - New: `POST /api/actions/[action]` — catch-all route handler for endpoint-mode actions.
- **Schema (DB)**: no schema changes. `renderUI` calls persist as ordinary tool-call parts in the existing `messages.parts` JSONB column. Reloading restores the rendered card from history.
- **State**:
  - Per-card lock state lives client-side only, keyed by spec `root` id. Resets on reload (a locked card whose lock was held in memory becomes interactive again after reload — acceptable for v1).
  - Form state lives in json-render's `StateProvider`, scoped to the rendered subtree. Stable across model emissions to the *same* `root` id (we patch props rather than remounting). Lost on full page reload — no sessionStorage / DB drafts in v1.
- **Auth**: none. Single-user app; `/api/actions/*` is open to anyone with the URL.
- **Composer behavior**: during a synthetic-press turn, the composer is disabled exactly as it is for any other in-flight turn (existing `isBusy` logic). No special-casing.

---

## Phase 1: Catalog + render-only baseline

**User stories**: model can emit a rich UI card in chat in place of a plain text response, using the full primitive catalog.

### What to build

End-to-end vertical slice that delivers the model's ability to render any UI it wants, with no action wiring yet. All ~15 primitives ship in this phase so the catalog is complete from day one; interactive primitives (Tabs, Accordion, Input) work via their *native* React state but do not yet emit json-render actions. The tracer cuts through tool definition, validation, route wiring, conversation rendering, and system prompt steering.

Catalog: `Card`, `Heading`, `Text`, `Image`, `Link`, `Button`, `List`, `Input`, `Select`, `Checkbox`, `Form`, `Tabs`, `Accordion`, `Callout`, `Badge`, `Divider`. Components are thin shadcn wrappers.

### Acceptance criteria

- [ ] `@json-render/core` and `@json-render/react` installed; catalog defines all 15 primitives with Zod prop schemas.
- [ ] React registry maps every catalog component to a shadcn-styled implementation.
- [ ] `renderUI` tool registered in `/api/chat` with a Zod envelope schema and `prepareStep` that removes the tool after first use.
- [ ] Tool description includes `catalog.prompt()` text so the model knows what's available.
- [ ] Spec validation runs server-side: envelope Zod first, then catalog-props validation pass. Invalid spec returns a tool error.
- [ ] Conversation renderer detects `tool-renderUI` parts and renders them via json-render's `Renderer`.
- [ ] System prompt nudges the model to prefer `renderUI` when UI improves comprehension and to keep narrative *inside* the spec.
- [ ] Demo: ask the model to render a layout combining several primitives (heading, text, image, list, badges) — card materializes after streaming completes, no text bubble.

---

## Phase 2: Local-mode actions

**User stories**: user interacts with rendered UI without involving the model (toggle a section, switch a tab driven by a button, expand/collapse).

### What to build

Introduce the action mode tagging in the catalog (`mode: 'local' | 'model' | 'endpoint'`) but only wire the `local` path. Local actions mutate shared state in json-render's `StateProvider`, which other primitives in the same render can read. This is distinct from a component's *native* React state (which already works from Phase 1) — local actions are the catalog's declarative state-mutation channel.

### Acceptance criteria

- [ ] Catalog action definitions carry a `mode` discriminator.
- [ ] `ActionProvider` wired in the conversation renderer; local-mode actions dispatch through json-render's emit → handler chain.
- [ ] At least one demonstrable local action — e.g., a Button that toggles a Boolean in StateProvider, read by another primitive in the same spec to show/hide content.
- [ ] Local-mode press does *not* lock the card. Repeated presses keep working.
- [ ] Model never sees local presses (no synthetic turn, no persistence beyond the original render).

---

## Phase 3: Model-mode actions

**User stories**: user presses a button that the model needs to know about, triggering a new turn.

### What to build

Per-card lock state lives client-side keyed by spec `root` id. Model-mode actions dispatch through the action router to `useChat`'s `sendMessage`, producing a synthetic `role: 'user'` turn that carries both a chip rendered in the transcript and a text injection seen by the model. The card locks the instant the press is issued (preempting double-fire), independent of when the model's response arrives.

### Acceptance criteria

- [ ] Action router dispatches `mode: 'model'` presses to `sendMessage` with a structured user message: styled chip part + text injection part.
- [ ] Conversation renders the chip as a styled bubble distinct from a normal user message ("You pressed: <action label> — <params summary>").
- [ ] Card lock state turns the originating card inert (model-mode buttons greyed, no further model-mode presses fire) the moment a press is issued. Local-mode actions on the same card continue to work.
- [ ] Model receives the press via text injection and produces a normal next-turn response (text or another `renderUI`).
- [ ] Demo: model renders a card with a "Continue" model-mode button → user clicks → chip appears in transcript → card greys → model responds with a new card.

---

## Phase 4: Endpoint-mode actions

**User stories**: user presses a button that fires a backend operation without involving the model (save, refresh, mark-done).

### What to build

Catch-all route handler at `app/api/actions/[action]/route.ts` receives POSTs from endpoint-mode presses. The action router dispatches `mode: 'endpoint'` presses via `fetch` to the conventional URL with action params in the body. Toast on failure only; silent on success. The card does *not* lock — endpoint presses can be re-fired for refetch-style use cases.

### Acceptance criteria

- [ ] `app/api/actions/[action]/route.ts` catch-all exists; dispatches by `action` name (one handler per action defined adjacent to the catalog, or registered via a manifest).
- [ ] Action router dispatches `mode: 'endpoint'` presses via `fetch('/api/actions/<name>', { method: 'POST', body: params })`.
- [ ] Failure (network error or non-2xx) raises a `sonner` toast with a sensible message. Success is silent.
- [ ] Card stays interactive — repeated endpoint-mode presses fire repeated POSTs.
- [ ] Demo: model renders a card with a "Refresh data" endpoint-mode button → press hits `/api/actions/refreshData` → server returns 200 → no UI change beyond a brief in-flight state on the button → press again works.

---

## Phase 5: Form submission

**User stories**: user fills and submits a form whose values are delivered to the model.

### What to build

Wire `Input`, `Select`, `Checkbox`, and `Form` (already present in the Phase 1 catalog) to the json-render `StateProvider` for in-progress values. State is stable across model emissions to the same `root` id (we patch props rather than remount the subtree). On submit, the action receives current form values as params; the card visually updates to display the submitted values (using the existing model-mode lock from Phase 3); the model receives the values via text injection.

### Acceptance criteria

- [ ] In-progress form input is held in StateProvider, not just native React state, so the values are reachable from the submit action handler.
- [ ] Streaming a `renderUI` with the same `root` id while the user is typing patches props without resetting input state.
- [ ] Submit action (model-mode by default) packs current form values into the action params payload.
- [ ] On submit, the card re-renders with the submitted values visible (locked).
- [ ] Model receives a `[Submitted form <name>: {...}]`-style text injection along with the chip; can respond contextually.
- [ ] Reload mid-form clears in-progress state (acceptable for v1).

---

## Phase 6: Polish and testing

**User stories**: the feature is robust, observable, and reliably steered.

### What to build

Tests, system prompt tightening, and edge-case handling. No new user-visible features.

### Acceptance criteria

- [ ] Unit tests for catalog Zod schemas (round-trip fixture specs through validation).
- [ ] Unit tests for `renderUI.execute`: accepts a valid spec, rejects an invalid envelope, rejects valid envelope with invalid catalog props, surfaces the right error shape for the model to recover.
- [ ] Unit tests for the action router: each mode dispatches to the correct handler with the correct payload.
- [ ] Unit tests for per-card lock state: model-mode press locks; local-mode press does not; endpoint-mode press does not.
- [ ] Unit tests for form-state stability: a spec patch to the same `root` id preserves in-progress input.
- [ ] System prompt expanded with composition examples (when to nest, when to use `Form` vs raw `Input` rows, how to express "headline + list of items").
- [ ] Manual verification of the streaming UX: long `renderUI` input streams keep the "Thinking…" spinner up; card materializes only on `input-available`.
- [ ] Manual verification of the recovery loop: a deliberately broken catalog-prop value produces a tool error and the model self-corrects within `stepCountIs(5)`.
- [ ] One-line measurement of `catalog.prompt()` token cost added per request; logged in dev for awareness.
