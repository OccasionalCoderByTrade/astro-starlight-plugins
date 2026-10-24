# 10: README breaking changes in 4.0.0 and JSDoc parity

**What to build:** A site author upgrading from 3.x finds one "Breaking changes in 4.0.0" list for the sidebar plugins in the README, and the plugins' JSDoc says the same as the README. The list covers:
- `maxDepthNesting` renamed to `maxGroupLevels`
- `pagefind: false` no longer hides entries
- `index.mdx` sub-indexes now expand (use the leaf key to keep the old behaviour)
- slugs are page paths
- labels prefer `sidebar.label`
- bad options and missing directories fail startup
- the corrected `indexMarker` docs
- the subpath imports

The README also notes that hidden from sidebar hides drafts in dev on purpose. Finish with a full check: `lib:build`, the test suite, and a browser check of the demo site's sidebar in dev (per CLAUDE.md "Verifying in a browser").

See the spec: Implementation Decisions › Docs; Further Notes.

**Blocked by:** 04, 05, 06, 07, 08, 09

**Status:** resolved

- [x] The README has one breaking-changes list covering every item above
- [x] The JSDoc for both sidebar plugins' options and functions matches the README
- [x] `npm run lib:build` and `npm test` pass
- [x] The demo site's sidebar renders in dev with no console errors or plugin warnings that aren't expected
