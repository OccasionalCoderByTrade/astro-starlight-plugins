---
status: accepted
---

# Debug output lives in Astro's codegen dir

Debug tex diagram images and the debug log are written under the directory Astro's `createCodegenDir()` gives the integration (`.astro/integrations/astro-latex-compile/`). `debug.outputDir` and `debug.logFile` are optional and, when given, must be non-empty relative paths that stay inside that directory. Absolute paths, `""`/`"."`, and anything resolving outside it are rejected at `astro:config:setup`. The integration owns this location, it is already gitignored in Astro projects, and it lets the build wipe debug tex diagram images at start without risk of touching a directory the user pointed somewhere unexpected.

The cost is discoverability: `.astro/` is hidden and some editors hide it from the file tree, so the integration logs the resolved debug directory once at startup. Moving the location was a breaking change (4.0.0): an existing relative `outputDir` silently moves under the codegen dir, and an absolute one now throws.

## Considered Options

- **Keep `debug.outputDir` as any path resolved against the project root.** Rejected: the integration can't know the directory is safe to wipe, and it has to be gitignored by hand.
- **Put the persisted tex diagram ledger in the same directory.** Not applicable: dev does not persist the ledger (see ADR-0002).
