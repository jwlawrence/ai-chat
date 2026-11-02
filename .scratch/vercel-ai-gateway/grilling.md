# Grilling: Foundry → Vercel AI Gateway

Recorded design tree for the migration. The session ran unattended, so every question below
carries the recommended answer that was **adopted as an assumption**. Any of them can be
overturned; the spec and tickets will follow.

Facts were looked up, not asked (per the grilling discipline):

- `ai@6.0.175` already bundles `@ai-sdk/gateway@3.0.110` and re-exports `gateway`,
  `createGateway`, `GatewayModelId`. No new dependency is needed.
- The gateway's known-model union includes `openai/gpt-5.4`, `openai/gpt-5.4-mini`,
  `openai/gpt-5.3-codex`, `openai/o4-mini`: every Model id the app ships today.
- The provider reads `AI_GATEWAY_API_KEY` from the environment when no key is passed, and
  falls back to Vercel OIDC on Vercel deployments.
- Gateway requests accept `providerOptions.gateway.byok` (request-scoped upstream keys) and
  forward vendor namespaces such as `providerOptions.openai` upstream.
- `providerMetadata.gateway.cost` carries the USD inference cost per generation.
- The live catalog (`https://ai-gateway.vercel.sh/v1/models`) was **not reachable** from the
  sandbox, so current gateway list prices were not verified.

## Round 1

❓ **Q1 - Provider mechanism**: Build gateway models with `createGateway({ apiKey })` and a
required `AI_GATEWAY_API_KEY`, keeping today's fail-fast `required()` behaviour? The
alternative is the implicit global provider (plain string model ids + OIDC), which hides the
credential dependency and makes CI/test setup implicit.

➡️ Yes: explicit `createGateway`, key required. OIDC can be adopted later by making the key
optional.

---

❓ **Q2 - Model identity**: Keep the app's four Model ids exactly as they are and map each to
a Gateway slug (`openai/<id>`) at the `getModel` seam, so sessions, pricing, the picker and
the ledger are untouched?

➡️ Yes. The mapping is a one-line table; a Foundry "deployment name" is no longer a concept.

---

❓ **Q3 - BYOK shape**: Redefine BYOK as "bring your own Gateway key" (one field), instead of
porting the Azure shape (key + base URL + deployment map + api version) or wiring upstream
OpenAI keys through `providerOptions.gateway.byok`?

➡️ Yes. One credential, one provider path, every app model available to BYOK users, and the
quota bypass stays as is. Recorded as ADR-0002.

---

❓ **Q4 - Statelessness**: Keep sending `store: false`, now under the `openai` namespace that
the gateway forwards upstream, so the Responses API never depends on server-stored items?

➡️ Yes. It is cheap, documents the invariant, and avoids re-discovering the
`item_reference` 400 if the gateway's upstream default is `store: true`.

---

❓ **Q5 - Cost accounting**: Keep the local pricing table and `estimateCostUSD` as the ledger's
source of cost for this migration, and treat "use `providerMetadata.gateway.cost` as the
authoritative per-turn cost" as a separate follow-up?

➡️ Yes. The ledger schema and caps are unchanged by the provider swap; switching the cost
source is a product decision with its own tests.

## Round 2 (unblocked by Q3)

❓ **Q6 - Legacy BYOK records**: Discard Azure-era BYOK records in the browser (new storage
key, old key removed on first load) rather than migrating them?

➡️ Yes. They contain a secret that no longer works; migrating a base URL and deployment map
into a Gateway key is impossible anyway.

---

❓ **Q7 - BYOK validation**: Validate a user's Gateway key the same way as today, with one
tiny `generateText` on the default model, through the same `getModel` seam?

➡️ Yes. It proves the key is accepted by the gateway and that the model is reachable.

---

❓ **Q8 - Title generation under BYOK**: Always use the BYOK key for titles when the user has
one (there is no longer a "model missing from the deployment map" case)?

➡️ Yes.

## Round 3 (unblocked by Q1, Q2)

❓ **Q9 - Environment and CI**: Replace the three `AZURE_FOUNDRY_*` variables with
`AI_GATEWAY_API_KEY` everywhere (`.env.example`, README, CI), and remove `@ai-sdk/azure`?

➡️ Yes.

---

❓ **Q10 - Prompt-cache comments**: Keep the system-prompt structure (catalog prefix first)
and reword the Azure auto-cache comments to OpenAI prompt caching via the gateway?

➡️ Yes. The 1024-token prefix threshold is OpenAI's; nothing structural changes.

---

❓ **Q11 - Cutover**: Hand over the human-only steps (create the Gateway key, set it on the
Vercel project, remove the Azure variables, redeploy) as a committed wizard script?

➡️ Yes; the code change is a two-way door, the env swap is the only live action.

Frontier empty.
