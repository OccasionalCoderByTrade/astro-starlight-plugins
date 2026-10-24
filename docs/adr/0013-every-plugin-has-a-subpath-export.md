---
status: accepted
---

# Every plugin has its own subpath export

Every plugin gets a tsup entry (`plugins/<name>`) and a matching `package.json` export (`./<name>`), on top of being re-exported from the root `"."` entry. The root entry imports every plugin, so importing any one plugin from it also loads the imports of all the others. `@astrojs/starlight` and `@expressive-code/core` are optional peer dependencies, so a consumer without one of them can break just by importing an unrelated plugin from the root. The subpath is the only import that loads one plugin's dependencies and nothing else, so every plugin needs one, and the README shows the subpath import.

## Consequences

- Internal sibling modules that a plugin loads by `new URL(..., import.meta.url)`, such as `page-script`, `dev-middleware` and `route`, get a tsup entry but no export, so they don't become public API.
- A test checks that every plugin's tsup entry has an export and every export has an entry, so the two lists can't drift.
- A subpath is public API, so renaming or removing one is a breaking change.

## Considered Options

- **Root export only.** Rejected: it ties every consumer to every plugin's dependencies.
- **Subpath exports optional per plugin.** Rejected: this was the earlier rule, and it let `starlight-index-sourced-sidebar` ship without a subpath and `expressive-code-emphasis` ship a tsup entry with no export.
