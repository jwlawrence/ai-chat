# 03: Docs, copy, and the live cutover

**What to build:** Every place a human reads about the provider says AI Gateway: README,
PRODUCT.md, env example, settings copy, and code comments about caching and pricing. The
operator can run one script that walks them through creating the Gateway key, setting it on
the Vercel project, removing the Azure variables, and redeploying.

**Blocked by:** 01, 02

**Status:** done

- [x] README setup and env-var sections describe `AI_GATEWAY_API_KEY` and the gateway.
- [x] PRODUCT.md operating context and the pricing note reference the gateway.
- [x] Comments in the system prompt, catalog, pricing, and on-finish modules no longer mention Azure/Foundry as the provider.
- [x] A committed, `bash -n`-clean cutover wizard exists under `scripts/` and is linked from the README.
- [x] Full test suite green.
