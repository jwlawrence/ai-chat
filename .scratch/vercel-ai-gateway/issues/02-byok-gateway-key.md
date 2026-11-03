# 02: BYOK with a single AI Gateway key

**What to build:** A signed-in user opens settings, pastes one Vercel AI Gateway key, sees it
validated, and from then on every chat turn and title generation bills to that key with all
app models available and the quota walls bypassed. A user who still has an Azure-era record
in the browser sees BYOK as not configured and the stale record is removed.

**Blocked by:** 01

**Status:** done

- [x] The provider override is `{ apiKey }`; `getModel(id, override)` builds a gateway model with that key.
- [x] Chat requests carry only the key header; a request without it falls back to the app key.
- [x] `/api/byok/validate` accepts `{ key }`, answers 200 on success and 422 with the gateway's message on failure.
- [x] The browser record is `{ key }` under a new storage key; the legacy key is removed on load.
- [x] The settings page shows one key field and gateway copy; the `byokModelMissing` branch no longer exists.
- [x] Title generation uses the BYOK key whenever one is present.
- [x] BYOK unit tests, validate route tests, and chat-route BYOK tests pass.

## Comments

Test seams: `headersToOverride`/`recordToHeaders`, `loadByok`/`saveByok`,
`validateByokCredentials`, validate route, chat route with BYOK header.
