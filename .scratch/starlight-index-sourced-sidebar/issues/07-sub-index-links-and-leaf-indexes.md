# 07: Sub-index links and leaf indexes

**What to build:** In `starlightIndexSourcedSidebar`, the file extension no longer decides whether a sub-index link expands.
- **Expanding:** a sub-index link to a sidebar index of any source doc extension expands into a nested group, unless the target's frontmatter has `indexSourcedSidebar: { leaf: true }`. A leaf index becomes a single entry with the index marker. The leaf key is ignored on a root sidebar index.
- **Folder links:** `./sub/` is a sub-index link to `sub/index.*`. If `sub/` has no sidebar index, it warns and is skipped, with no fallback to `sub.md`.
- **Cycles and duplicates:** cycle protection follows only the current chain of sidebar indexes, so a sub-index link to an ancestor is skipped with a warning. A directory or page linked from several sidebar indexes appears under each of them.

The README explains leaf indexes, folder links, and that `index.mdx` sub-indexes now expand, with the leaf key as the way to keep the old behaviour.

See the spec: User Stories 28-35, 54-56; Implementation Decisions › Building a group (step 5 and the paragraphs after the steps).

**Blocked by:** 05

**Status:** resolved

- [x] `./sub/index` to an `index.mdx` (and to an `index.mdoc` with Markdoc) gives a nested group
- [x] A sub-index with the leaf key gives one entry carrying the index marker, and its links don't appear
- [x] The leaf key on a root sidebar index is ignored
- [x] `./sub/` gives the same group as `./sub/index`. With no `sub/index.*` but a `sub.md`, it warns and adds nothing
- [x] A link back to an ancestor sidebar index warns and doesn't recurse
- [x] A directory linked from two sidebar indexes appears under both
- [x] README updated
- [x] `npm run lib:build` and `npm test` pass
