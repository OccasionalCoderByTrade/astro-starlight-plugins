# 05: Source doc semantics: `.mdoc`, `_` files, hidden from sidebar

**What to build:** Both sidebar plugins treat source docs the way the rest of the plugins do.
- **Source doc extensions:** they come from the existing helper that reads `astroConfig.integrations`, so `.mdoc` sidebar indexes and pages count only when Markdoc is installed. Without Markdoc, a `.mdoc` file is a docs asset.
- **`_` files:** a link to a `_`-prefixed file is left out with a warning that names the sidebar index and the link. In index-only, a `_` file is never an index. A `_`-prefixed folder still counts.
- **Hidden from sidebar:** `draft: true` or `sidebar.hidden: true`, the same in dev and build. `pagefind: false` no longer hides anything.

Warnings go through the logger Starlight passes to `config:setup`. The README for both plugins describes these rules, including that drafts are hidden in dev on purpose, unlike Starlight's draft rendering.

See the spec: User Stories 19-27, 57; Implementation Decisions › Hidden from sidebar, › Building a group (steps 6-8).

**Blocked by:** 03

**Status:** resolved

- [x] With Markdoc in `integrations`, `.mdoc` sidebar indexes and linked `.mdoc` pages become entries. Without it, they don't
- [x] A link to `./_partial.md` gives no entry and logs one warning naming the sidebar index and the link
- [x] A page under `_partials/` becomes an entry
- [x] `draft: true` hides the entry when `command` is `dev` and when it's `build`
- [x] `pagefind: false` alone doesn't hide an entry
- [x] A hidden sidebar index drops its whole group; a hidden root sidebar index drops its root group without an error
- [x] README updated for both sidebar plugins
- [x] `npm run lib:build` and `npm test` pass
