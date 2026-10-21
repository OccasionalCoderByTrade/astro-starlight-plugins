---
status: accepted
---

# File-form links are accepted and rewritten to page paths

A source doc with a non-slug path (`reference/List Syntax.md`) is served at its page path (`/reference/list-syntax/`). An author linking to it has to pick between a file-form link, which their editor can follow but 404s in the browser, and a page-form link, which works in the browser but which the editor can't follow. `astroLocalLinks` accepts both. Link validation passes either form, and link normalization rewrites file-form links to page-form ones. Authors keep editor navigation and readers get working URLs.

A link only counts if it is exactly one of the two forms. A link that only matches after slugifying it (`/reference/LIST-syntax`) is broken, because the host serves only the exact page path. With link normalization off, a file-form link is broken too, since nothing would rewrite it.

## Consequences

- Page paths are computed with Astro's default slugging (github-slugger on each path segment). Frontmatter `slug` and a custom `docsLoader({ generateId })` aren't supported.
- Two source docs with the same page path (`Foo.md` and `foo.md`, or `x.md` and `x/index.md`) are an error, not a warning.

## Considered Options

- **Warn about non-slug paths and only accept page-form links.** Rejected: it keeps the trade-off between editor navigation and working URLs, and makes the author rename files to escape it.
- **Accept file-form links and also warn about non-slug paths.** Rejected: once both forms work, the only thing left to warn about is that URLs don't match filenames, which is cosmetic. The README recommends slug filenames instead.
