---
status: accepted, partly superseded by ADR 0011
---

> Where a raw doc is served is superseded by ADR 0011: raw docs are served by `astroServeDocsFiles`'s endpoint, not from `public/`. That raw doc links are never rewritten still stands.

# Raw doc links target the source in `public/` and are never rewritten

A raw doc link names a source doc with its extension (`./auto-list-syntax.md`). `astroLocalLinks` takes the author at their word: the link means the raw Markdown, not the page built from it. Link validation checks it like any other file in `public/`, and link normalization only makes it root-absolute, keeping the extension. Authors can link to a doc's source on purpose, for example to offer it for download, and copying it into `public/` is their job, by hand or with `syncDocsToPublic`.

Most authors who write one probably meant the page, so when the public copy is missing, the broken-link error says what a raw doc link means and how to link to the page instead. When the public copy exists, nothing is reported.

## Considered Options

- **Rewrite raw doc links to page paths, like file-form links (ADR 0009).** Rejected: it guesses the author meant the page, and leaves no way to link to a doc's source.
- **Warn on every raw doc link, even when its public copy exists.** Rejected: an author who linked to the source on purpose would see the warning on every build, with no way to turn it off short of a new option.
