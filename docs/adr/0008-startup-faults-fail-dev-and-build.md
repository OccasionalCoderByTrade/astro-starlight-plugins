---
status: accepted
---

# Startup faults fail both dev and build; dev re-sync faults only log

Where a plugin throws and where it only logs depends on when it finds the fault, not on what kind of error it is:

| When | Examples | Dev | Build |
|---|---|---|---|
| **Startup**: integration and Starlight config hooks, before any page is served | sidebar generation reading frontmatter and directories; `syncDocsToPublic`'s initial sync | throw: dev doesn't start | throw |
| **Incremental**: the file watcher, while dev is running | `syncDocsToPublic` re-syncing a saved file | log only | n/a |
| **Per page**: while a page renders | tex compile errors (ADR-0006), broken local links (ADR-0007) | shown in the page | fail at `astro:build:done` |

A startup fault leaves the site wrong for the whole session: a sidebar missing entries, or a `public/` that was half synced. That shows up later as an unrelated-looking symptom, such as a link reported broken because the file it points to was never copied. So a startup fault throws, even in dev, and dev waits for startup work such as the initial sync to finish. Fixing it means a restart, which costs little.

An incremental fault often comes from a file caught mid-edit, such as frontmatter that's half typed. Throwing there would stop the dev server on every bad save, so it's logged and the next save retries.

## Consequences

The sidebars are only built at startup, so bad frontmatter added while dev is running isn't reported until the next dev start or build.

## Considered Options

- **Throw only in build, warn in dev.** Rejected: dev would run with a wrong sidebar or a half-synced `public/`, and the warning gets lost in startup output.
- **Throw on incremental dev faults too.** Rejected: half-finished edits would keep stopping the dev server.
- **Show startup faults in the page, like tex compile errors.** Not possible: they happen before any page exists, and a sidebar fault affects every page.
