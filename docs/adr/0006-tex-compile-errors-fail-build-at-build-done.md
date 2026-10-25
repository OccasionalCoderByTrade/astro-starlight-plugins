---
status: accepted
---

# Tex compile errors fail the build from `astro:build:done`

> 2026-10-25: since ADR 0017, "the transformer" below is the processor-agnostic core, which both the remark adapter (`unified`) and the Sätteri adapter call. The core records and rethrows as described here, so the rule holds on either processor.

Astro's `glob()` loader, which Starlight's `docsLoader` wraps, renders each Markdown entry inside a try/catch that only logs `Error rendering <entry>: <message>` and stores the entry with no rendered HTML. Remark plugins run inside that render, so throwing from the transformer doesn't fail `astro build`; it ships the page with an empty body and exits 0.

So the transformer doesn't throw for a tex compile error in a block. It shows the error in the page in place of the compiled tex diagram, logs the full report, and records the block's `file:line` in state shared with the integration. A throw from the transformer outside any one block is recorded against the doc and then rethrown. `astro:build:done`, which runs outside the loader, throws one error listing every recorded tex compile error, together with any missing toolchain. It skips the orphan sweep when it throws, since a failed block references no compiled tex diagram and its last good one would be deleted.

The build still renders every page before failing, so one run reports every tex compile error, not just the first.

## Considered Options

- **Throw from the transformer.** Rejected: Astro's loader swallows it, as above. (`.mdx` is compiled later through Vite, where a throw does fail the build, but `.md` is the common case.)
- **`process.exit(1)` on the first tex compile error**, as dev does for a missing toolchain. Rejected: one run only ever shows one error, and the full build output is lost mid-write.
- **An option to keep building with error blocks in the page.** Not added: a page showing a tex compile error shouldn't ship, and an opt-out can be added later without breaking anyone.
