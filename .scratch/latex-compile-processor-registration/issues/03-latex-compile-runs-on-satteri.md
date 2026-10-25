# 03: LaTeX compile runs on Sätteri

**What to build:** on Astro 7's default processor, Sätteri, `tex compile` blocks render as compiled tex diagrams, the same as on `unified`, in both `.md` and `.mdx` docs. Site owners don't need any config to use LaTeX compile.

This adds a Sätteri mdast adapter over the core from ticket 02, and registers it through the helper as the `satteriPlugin`:

- It's a factory entry that reads each doc's `fileURL`.
- A `before` hook collects the doc's blocks and compiles them through the core.
- A `code` visitor replaces each block with the core's raw HTML, with MDX expressions off.
- An `after` hook records the doc in the ledger. Abandon is still guaranteed when something throws.

The tex inputs hash is a plain field on the mdast plugin object, so Astro's config digest keeps it.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Sätteri is no longer rejected at startup. Only processors other than `unified` and `satteri` are.
- [ ] The spec's seam tests run under both processors with `describe.each`: compiled tex diagram, tex compile error with the right `file:line` (frontmatter included, confirming Sätteri also gets the body without frontmatter), "last `blockid` wins", ledger recording, `class`/`alt`/`mode` meta, and the build failing at `astro:build:done`.
- [ ] The inlined `<svg>` markup is the same under both processors.
- [ ] Changing a tex input file changes the hashed config under Sätteri too.
- [ ] The README's LaTeX compile section has a processor support paragraph matching the heading IDs one: works with `unified()` and `satteri()`, position in `integrations` doesn't matter, and startup fails on any other processor or one replaced by a later integration.
- [ ] Browser check on the demo site: `tex compile` blocks render as diagrams with the `markdown` block removed (Sätteri) and restored (`unified`), with no new console errors or warnings.
- [ ] `npm test` and `npm run lib:build` pass.
