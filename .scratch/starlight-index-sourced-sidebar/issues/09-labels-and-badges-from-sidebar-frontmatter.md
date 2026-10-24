# 09: Labels and badges from Starlight's sidebar frontmatter

**What to build:** Starlight's own sidebar frontmatter works with both sidebar plugins.
- **`starlightIndexSourcedSidebar`:** index entries and page entries are labelled `sidebar.label`, then `title`, then the label made from the filename. A page entry shows its `sidebar.badge`. An index entry shows the index marker when one is set, and otherwise its `sidebar.badge`. Groups keep their directory-name labels.
- **`starlightIndexOnlySidebar`:** with `dirnameDeterminesLabels: false`, it uses `sidebar.label`, then `title`. Its page entries show `sidebar.badge`. With `true`, it keeps directory names.

The README for both plugins describes the label and badge rules.

See the spec: User Stories 50-53, 59-60; Implementation Decisions › Slugs, labels and badges.

**Blocked by:** 03

**Status:** resolved

- [x] `sidebar.label` beats `title` on page entries and index entries in the index-sourced sidebar
- [x] `sidebar.badge` shows on a page entry. On an index entry it shows only when no index marker is set
- [x] Group labels are unchanged
- [x] Index-only with `dirnameDeterminesLabels: false` uses `sidebar.label`, then `title`, and shows `sidebar.badge`
- [x] README updated for both sidebar plugins
- [x] `npm run lib:build` and `npm test` pass
