# 04: README: non-slug filenames

**What to build:** A docs author reading the README's Local Links section learns how non-slug filenames behave. It explains that both page-form and file-form links work, that link normalization rewrites file-form links, and that slug filenames are still recommended. It also covers that page path collisions are errors, and that frontmatter `slug` and a custom `docsLoader({ generateId })` aren't supported. Then the whole feature gets a final check. See the spec (`../spec.md`) and ADR 0009.

**Blocked by:** 02 (File-form links), 03 (Page path collisions)

**Status:** resolved

- [x] README Local Links section has a "Non-slug filenames" subsection covering the points above, in the README's existing style
- [x] Full test suite passes
- [x] Final browser pass over the demo doc and the links to it, in dev and build preview, with no console errors
- [x] `npm run lib:build` passes; committed to the current branch
