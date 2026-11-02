# AI Chat

A single-user-first chat whose model answers by composing live interactive UI. This glossary
is the shared language for the product surface and the model-provider seam.

## Language

### Model provider

**AI Gateway**:
Vercel's hosted model router that the app calls for every model turn. The only model
provider the app talks to.
_Avoid_: Foundry, Azure, "the provider", OpenAI (the upstream vendor, not what we call)

**Model id**:
The app's own short name for a model (for example `gpt-5.4-mini`); it is what sessions store
and what the UI shows.
_Avoid_: deployment name, deployment

**Gateway slug**:
The `vendor/model` string the AI Gateway addresses a model by; each Model id maps to exactly
one.
_Avoid_: model string, gateway id

**Gateway key**:
A Vercel AI Gateway API key. The app has one of its own; a signed-in user may supply their
own instead.
_Avoid_: API key (ambiguous), token

**BYOK**:
A signed-in user supplying their own Gateway key so their turns bill to their Vercel account
instead of the app's budget.
_Avoid_: bring your own deployment, custom endpoint

**Stateless turn**:
A model call that carries the full conversation window in the request and relies on no
server-side conversation state at the provider.
_Avoid_: stored response, conversation id

### Product surface

**renderUI**:
The model-facing tool that emits a UI spec.

**Spec**:
A `{ root, elements }` JSON document the model emits and the app renders.

**Card**:
A rendered spec inside the transcript.

**Server card**:
A spec the server injects into the stream without a model call.

**Chip**:
One of the four curated prompts that are the anonymous visitor's entire input vocabulary.

**Actor**:
The billing identity for a turn: a signed-in `user` or an anonymous cookie id.

**Usage ledger**:
The Postgres record of every billed turn's tokens and estimated cost, which the budget caps
read.
