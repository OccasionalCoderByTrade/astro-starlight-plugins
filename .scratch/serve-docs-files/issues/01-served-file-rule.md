# 01: One served-file rule, applied to the current sync

**What to build:** One shared rule decides whether a path under the docs directory gets served. It leaves out drafts, every file or directory whose name starts with `_` or `.` (and everything under one), and `ignorePatterns` matches. Unparseable frontmatter is an error. The existing `syncDocsToPublic` uses it right away, so `_partial.md`, `_assets/` and `.obsidian/` stop being copied into `public/`, fixing the bug where `_`-prefixed files were served. This is the prefactor that the endpoint (04) and local-links in dev (08) build on. See the spec (`../spec.md`), ADR 0011 and the raw doc / docs asset terms in `CONTEXT.md`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] The rule lives in the shared utils and takes a path relative to the docs directory plus the plugin's `ignorePatterns`
- [x] Drafts (`draft: true`) are left out; docs assets next to a draft are still served; `sidebar.hidden` docs are still served
- [x] `_`- and `.`-prefixed files are left out, and so is everything under a `_`- or `.`-prefixed directory
- [x] Unparseable frontmatter throws, naming the file; the current sync's startup and dev-save behaviour around that error is unchanged
- [x] Both the full and incremental sync use the rule instead of their own draft/ignore checks
- [x] Tests cover each exclusion through the plugin's hooks, in the style of the existing dev-setup test
