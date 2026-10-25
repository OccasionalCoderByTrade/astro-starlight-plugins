# 03: LaTeX compile runs on Sätteri

**What to build:** on Astro 7's default processor, Sätteri, `tex compile` blocks render as compiled tex diagrams, the same as on `unified`, in both `.md` and `.mdx` docs. Site owners don't need any config to use LaTeX compile.

This adds a Sätteri mdast adapter over the core from ticket 02, and registers it through the helper as the `satteriPlugin`:

- It's a factory entry that reads each doc's `fileURL`.
- A `before` hook collects the doc's blocks and compiles them through the core.
- A `code` visitor replaces each block with the core's raw HTML, with MDX expressions off.
- An `after` hook records the doc in the ledger. Abandon is still guaranteed when something throws.

The tex inputs hash is a plain field on the mdast plugin object, so Astro's config digest keeps it.

**Blocked by:** 02

**Status:** resolved

- [x] Sätteri is no longer rejected at startup. Only processors other than `unified` and `satteri` are.
- [x] The spec's seam tests run under both processors with `describe.each`: compiled tex diagram, tex compile error with the right `file:line` (frontmatter included, confirming Sätteri also gets the body without frontmatter), "last `blockid` wins", ledger recording, `class`/`alt`/`mode` meta, and the build failing at `astro:build:done`.
- [x] The inlined `<svg>` markup is the same under both processors.
- [x] Changing a tex input file changes the hashed config under Sätteri too.
- [x] The README's LaTeX compile section has a processor support paragraph matching the heading IDs one: works with `unified()` and `satteri()`, position in `integrations` doesn't matter, and startup fails on any other processor or one replaced by a later integration.
- [x] Browser check on the demo site: `tex compile` blocks render as diagrams with the `markdown` block removed (Sätteri) and restored (`unified`), with no new console errors or warnings.
- [x] `npm test` and `npm run lib:build` pass.

**Implementation notes:**

- The mdast plugin is one plain object, not a per-doc factory. A function would drop out of the config JSON Astro hashes, and `texInputsHash` with it. `before` reads `fileURL` from the visitor context instead, and per-doc state is keyed by the per-compile `data` bag.
- No `after` hook. The core's `renderDoc` already begins, records and abandons the ledger entry itself.
- MDX: Sätteri re-parses a `raw` string in an MDX doc as MDX, so the diagram's CSS and text became Markdown paragraphs. MDX docs get prebuilt hast (parsed with parse5) instead. Each `<style>` also gets an empty comment child, because Astro's optimized MDX collapses an all-text `<style>` into `set:html` and then writes that out as a literal attribute.
- Follow-up: unified's optimized MDX has the same `set:html` problem with the remark adapter. It was already there before this ticket, and shows on the demo site. Its test is skipped on unified.
