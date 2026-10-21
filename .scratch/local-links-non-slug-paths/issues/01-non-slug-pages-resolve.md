# 01: Pages from non-slug docs resolve, and page-form links to them validate

**What to build:** A source doc with a non-slug path (`reference/List Syntax cOp&&Y.md`, or one inside `My Guide/`) builds and renders in dev without the "No source doc" error. A page-form link to it (`/reference/list-syntax-copy/`) passes link validation. Behind this, `astroLocalLinks` finds source docs through a source doc index (page path → source docs) instead of treating the page path as a file path. The index is built the way Astro computes default IDs and covers every file Starlight's docs glob loads. See the spec (`../spec.md`), ADR 0009 and the Local links terms in `CONTEXT.md`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Page paths: github-slugger `slug()` on each path segment, extension removed, trailing `/index` dropped (`Index.md` → its folder's page path, `v1.2-notes.md` → `/v12-notes/`)
- [ ] The index covers every docs extension Starlight loads (`.md`, `.mdx`, `.markdown`, `.mdown`, `.mkdn`, `.mkd`, `.mdwn`), excludes `_`-prefixed files, and includes drafts
- [ ] Page resolution and link targets both use the index; links to files in `public/` are checked as before
- [ ] Build constructs the index once; the dev middleware rebuilds it per request, so a source doc added between two requests is picked up
- [ ] The existing `x.md` + `x/index.md` ambiguity error still fires (it's reworked into a proper collision in 03)
- [ ] `github-slugger@^2.0.0` is a declared dependency; a test checks that the github-slugger Astro resolves has the same major version
- [ ] Tests written first, through the dev middleware seam and `astro:build:done`; existing tests still pass
- [ ] Demo doc `reference/List Syntax cOp&&Y.md` added, with a page-form link to it from another reference doc; checked in a browser (dev and build preview), with no console errors
- [ ] `npm run lib:build` passes; committed to the current branch
