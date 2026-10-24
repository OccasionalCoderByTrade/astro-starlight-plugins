# 03: Shared sidebar helpers, adopted by index-only too

**What to build:** Both sidebar plugins use one set of helpers from the shared utils, so they can't drift apart. Plugins never import each other. The helpers:
- the label made from a path segment
- slug normalization (drop a trailing `/index`)
- finding a directory's sidebar index for a given list of source doc extensions
- the sidebar item types
- the hidden from sidebar check
- the `_` filename check

The hidden check and the `_` check can arrive here with today's behaviour and be changed in 05. `starlightIndexOnlySidebar` also reads its docs root from `srcDir`, and its tests move onto its `config:setup` hook in the same way as 02. No other behaviour changes.

See the spec: Implementation Decisions › Shared utils.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Neither sidebar plugin defines its own copy of the shared helpers or types
- [ ] `starlightIndexOnlySidebar` builds on a site with a custom `srcDir`
- [ ] `starlightIndexOnlySidebar` tests run through its `config:setup` hook
- [ ] The sidebar output of both plugins is unchanged for the existing cases
- [ ] `npm run lib:build` and `npm test` pass
